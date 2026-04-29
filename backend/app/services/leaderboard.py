"""Redis sorted-set leaderboard for real-time sales rep performance.

Key scheme:
  leaderboard:{org_id}:{year}:{month}  — ZSET member=user_id score=arr_closed
  leaderboard:{org_id}:{year}:0        — annual rollup (month=0)

Pub/Sub channel:
  leaderboard:updates:{org_id}         — JSON payloads pushed on every score change
"""
from __future__ import annotations
import json
import os
from typing import AsyncIterator

import redis.asyncio as aioredis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
_TTL = 400 * 24 * 3600  # ~13 months — outlives any reporting period


def _lb_key(org_id: str, year: int, month: int | None) -> str:
    return f"leaderboard:{org_id}:{year}:{month or 0}"


def _channel(org_id: str) -> str:
    return f"leaderboard:updates:{org_id}"


async def add_or_update_score(
    org_id: str,
    user_id: str,
    arr_delta: float,
    year: int,
    month: int | None,
) -> float:
    """Increment a rep's score and publish an update event. Returns new score."""
    r = aioredis.from_url(REDIS_URL, decode_responses=True)
    async with r:
        monthly_key = _lb_key(org_id, year, month)
        annual_key = _lb_key(org_id, year, None)

        # Atomic increment on both monthly and annual boards
        pipe = r.pipeline()
        pipe.zincrby(monthly_key, arr_delta, user_id)
        pipe.zincrby(annual_key, arr_delta, user_id)
        pipe.expire(monthly_key, _TTL)
        pipe.expire(annual_key, _TTL)
        results = await pipe.execute()
        new_score = float(results[0])

        msg = json.dumps({
            "org_id": org_id,
            "user_id": user_id,
            "arr_delta": arr_delta,
            "new_score": new_score,
            "year": year,
            "month": month,
        })
        await r.publish(_channel(org_id), msg)

    return new_score


async def get_top_scores(
    org_id: str,
    year: int,
    month: int | None,
    top_n: int = 50,
) -> list[tuple[str, float]]:
    """Return [(user_id, arr_score), ...] sorted descending by score."""
    r = aioredis.from_url(REDIS_URL, decode_responses=True)
    async with r:
        key = _lb_key(org_id, year, month)
        rows = await r.zrange(key, 0, top_n - 1, desc=True, withscores=True)
    return [(uid, float(score)) for uid, score in rows]


async def stream_leaderboard_updates(org_id: str) -> AsyncIterator[str]:
    """Async generator yielding SSE-formatted data lines."""
    r = aioredis.from_url(REDIS_URL, decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe(_channel(org_id))
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                yield f"data: {message['data']}\n\n"
    finally:
        await pubsub.unsubscribe(_channel(org_id))
        await r.aclose()
