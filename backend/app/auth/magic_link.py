from __future__ import annotations
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.models.magic_link import MagicLink

_EXPIRY_MINUTES = 15


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def create_magic_link(
    db: AsyncSession,
    email: str,
    purpose: str = "login",
    org_id: UUID | None = None,
    role_id: UUID | None = None,
    use_preflight: bool = True,
) -> tuple[str, str | None]:
    """Returns (raw_token, pre_flight_id).  pre_flight_id is None when use_preflight=False."""
    token = secrets.token_urlsafe(32)
    pre_flight_id = secrets.token_urlsafe(16) if use_preflight else None
    ml = MagicLink(
        token_hash=_hash(token),
        email=email.lower().strip(),
        purpose=purpose,
        org_id=org_id,
        role_id=role_id,
        expires_at=_now() + timedelta(minutes=_EXPIRY_MINUTES),
        pre_flight_id=pre_flight_id,
    )
    db.add(ml)
    await db.commit()
    return token, pre_flight_id


async def consume_magic_link(
    db: AsyncSession,
    token: str,
    pre_flight_id: str | None,
) -> MagicLink | None:
    """Validate and consume a magic link.  Returns the row or None on failure."""
    token_hash = _hash(token)
    result = await db.execute(
        select(MagicLink).where(
            MagicLink.token_hash == token_hash,
            MagicLink.used_at.is_(None),
            MagicLink.expires_at > _now(),
        )
    )
    ml = result.scalar_one_or_none()
    if not ml:
        return None

    # Pre-flight binding check
    if ml.pre_flight_id and ml.pre_flight_id != pre_flight_id:
        return None

    await db.execute(
        update(MagicLink)
        .where(MagicLink.token_hash == token_hash)
        .values(used_at=_now())
    )
    await db.commit()
    return ml
