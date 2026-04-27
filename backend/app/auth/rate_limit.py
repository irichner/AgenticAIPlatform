"""Sliding-window rate limiting via Redis.

Magic link limits (non-negotiable per spec):
  - 5 per email per hour
  - 20 per IP per hour
"""
from __future__ import annotations
import secrets
import time
from app.core.redis_client import get_redis

_WINDOW_SECONDS = 3600  # 1 hour


async def check_magic_link_rate(email: str, ip: str | None) -> tuple[bool, str]:
    """Returns (allowed, reason).  reason is non-empty only when not allowed."""
    redis = get_redis()
    now = int(time.time())
    window_start = now - _WINDOW_SECONDS

    email_key = f"rl:ml:email:{email.lower()}"
    allowed, reason = await _check_sliding(redis, email_key, now, window_start, 5)
    if not allowed:
        return False, reason

    if ip:
        ip_key = f"rl:ml:ip:{ip}"
        allowed, reason = await _check_sliding(redis, ip_key, now, window_start, 20)
        if not allowed:
            return False, reason

    return True, ""


async def _check_sliding(
    redis, key: str, now: int, window_start: int, limit: int
) -> tuple[bool, str]:
    pipe = redis.pipeline()
    pipe.zremrangebyscore(key, 0, window_start)
    pipe.zcard(key)
    pipe.zadd(key, {f"{now}:{secrets.token_hex(4)}": now})
    pipe.expire(key, _WINDOW_SECONDS + 60)
    results = await pipe.execute()
    count = results[1]  # count *before* adding current request
    if count >= limit:
        return False, f"Rate limit exceeded ({limit}/hour)"
    return True, ""
