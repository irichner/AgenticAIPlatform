from __future__ import annotations
import json
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.core.redis_client import get_redis
from app.models.session_model import Session

_SESSION_TTL_DAYS = 30
_REDIS_TTL_SECONDS = 60
_REFRESH_THRESHOLD_HOURS = 24


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def create_session(
    db: AsyncSession,
    user_id: UUID,
    user_agent: str | None = None,
    ip: str | None = None,
) -> str:
    sid = secrets.token_urlsafe(32)
    expires_at = _now() + timedelta(days=_SESSION_TTL_DAYS)
    session = Session(
        id=sid,
        user_id=user_id,
        expires_at=expires_at,
        user_agent=user_agent,
        ip=ip,
    )
    db.add(session)
    await db.commit()
    await _cache_session(sid, str(user_id), expires_at)
    return sid


async def validate_session(sid: str, db: AsyncSession) -> UUID | None:
    """Return user_id if the session is valid, else None."""
    redis = get_redis()
    cached = await redis.get(f"session:{sid}")
    if cached:
        data = json.loads(cached)
        expires_at = datetime.fromisoformat(data["expires_at"])
        if expires_at <= _now():
            await redis.delete(f"session:{sid}")
            return None
        return UUID(data["user_id"])

    result = await db.execute(select(Session).where(Session.id == sid))
    session = result.scalar_one_or_none()
    if not session or session.expires_at <= _now():
        return None

    # Populate cache
    await _cache_session(sid, str(session.user_id), session.expires_at)

    # Rolling refresh when last refresh was > 24 h ago
    if (_now() - session.last_seen_at).total_seconds() > _REFRESH_THRESHOLD_HOURS * 3600:
        session.last_seen_at = _now()
        session.expires_at = _now() + timedelta(days=_SESSION_TTL_DAYS)
        await db.commit()
        await _cache_session(sid, str(session.user_id), session.expires_at)

    return session.user_id


async def revoke_session(sid: str, db: AsyncSession) -> None:
    await db.execute(delete(Session).where(Session.id == sid))
    await db.commit()
    redis = get_redis()
    await redis.delete(f"session:{sid}")


async def revoke_all_sessions(user_id: UUID, db: AsyncSession) -> None:
    result = await db.execute(select(Session.id).where(Session.user_id == user_id))
    sids = [row[0] for row in result.fetchall()]
    await db.execute(delete(Session).where(Session.user_id == user_id))
    await db.commit()
    redis = get_redis()
    if sids:
        await redis.delete(*[f"session:{sid}" for sid in sids])


async def _cache_session(sid: str, user_id: str, expires_at: datetime) -> None:
    redis = get_redis()
    payload = json.dumps({"user_id": user_id, "expires_at": expires_at.isoformat()})
    await redis.setex(f"session:{sid}", _REDIS_TTL_SECONDS, payload)
