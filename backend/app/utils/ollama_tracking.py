"""Per-model Redis counters tracking in-flight Ollama requests from this backend."""
from __future__ import annotations
import os
from contextlib import asynccontextmanager

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")


def _inflight_key(model_id: str) -> str:
    return f"ollama_inflight:{model_id}"


def _queued_key(model_id: str) -> str:
    return f"ollama_queued:{model_id}"


async def _redis():
    import redis.asyncio as aioredis
    return aioredis.from_url(REDIS_URL, decode_responses=True)


async def set_queued(model_id: str, count: int) -> None:
    r = await _redis()
    async with r:
        if count > 0:
            await r.set(_queued_key(model_id), count, ex=3600)
        else:
            await r.delete(_queued_key(model_id))


async def decr_queued(model_id: str) -> None:
    r = await _redis()
    async with r:
        val = await r.decr(_queued_key(model_id))
        if val <= 0:
            await r.delete(_queued_key(model_id))


async def get_model_stats(model_id: str) -> dict[str, int]:
    r = await _redis()
    async with r:
        inflight = await r.get(_inflight_key(model_id))
        queued = await r.get(_queued_key(model_id))
    return {
        "processing": max(0, int(inflight or 0)),
        "pending": max(0, int(queued or 0)),
    }


async def incr_inflight(model_id: str) -> None:
    r = await _redis()
    async with r:
        await r.incr(_inflight_key(model_id))
        await r.expire(_inflight_key(model_id), 120)


async def decr_inflight(model_id: str) -> None:
    r = await _redis()
    async with r:
        val = await r.decr(_inflight_key(model_id))
        if val <= 0:
            await r.delete(_inflight_key(model_id))


@asynccontextmanager
async def track_ollama_call(model_id: str):
    """Increment/decrement the per-model inflight counter around an Ollama call."""
    await incr_inflight(model_id)
    try:
        yield
    finally:
        await decr_inflight(model_id)
