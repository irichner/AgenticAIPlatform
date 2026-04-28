"""
OutcomeCache — Postgres-backed idempotency for tool calls.

Lifecycle: pending → success | error
Orphan rows (pending > orphan_threshold_seconds old) are reaped by IdempotencyOrphanSweeper.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp_gateway.models import McpIdempotencyOutcome
from app.mcp_gateway.settings import settings

logger = logging.getLogger(__name__)


class IdempotencyConflictError(Exception):
    """Raised when a pending entry already exists (concurrent call in progress)."""


async def claim(
    db: AsyncSession,
    org_id: uuid.UUID,
    registration_id: uuid.UUID,
    tool_name: str,
    idempotency_key: str,
) -> McpIdempotencyOutcome | None:
    """
    Try to claim this (org, reg, tool, key) slot.

    Returns:
      - None if slot is free and we claimed it (status=pending)
      - The existing row if status=success (caller should return cached result)
    Raises IdempotencyConflictError if status=pending (another call in-flight).
    """
    expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.idempotency_ttl_hours)

    stmt = (
        pg_insert(McpIdempotencyOutcome)
        .values(
            id=uuid.uuid4(),
            org_id=org_id,
            registration_id=registration_id,
            tool_name=tool_name,
            idempotency_key=idempotency_key,
            status="pending",
            expires_at=expires_at,
        )
        .on_conflict_do_nothing(
            constraint="uq_mcp_idempotency",
        )
        .returning(McpIdempotencyOutcome)
    )
    result = await db.execute(stmt)
    inserted = result.scalar_one_or_none()
    if inserted is not None:
        await db.commit()
        return None  # freshly claimed, proceed

    # Row already exists — load it
    existing = await db.scalar(
        select(McpIdempotencyOutcome).where(
            McpIdempotencyOutcome.org_id == org_id,
            McpIdempotencyOutcome.registration_id == registration_id,
            McpIdempotencyOutcome.tool_name == tool_name,
            McpIdempotencyOutcome.idempotency_key == idempotency_key,
        )
    )
    if existing is None:
        return None  # race — just proceed

    if existing.status == "success":
        return existing
    if existing.status == "pending":
        raise IdempotencyConflictError(
            f"Concurrent call in-flight for idempotency_key={idempotency_key!r}"
        )
    # status == "error" — allow retry
    await db.delete(existing)
    await db.commit()
    return None


async def complete(
    db: AsyncSession,
    org_id: uuid.UUID,
    registration_id: uuid.UUID,
    tool_name: str,
    idempotency_key: str,
    result_json: Any,
) -> None:
    row = await db.scalar(
        select(McpIdempotencyOutcome).where(
            McpIdempotencyOutcome.org_id == org_id,
            McpIdempotencyOutcome.registration_id == registration_id,
            McpIdempotencyOutcome.tool_name == tool_name,
            McpIdempotencyOutcome.idempotency_key == idempotency_key,
            McpIdempotencyOutcome.status == "pending",
        )
    )
    if row is None:
        return
    row.status = "success"
    row.result_json = result_json
    await db.commit()


async def fail(
    db: AsyncSession,
    org_id: uuid.UUID,
    registration_id: uuid.UUID,
    tool_name: str,
    idempotency_key: str,
    error_message: str,
) -> None:
    row = await db.scalar(
        select(McpIdempotencyOutcome).where(
            McpIdempotencyOutcome.org_id == org_id,
            McpIdempotencyOutcome.registration_id == registration_id,
            McpIdempotencyOutcome.tool_name == tool_name,
            McpIdempotencyOutcome.idempotency_key == idempotency_key,
            McpIdempotencyOutcome.status == "pending",
        )
    )
    if row is None:
        return
    row.status = "error"
    row.error_message = error_message
    await db.commit()
