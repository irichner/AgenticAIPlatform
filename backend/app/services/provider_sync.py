"""Validate API provider keys and sync available models from each provider."""
from __future__ import annotations
import re
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_provider import ApiProvider
from app.models.ai_model import AiModel
from app.schemas.api_provider import ApiProviderConnect


class ProviderAuthError(Exception):
    pass


class ProviderNetworkError(Exception):
    pass


class ProviderUnknownError(Exception):
    pass


_DISPLAY_NAMES: dict[str, str] = {
    "anthropic":     "Anthropic",
    "openai":        "OpenAI",
    "groq":          "Groq",
    "xai":           "xAI (Grok)",
    "openrouter":    "OpenRouter",
    "mistral":       "Mistral AI",
    "together ai":   "Together AI",
    "fireworks ai":  "Fireworks AI",
    "deepseek":      "DeepSeek",
    "cerebras":      "Cerebras",
    "nvidia nim":    "NVIDIA NIM",
    "scaleway":      "Scaleway",
    "github models": "GitHub Models",
    "cohere":        "Cohere",
}

# Default base URLs for each provider
_PROVIDER_BASES: dict[str, str] = {
    "anthropic":     "https://api.anthropic.com/v1",
    "openai":        "https://api.openai.com/v1",
    "groq":          "https://api.groq.com/openai/v1",
    "xai":           "https://api.x.ai/v1",
    "openrouter":    "https://openrouter.ai/api/v1",
    "mistral":       "https://api.mistral.ai/v1",
    "together ai":   "https://api.together.xyz/v1",
    "fireworks ai":  "https://api.fireworks.ai/inference/v1",
    "deepseek":      "https://api.deepseek.com/v1",
    "cerebras":      "https://api.cerebras.ai/v1",
    "nvidia nim":    "https://integrate.api.nvidia.com/v1",
    "scaleway":      "https://api.scaleway.ai/v1",
    "github models": "https://models.inference.ai.azure.com",
    "cohere":        "https://api.cohere.com/v2",
}

# Providers that do not support dynamic model listing — validated via a test request
_STATIC_ONLY: set[str] = {"nvidia nim", "scaleway", "github models"}

# Static model lists for providers that don't support /models
_STATIC_FALLBACK: dict[str, list[dict]] = {
    "nvidia nim": [
        {"id": "meta/llama-3.3-70b-instruct",             "name": "Llama 3.3 70B"},
        {"id": "nvidia/llama-3.1-nemotron-ultra-253b-v1",  "name": "Llama Nemotron Ultra 253B"},
        {"id": "mistralai/mistral-large-2-instruct",       "name": "Mistral Large 2"},
    ],
    "scaleway": [
        {"id": "llama-3.3-70b-instruct",     "name": "Llama 3.3 70B"},
        {"id": "mistral-nemo-instruct-2407",  "name": "Mistral Nemo"},
        {"id": "llama-3.1-8b-instruct",       "name": "Llama 3.1 8B"},
    ],
    "github models": [
        {"id": "gpt-4o",                             "name": "GPT-4o"},
        {"id": "phi-4",                              "name": "Phi-4"},
        {"id": "meta-llama/Llama-3.3-70B-Instruct", "name": "Llama 3.3 70B"},
        {"id": "mistral-large",                      "name": "Mistral Large"},
    ],
}

# Known context windows for models where the provider doesn't return them
_KNOWN_CONTEXT: dict[str, int] = {
    "gpt-4o":           128_000,
    "gpt-4o-mini":       128_000,
    "gpt-4-turbo":      128_000,
    "o1":               200_000,
    "o1-mini":          128_000,
    "o3-mini":          200_000,
    "deepseek-chat":    128_000,
    "deepseek-reasoner": 128_000,
    "command-r-plus":   128_000,
    "command-r":        128_000,
    "command":           4_096,
}

# Substrings that mark non-chat models across all providers
_NON_CHAT_TOKENS = (
    "whisper", "davinci", "babbage", "curie", "text-", "dall-e", "tts-",
    "-tts", "embedding", "embed-", "-embed", "moderation", "realtime", "audio",
    "transcri",
)


def _is_chat_model(model_id: str) -> bool:
    """Return True only if model_id looks like a chat/completion model."""
    m = model_id.lower()
    return not any(tok in m for tok in _NON_CHAT_TOKENS)


def _format_model_name(model_id: str) -> str:
    name = model_id.split("/")[-1]
    name = re.sub(r"[-_]", " ", name)
    # Capitalise first letter of each word, preserve digit runs
    return re.sub(r"[A-Za-z]+", lambda m: m.group(0).capitalize(), name)


def _infer_capabilities(model_data: dict[str, Any]) -> list[str]:
    mid = (model_data.get("id") or "").lower()

    # Non-chat modalities — return without "chat" so get_active_llm skips them
    if any(tok in mid for tok in ("whisper", "tts-", "-tts", "transcri", "audio")):
        return ["audio"]
    if any(tok in mid for tok in ("embedding", "embed-", "-embed")):
        return ["embedding"]
    if any(tok in mid for tok in ("dall-e", "image-gen", "stable-diffusion")):
        return ["image"]

    # Chat models — may also support vision / code
    caps = ["chat"]
    if any(x in mid for x in ("vision", "vl", "visual", "multimodal", "omni")):
        caps.append("vision")
    if any(x in mid for x in ("code", "coder", "codestral", "starcoder")):
        caps.append("code")
    return caps


def _parse_models(raw: list[dict], provider: str) -> list[dict]:
    """Normalise raw model objects from any provider into our internal format."""
    out: list[dict] = []
    for m in raw:
        model_id: str = m.get("id") or m.get("name") or ""
        if not model_id:
            continue

        # Skip non-chat models (audio, embedding, image-gen) for all providers
        if not _is_chat_model(model_id):
            continue

        display = (
            m.get("display_name")
            or m.get("name")
            or _format_model_name(model_id)
        )
        ctx = (
            m.get("context_window")
            or m.get("context_length")
            or m.get("max_context_length")
            or _KNOWN_CONTEXT.get(model_id)
        )
        out.append({
            "id":             model_id,
            "name":           display,
            "context_window": ctx,
            "capabilities":   _infer_capabilities(m),
        })

    return sorted(out, key=lambda m: m["name"].lower())


async def _validate_static_provider(name: str, api_key: str, base: str) -> None:
    """Hit a lightweight endpoint to verify the key for static-list providers."""
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(connect=8.0, read=10.0, write=5.0, pool=5.0)) as client:
            resp = await client.get(f"{base}/models", headers=headers)
            if resp.status_code == 401:
                raise ProviderAuthError("Invalid API key")
            if resp.status_code not in (200, 404):
                # 404 is OK — endpoint may not exist but key was accepted
                resp.raise_for_status()
    except (httpx.TimeoutException, httpx.ConnectError) as exc:
        raise ProviderNetworkError(f"Could not reach {base}") from exc


async def fetch_provider_models(
    name: str,
    api_key: str,
    base_url: str | None = None,
) -> list[dict]:
    """Validate key and return a normalised model list for a provider.

    Raises ProviderAuthError on bad key, ProviderNetworkError on connectivity
    issues, and ProviderUnknownError for unsupported providers.
    """
    p = name.lower().strip()
    base = (base_url or _PROVIDER_BASES.get(p, "")).rstrip("/")

    if not base:
        raise ProviderUnknownError(f"Unknown provider '{name}'")

    # Providers with static model lists — just validate the key
    if p in _STATIC_ONLY:
        await _validate_static_provider(p, api_key, base)
        models = _STATIC_FALLBACK.get(p, [])
        return [
            {
                "id":             m["id"],
                "name":           m["name"],
                "context_window": _KNOWN_CONTEXT.get(m["id"]),
                "capabilities":   _infer_capabilities(m),
            }
            for m in models
        ]

    # Dynamic fetch
    if p == "anthropic":
        headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01"}
    else:
        headers = {"Authorization": f"Bearer {api_key}"}

    # Explicit per-phase timeouts: fast connect fail + generous read for large model lists
    _timeout = httpx.Timeout(connect=8.0, read=15.0, write=5.0, pool=5.0)
    try:
        async with httpx.AsyncClient(timeout=_timeout) as client:
            resp = await client.get(f"{base}/models", headers=headers)
            if resp.status_code == 401:
                raise ProviderAuthError("Invalid API key")
            resp.raise_for_status()
            data = resp.json()
    except ProviderAuthError:
        raise
    except httpx.TimeoutException as exc:
        raise ProviderNetworkError(f"Timed out connecting to {base}") from exc
    except httpx.ConnectError as exc:
        raise ProviderNetworkError(f"Could not connect to {base}") from exc
    except httpx.HTTPStatusError as exc:
        raise ProviderNetworkError(
            f"Provider returned {exc.response.status_code}"
        ) from exc

    # Normalise response shape — some providers return a list, others wrap in {"data": [...]}
    raw: list[dict] = data if isinstance(data, list) else data.get("data", [])
    return _parse_models(raw, p)


async def sync_provider(db: AsyncSession, provider: ApiProvider) -> ApiProvider:
    """Refresh models for an existing provider. Updates status and last_synced_at."""
    try:
        models = await fetch_provider_models(
            provider.name, provider.api_key, provider.base_url
        )
    except ProviderAuthError:
        provider.status = "invalid"
        provider.updated_at = datetime.now(timezone.utc)
        await db.commit()
        # Cascade delete handled by FK; explicitly clear auto-managed models
        await db.execute(
            delete(AiModel).where(
                AiModel.provider_id == provider.id,
                AiModel.is_auto_managed == True,  # noqa: E712
            )
        )
        await db.commit()
        await db.refresh(provider)
        return provider
    except (ProviderNetworkError, ProviderUnknownError):
        provider.status = "error"
        provider.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(provider)
        return provider

    # Upsert: preserve enabled state on existing models, only reset it for new ones
    result = await db.execute(
        select(AiModel).where(
            AiModel.provider_id == provider.id,
            AiModel.is_auto_managed == True,  # noqa: E712
        )
    )
    existing_map = {m.model_id: m for m in result.scalars().all()}
    incoming_ids = {m["id"] for m in models}

    # Remove models that disappeared from the provider catalog
    for model_id, model in existing_map.items():
        if model_id not in incoming_ids:
            await db.delete(model)

    # Update existing models (keep enabled), insert new ones (start disabled)
    for m in models:
        if m["id"] in existing_map:
            row = existing_map[m["id"]]
            row.name = m["name"]
            row.context_window = m.get("context_window")
            row.capabilities = m.get("capabilities")
        else:
            db.add(AiModel(
                org_id=provider.org_id,
                provider_id=provider.id,
                name=m["name"],
                type="api",
                provider=provider.name,
                model_id=m["id"],
                context_window=m.get("context_window"),
                capabilities=m.get("capabilities"),
                is_auto_managed=True,
                enabled=False,
            ))

    provider.status = "connected"
    provider.last_synced_at = datetime.now(timezone.utc)
    provider.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(provider)
    return provider


async def connect_provider(
    db: AsyncSession,
    payload: ApiProviderConnect,
    org_id: "UUID | None" = None,
) -> ApiProvider:
    """Validate key, create/update provider record, and sync models."""
    name = payload.name.lower().strip()

    # Validate before touching the DB
    models = await fetch_provider_models(name, payload.api_key, payload.base_url)

    display_name = _DISPLAY_NAMES.get(name, name.title())

    stmt = select(ApiProvider).where(ApiProvider.name == name)
    if org_id is not None:
        stmt = stmt.where(ApiProvider.org_id == org_id)
    result = await db.execute(stmt)
    provider = result.scalar_one_or_none()

    if provider is None:
        provider = ApiProvider(
            org_id=org_id,
            name=name,
            display_name=display_name,
            api_key=payload.api_key,
            base_url=payload.base_url,
            status="connected",
            last_synced_at=datetime.now(timezone.utc),
        )
        db.add(provider)
        await db.flush()
    else:
        provider.api_key = payload.api_key
        provider.base_url = payload.base_url
        provider.display_name = display_name
        provider.status = "connected"
        provider.last_synced_at = datetime.now(timezone.utc)
        provider.updated_at = datetime.now(timezone.utc)
        await db.flush()

    # Upsert: preserve enabled state on existing models, only reset it for new ones
    existing_result = await db.execute(
        select(AiModel).where(
            AiModel.provider_id == provider.id,
            AiModel.is_auto_managed == True,  # noqa: E712
        )
    )
    existing_map = {m.model_id: m for m in existing_result.scalars().all()}
    incoming_ids = {m["id"] for m in models}

    for model_id, model in existing_map.items():
        if model_id not in incoming_ids:
            await db.delete(model)

    for m in models:
        if m["id"] in existing_map:
            row = existing_map[m["id"]]
            row.name = m["name"]
            row.context_window = m.get("context_window")
            row.capabilities = m.get("capabilities")
        else:
            db.add(AiModel(
                org_id=org_id,
                provider_id=provider.id,
                name=m["name"],
                type="api",
                provider=name,
                model_id=m["id"],
                context_window=m.get("context_window"),
                capabilities=m.get("capabilities"),
                is_auto_managed=True,
                enabled=False,
            ))

    await db.commit()
    await db.refresh(provider)
    return provider


async def sync_all_providers(db: AsyncSession) -> None:
    """Refresh models for all connected providers. Called daily by the scheduler."""
    result = await db.execute(
        select(ApiProvider).where(ApiProvider.status.in_(["connected", "error"]))
    )
    for provider in result.scalars().all():
        await sync_provider(db, provider)
