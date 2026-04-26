"""LLM factory — returns a LangChain chat model from the first enabled AiModel in the DB."""
from __future__ import annotations
import os
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_model import AiModel


async def get_active_llm(db: AsyncSession):
    """Return a LangChain chat model for the first enabled AI model; falls back to Anthropic."""
    result = await db.execute(
        select(AiModel).where(AiModel.enabled == True).order_by(AiModel.created_at).limit(1)
    )
    model = result.scalar_one_or_none()
    if model is None:
        return _default_llm()
    return build_llm(model)


def _default_llm():
    from langchain_anthropic import ChatAnthropic
    return ChatAnthropic(
        model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
        temperature=0,
    )


def build_llm(model: AiModel):
    provider = (model.provider or "").lower().strip()
    model_id  = model.model_id
    base_url  = model.base_url
    api_key   = model.api_key

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        kwargs: dict = {"model": model_id, "temperature": 0}
        if api_key:
            kwargs["api_key"] = api_key
        return ChatAnthropic(**kwargs)

    # All other providers use OpenAI-compatible interface
    from langchain_openai import ChatOpenAI

    _OLLAMA_BASE = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

    _DEFAULTS: dict[str, dict] = {
        "openai":      {},
        "groq":        {"base_url": "https://api.groq.com/openai/v1"},
        "together ai": {"base_url": "https://api.together.xyz/v1"},
        "mistral":     {"base_url": "https://api.mistral.ai/v1"},
        "cohere":      {"base_url": "https://api.cohere.ai/compatibility/v1"},
        "xai":         {"base_url": "https://api.x.ai/v1"},
        "ollama":      {"base_url": f"{_OLLAMA_BASE}/v1", "api_key": "ollama"},
        "lm studio":   {"base_url": "http://localhost:1234/v1",  "api_key": "lm-studio"},
        "localai":     {"base_url": "http://localhost:8080/v1",  "api_key": "localai"},
        "other":       {},
    }
    defaults = _DEFAULTS.get(provider, {})

    effective_url = base_url or defaults.get("base_url")
    effective_key = api_key  or defaults.get("api_key")

    # Ensure OpenAI-compat providers have /v1 suffix
    if effective_url and provider in ("ollama", "lm studio", "localai"):
        effective_url = effective_url.rstrip("/")
        if not effective_url.endswith("/v1"):
            effective_url += "/v1"

    kwargs = {"model": model_id, "temperature": 0}
    if effective_url:
        kwargs["base_url"] = effective_url
    if effective_key:
        kwargs["openai_api_key"] = effective_key

    return ChatOpenAI(**kwargs)
