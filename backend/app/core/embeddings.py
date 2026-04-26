from __future__ import annotations
import os
from openai import AsyncOpenAI

_client: AsyncOpenAI | None = None
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
EMBEDDING_DIMS = 1536


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    return _client


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts. Returns list of 1536-dim float vectors."""
    client = _get_client()
    # OpenAI allows up to 2048 items per request; batch conservatively
    batch_size = 100
    results: list[list[float]] = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        response = await client.embeddings.create(model=EMBEDDING_MODEL, input=batch)
        results.extend([item.embedding for item in response.data])
    return results


async def embed_query(text: str) -> list[float]:
    """Embed a single query string."""
    results = await embed_texts([text])
    return results[0]
