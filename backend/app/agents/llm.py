"""LLM factory — returns a LangChain chat model from the first enabled AiModel in the DB."""
from __future__ import annotations
import os
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.ai_model import AiModel


async def get_active_llm(db: AsyncSession, org_id=None):
    """Return a LangChain chat model for the first enabled AI model; falls back to Anthropic."""
    q = (
        select(AiModel)
        .options(selectinload(AiModel.provider_rel))
        .where(AiModel.enabled == True)  # noqa: E712
        .order_by(AiModel.created_at)
        .limit(1)
    )
    if org_id is not None:
        q = q.where(AiModel.org_id == org_id)
    result = await db.execute(q)
    model = result.scalar_one_or_none()
    if model is None:
        return await _default_llm(db)
    provider_key = model.provider_rel.api_key if model.provider_rel else None
    return build_llm(model, provider_api_key=provider_key)


async def get_llm_by_role(db: AsyncSession, org_id, role: str):
    """Return a LangChain chat model for the model assigned to the given role, or None."""
    result = await _fetch_model_by_role(db, org_id, role)
    if result is None:
        return None
    model, provider_key = result
    return build_llm(model, provider_api_key=provider_key)


async def get_llm_and_model_by_role(db: AsyncSession, org_id, role: str):
    """Return (llm, AiModel) for the role, or None if not configured."""
    result = await _fetch_model_by_role(db, org_id, role)
    if result is None:
        return None
    model, provider_key = result
    return build_llm(model, provider_api_key=provider_key), model


async def _fetch_model_by_role(db: AsyncSession, org_id, role: str):
    import uuid as _uuid
    if isinstance(org_id, str):
        org_id = _uuid.UUID(org_id)
    result = await db.execute(
        select(AiModel)
        .options(selectinload(AiModel.provider_rel))
        .where(AiModel.org_id == org_id, AiModel.role == role, AiModel.enabled == True)  # noqa: E712
        .limit(1)
    )
    model = result.scalar_one_or_none()
    if model is None:
        return None
    provider_key = model.provider_rel.api_key if model.provider_rel else None
    return model, provider_key


async def get_llm_by_id(db: AsyncSession, model_id: str):
    """Return a LangChain chat model for a specific AI model by UUID; falls back to active."""
    result = await db.execute(
        select(AiModel)
        .options(selectinload(AiModel.provider_rel))
        .where(AiModel.id == model_id)
    )
    model = result.scalar_one_or_none()
    if model is None:
        return await get_active_llm(db)
    provider_key = model.provider_rel.api_key if model.provider_rel else None
    return build_llm(model, provider_api_key=provider_key)


async def _default_llm(db: AsyncSession | None = None):
    from langchain_anthropic import ChatAnthropic
    from app.core.settings_service import get_setting_any_org
    model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
    api_key = None
    if db is not None:
        model = await get_setting_any_org(db, "anthropic_model") or model
        api_key = await get_setting_any_org(db, "anthropic_api_key")
    kwargs: dict = {"model": model, "temperature": 0}
    if api_key:
        kwargs["api_key"] = api_key
    return ChatAnthropic(**kwargs)


def build_llm(model: AiModel, provider_api_key: str | None = None):
    provider = (model.provider or "").lower().strip()
    model_id  = model.model_id
    base_url  = model.base_url
    # Model's own key takes priority; fall back to the linked provider's key
    api_key   = model.api_key or provider_api_key

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        kwargs: dict = {"model": model_id, "temperature": 0}
        if api_key:
            kwargs["api_key"] = api_key
        return ChatAnthropic(**kwargs)

    if provider == "xai":
        from langchain_xai import ChatXAI
        kwargs = {"model": model_id}
        if api_key:
            kwargs["xai_api_key"] = api_key
        return ChatXAI(**kwargs)

    # All other providers use OpenAI-compatible interface
    from langchain_openai import ChatOpenAI

    _OLLAMA_BASE = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

    _DEFAULTS: dict[str, dict] = {
        "openai":        {},
        "groq":          {"base_url": "https://api.groq.com/openai/v1"},
        "openrouter":    {"base_url": "https://openrouter.ai/api/v1"},
        "mistral":       {"base_url": "https://api.mistral.ai/v1"},
        "xai":           {"base_url": "https://api.x.ai/v1"},
        "together ai":   {"base_url": "https://api.together.xyz/v1"},
        "fireworks ai":  {"base_url": "https://api.fireworks.ai/inference/v1"},
        "deepseek":      {"base_url": "https://api.deepseek.com/v1"},
        "cerebras":      {"base_url": "https://api.cerebras.ai/v1"},
        "nvidia nim":    {"base_url": "https://integrate.api.nvidia.com/v1"},
        "scaleway":      {"base_url": "https://api.scaleway.ai/v1"},
        "github models": {"base_url": "https://models.inference.ai.azure.com"},
        "cohere":        {"base_url": "https://api.cohere.ai/compatibility/v1"},
        "ollama":        {"base_url": f"{_OLLAMA_BASE}/v1", "api_key": "ollama"},
        "lm studio":     {"base_url": "http://localhost:1234/v1", "api_key": "lm-studio"},
        "localai":       {"base_url": "http://localhost:8080/v1", "api_key": "localai"},
        "other":         {},
    }
    defaults = _DEFAULTS.get(provider, {})

    effective_url = base_url or defaults.get("base_url")
    effective_key = api_key  or defaults.get("api_key")

    # Ensure OpenAI-compat local providers have /v1 suffix
    if effective_url and provider in ("ollama", "lm studio", "localai"):
        effective_url = effective_url.rstrip("/")
        if not effective_url.endswith("/v1"):
            effective_url += "/v1"

    if not effective_key:
        raise ValueError(
            f"No API key configured for '{model.provider}'. "
            "Add one via Admin → AI → Providers."
        )

    kwargs = {"model": model_id, "temperature": 0, "openai_api_key": effective_key}
    if effective_url:
        kwargs["base_url"] = effective_url

    return ChatOpenAI(**kwargs)
