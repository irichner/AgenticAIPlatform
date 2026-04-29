"""Per-org / per-user agent execution rate limiting via Redis sliding window.

Limit resolution order (first non-NULL wins):
  1. OrgMembership.agent_runs_per_minute / per_hour  (per-user override)
  2. Org.agent_runs_per_minute / per_hour            (org-wide default)
  3. AGENT_RUN_LIMIT_PER_MINUTE / PER_HOUR env vars  (platform default)

Limits are cached in Redis for 5 minutes so the DB is not hit on every run.
"""
from __future__ import annotations
import json
import os
import secrets
import time
from uuid import UUID

from app.core.redis_client import get_redis

_DEFAULT_LIMIT_MIN = int(os.getenv("AGENT_RUN_LIMIT_PER_MINUTE", "30"))
_DEFAULT_LIMIT_HOUR = int(os.getenv("AGENT_RUN_LIMIT_PER_HOUR", "500"))
_LIMITS_CACHE_TTL = 300  # 5 minutes


class AgentRateLimitError(Exception):
    pass


async def _fetch_limits(org_id: str, user_id: str | None) -> tuple[int, int]:
    """Return (runs_per_minute, runs_per_hour) for this org+user combination.

    Checks Redis cache first; on miss, queries DB and caches the result.
    """
    redis = get_redis()

    cache_key = f"rl:limits:{org_id}:{user_id or 'org'}"
    cached = await redis.get(cache_key)
    if cached:
        data = json.loads(cached)
        return data["min"], data["hr"]

    # DB lookup — imported here to avoid circular import at module load time
    from app.db.engine import AsyncSessionLocal
    from app.db.rls import bypass_rls
    from app.models.membership import OrgMembership
    from app.models.org import Org
    from sqlalchemy import select

    limit_min = _DEFAULT_LIMIT_MIN
    limit_hr = _DEFAULT_LIMIT_HOUR

    async with AsyncSessionLocal() as db:
        await bypass_rls(db)
        # Org-level defaults
        org_res = await db.execute(select(Org).where(Org.id == UUID(org_id)))
        org = org_res.scalar_one_or_none()
        if org:
            if org.agent_runs_per_minute is not None:
                limit_min = org.agent_runs_per_minute
            if org.agent_runs_per_hour is not None:
                limit_hr = org.agent_runs_per_hour

        # Per-user overrides (take precedence over org defaults)
        if user_id:
            m_res = await db.execute(
                select(OrgMembership).where(
                    OrgMembership.org_id == UUID(org_id),
                    OrgMembership.user_id == UUID(user_id),
                )
            )
            m = m_res.scalar_one_or_none()
            if m:
                if m.agent_runs_per_minute is not None:
                    limit_min = m.agent_runs_per_minute
                if m.agent_runs_per_hour is not None:
                    limit_hr = m.agent_runs_per_hour

    await redis.set(cache_key, json.dumps({"min": limit_min, "hr": limit_hr}), ex=_LIMITS_CACHE_TTL)
    return limit_min, limit_hr


async def check_agent_run_rate(org_id: UUID | str, user_id: UUID | str | None = None) -> None:
    """Raise AgentRateLimitError if the org/user has exceeded its execution quota.

    Call this before starting a new run.  It records the attempt in Redis.
    """
    redis = get_redis()
    oid = str(org_id)
    uid = str(user_id) if user_id else None
    now = int(time.time())

    limit_min, limit_hr = await _fetch_limits(oid, uid)

    # Use per-user counters when user_id is known; otherwise fall back to org counters
    counter_key = f"{oid}:{uid}" if uid else oid

    async def _check(key: str, window: int, limit: int, label: str) -> None:
        window_start = now - window
        pipe = redis.pipeline()
        pipe.zremrangebyscore(key, 0, window_start)
        pipe.zcard(key)
        pipe.zadd(key, {f"{now}:{secrets.token_hex(4)}": now})
        pipe.expire(key, window + 60)
        results = await pipe.execute()
        count = results[1]
        if count >= limit:
            raise AgentRateLimitError(
                f"Agent execution rate limit exceeded: {limit} runs/{label}. "
                "Try again later."
            )

    await _check(f"rl:agent:min:{counter_key}", 60, limit_min, "minute")
    await _check(f"rl:agent:hr:{counter_key}", 3600, limit_hr, "hour")


async def invalidate_limits_cache(org_id: UUID | str, user_id: UUID | str | None = None) -> None:
    """Call after updating member limits so the next run picks up the new values."""
    redis = get_redis()
    oid = str(org_id)
    uid = str(user_id) if user_id else None
    await redis.delete(f"rl:limits:{oid}:{uid or 'org'}")
