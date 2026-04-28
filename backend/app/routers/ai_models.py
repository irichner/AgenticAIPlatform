from __future__ import annotations
from uuid import UUID
import asyncio
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx
import json
import os

from app.dependencies import get_db
from app.models.ai_model import AiModel
from app.schemas.ai_model import AiModelCreate, AiModelUpdate, AiModelOut

router = APIRouter(prefix="/ai-models", tags=["ai-models"])


async def _ollama_set_keepalive(model_id: str, base_url: str, keep_alive: int) -> None:
    """Load (keep_alive=-1) or unload (keep_alive=0) a model in Ollama. Fire-and-forget safe."""
    url = base_url.rstrip("/")
    if url.endswith("/v1"):
        url = url[:-3]  # /api/generate is native Ollama, not OpenAI-compat
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            await client.post(f"{url}/api/generate", json={"model": model_id, "keep_alive": keep_alive})
    except Exception:
        pass

_STATIC_MODELS: dict[str, list[dict]] = {
    "anthropic": [
        {"id": "claude-opus-4-7",          "name": "Claude Opus 4.7"},
        {"id": "claude-sonnet-4-6",         "name": "Claude Sonnet 4.6"},
        {"id": "claude-haiku-4-5-20251001", "name": "Claude Haiku 4.5"},
    ],
    "openai": [
        {"id": "gpt-4o",       "name": "GPT-4o"},
        {"id": "gpt-4o-mini",  "name": "GPT-4o Mini"},
        {"id": "gpt-4-turbo",  "name": "GPT-4 Turbo"},
        {"id": "o1",           "name": "o1"},
        {"id": "o1-mini",      "name": "o1 Mini"},
        {"id": "o3-mini",      "name": "o3 Mini"},
    ],
    "groq": [
        {"id": "llama-3.3-70b-versatile", "name": "Llama 3.3 70B"},
        {"id": "llama-3.1-8b-instant",    "name": "Llama 3.1 8B"},
        {"id": "mixtral-8x7b-32768",      "name": "Mixtral 8x7B"},
        {"id": "gemma2-9b-it",            "name": "Gemma 2 9B"},
    ],
    "together ai": [
        {"id": "meta-llama/Llama-3-70b-chat-hf",       "name": "Llama 3 70B"},
        {"id": "meta-llama/Llama-3-8b-chat-hf",        "name": "Llama 3 8B"},
        {"id": "mistralai/Mixtral-8x7B-Instruct-v0.1", "name": "Mixtral 8x7B"},
    ],
    "mistral": [
        {"id": "mistral-large-latest",  "name": "Mistral Large"},
        {"id": "mistral-medium-latest", "name": "Mistral Medium"},
        {"id": "mistral-small-latest",  "name": "Mistral Small"},
        {"id": "codestral-latest",      "name": "Codestral"},
    ],
    "cohere": [
        {"id": "command-r-plus", "name": "Command R+"},
        {"id": "command-r",      "name": "Command R"},
        {"id": "command",        "name": "Command"},
    ],
    "xai": [
        {"id": "grok-3",             "name": "Grok 3"},
        {"id": "grok-3-fast",        "name": "Grok 3 Fast"},
        {"id": "grok-3-mini",        "name": "Grok 3 Mini"},
        {"id": "grok-3-mini-fast",   "name": "Grok 3 Mini Fast"},
        {"id": "grok-2-1212",        "name": "Grok 2"},
        {"id": "grok-2-vision-1212", "name": "Grok 2 Vision"},
    ],
}

_LOCAL_BASE_DEFAULTS: dict[str, str] = {
    "ollama":    os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
    "lm studio": "http://localhost:1234",
    "localai":   "http://localhost:8080",
}


_KEY_AUTHENTICATED_BASES: dict[str, str] = {
    "xai": "https://api.x.ai/v1",
}

from pydantic import BaseModel as _PydanticBase

class KeyedModelsRequest(_PydanticBase):
    api_key: str
    base_url: str | None = None


@router.post("/providers/{provider}/models")
async def list_provider_models_keyed(provider: str, body: KeyedModelsRequest):
    """Fetch live models from a provider using the supplied API key (validates credentials)."""
    p = provider.lower().strip()
    base = (body.base_url or _KEY_AUTHENTICATED_BASES.get(p, "")).rstrip("/")
    if not base:
        raise HTTPException(status_code=400, detail=f"No base URL known for provider '{p}'")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{base}/models",
                headers={"Authorization": f"Bearer {body.api_key}"},
            )
            resp.raise_for_status()
            data = resp.json()
            models = [{"id": m["id"], "name": m.get("id", m["id"])} for m in data.get("data", [])]
            return sorted(models, key=lambda m: m["name"])
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 401:
            raise HTTPException(status_code=401, detail="Invalid API key — check your xAI credentials")
        raise HTTPException(status_code=502, detail=f"Provider returned {exc.response.status_code}")
    except (httpx.TimeoutException, httpx.ConnectError):
        raise HTTPException(status_code=502, detail="Could not reach provider API")


@router.get("/providers/{provider}/models")
async def list_provider_models(provider: str, base_url: str | None = None):
    """Return available models for a provider. Local providers are fetched live; others are static."""
    p = provider.lower().strip()

    if p in ("ollama", "lm studio", "localai", "other"):
        effective = (base_url or _LOCAL_BASE_DEFAULTS.get(p, "http://localhost:11434")).rstrip("/")
        tags_url = f"{effective}/api/tags"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(tags_url)
                resp.raise_for_status()
                data = resp.json()
                return [{"id": m["name"], "name": m["name"]} for m in data.get("models", [])]
        except httpx.TimeoutException:
            raise HTTPException(status_code=502, detail=f"Timed out connecting to {effective} — is the service running?")
        except httpx.ConnectError:
            raise HTTPException(status_code=502, detail=f"Could not connect to {effective} — check the URL and that the service is running")
        except httpx.RequestError:
            raise HTTPException(status_code=502, detail=f"Could not reach {effective} — check the URL and that the service is running")
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=502, detail=f"Provider returned {exc.response.status_code}")

    return _STATIC_MODELS.get(p, [])


@router.post("/providers/ollama/pull")
async def pull_ollama_model(model: str, base_url: str | None = None):
    """Stream pull progress from Ollama as SSE."""
    effective = (base_url or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")).rstrip("/")

    async def event_stream():
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("POST", f"{effective}/api/pull", json={"name": model}) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if line.strip():
                            yield f"data: {line}\n\n"
        except httpx.TimeoutException:
            yield f"data: {json.dumps({'error': f'Timed out connecting to {effective}'})}\n\n"
        except httpx.ConnectError:
            yield f"data: {json.dumps({'error': f'Could not connect to {effective} — is Ollama running?'})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("", response_model=list[AiModelOut])
async def list_ai_models(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AiModel).order_by(AiModel.name))
    return [AiModelOut.from_orm_mask(m) for m in result.scalars().all()]


@router.post("", response_model=AiModelOut, status_code=status.HTTP_201_CREATED)
async def create_ai_model(payload: AiModelCreate, db: AsyncSession = Depends(get_db)):
    if payload.type != "local":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="API models are managed automatically. Connect a provider via Admin → AI → Providers.",
        )
    model = AiModel(**payload.model_dump())
    db.add(model)
    await db.commit()
    await db.refresh(model)
    return AiModelOut.from_orm_mask(model)


@router.patch("/{model_id}", response_model=AiModelOut)
async def update_ai_model(model_id: UUID, payload: AiModelUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AiModel).where(AiModel.id == model_id))
    model = result.scalar_one_or_none()
    if model is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI model not found")
    was_enabled = model.enabled
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(model, field, value)
    await db.commit()
    await db.refresh(model)
    # Sync VRAM when toggling a local model: load on enable, unload on disable
    if model.type == "local" and payload.enabled is not None and payload.enabled != was_enabled:
        ollama_base = model.base_url or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        asyncio.create_task(_ollama_set_keepalive(model.model_id, ollama_base, -1 if model.enabled else 0))
    return AiModelOut.from_orm_mask(model)


@router.delete("/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ai_model(
    model_id: UUID,
    uninstall: bool = Query(False, description="Also delete model files from Ollama"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AiModel).where(AiModel.id == model_id))
    model = result.scalar_one_or_none()
    if model is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI model not found")

    if uninstall and model.type == "local":
        ollama_url = (model.base_url or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")).rstrip("/")
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.request("DELETE", f"{ollama_url}/api/delete", json={"name": model.model_id})
                if resp.status_code not in (200, 404):
                    resp.raise_for_status()
        except httpx.TimeoutException:
            raise HTTPException(status_code=502, detail="Timed out connecting to Ollama — is it running?")
        except httpx.ConnectError:
            raise HTTPException(status_code=502, detail="Could not connect to Ollama — check the service is running")
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=502, detail=f"Ollama returned {exc.response.status_code}")

    await db.delete(model)
    await db.commit()
