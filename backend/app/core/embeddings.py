from __future__ import annotations
import os
from openai import AsyncOpenAI

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
EMBEDDING_DIMS = 1536


async def _get_api_key(db=None, org_id=None) -> str | None:
    if db is not None:
        from app.core.settings_service import get_setting, get_setting_any_org
        if org_id is not None:
            return await get_setting(db, org_id, "openai_api_key")
        return await get_setting_any_org(db, "openai_api_key")
    return os.getenv("OPENAI_API_KEY")


async def embed_texts(texts: list[str], db=None, org_id=None) -> list[list[float]]:
    """Embed a batch of texts. Returns list of 1536-dim float vectors."""
    api_key = await _get_api_key(db, org_id)
    client = AsyncOpenAI(api_key=api_key)
    batch_size = 100
    results: list[list[float]] = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        response = await client.embeddings.create(model=EMBEDDING_MODEL, input=batch)
        results.extend([item.embedding for item in response.data])
    return results


async def embed_query(text: str, db=None, org_id=None) -> list[float]:
    """Embed a single query string."""
    results = await embed_texts([text], db=db, org_id=org_id)
    return results[0]
