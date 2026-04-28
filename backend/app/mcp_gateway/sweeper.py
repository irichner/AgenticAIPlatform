"""
IdempotencyOrphanSweeper — reaps pending idempotency rows older than the threshold.

Runs:
  1. Once at startup (catches restarts that left rows in 'pending')
  2. Periodically every idempotency_orphan_threshold_seconds

A pending row older than orphan_threshold_seconds is assumed dead (container crash,
OOM kill) and transitioned to status='error' with reason 'gateway_restart_orphan'.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone, timedelta

from sqlalchemy import select, update

from app.mcp_gateway.models import McpIdempotencyOutcome
from app.mcp_gateway.settings import settings

logger = logging.getLogger(__name__)


async def sweep_orphans() -> int:
    """
    Mark all orphaned pending rows as error.
    Returns the count of rows swept.
    """
    from app.db.engine import AsyncSessionLocal

    threshold = datetime.now(timezone.utc) - timedelta(
        seconds=settings.idempotency_orphan_threshold_seconds
    )
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            update(McpIdempotencyOutcome)
            .where(
                McpIdempotencyOutcome.status == "pending",
                McpIdempotencyOutcome.created_at < threshold,
            )
            .values(
                status="error",
                error_message="gateway_restart_orphan",
            )
            .returning(McpIdempotencyOutcome.id)
        )
        swept = len(result.fetchall())
        if swept:
            await db.commit()
            logger.info("IdempotencyOrphanSweeper: swept %d orphan rows", swept)
        return swept


async def expire_old_outcomes() -> int:
    """Delete outcome rows past their expires_at TTL."""
    from app.db.engine import AsyncSessionLocal
    from sqlalchemy import delete

    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            delete(McpIdempotencyOutcome)
            .where(McpIdempotencyOutcome.expires_at < now)
            .returning(McpIdempotencyOutcome.id)
        )
        deleted = len(result.fetchall())
        if deleted:
            await db.commit()
            logger.debug("IdempotencyOrphanSweeper: expired %d old outcome rows", deleted)
        return deleted


async def run_sweeper_loop() -> None:
    """Background task: startup sweep + periodic sweeping."""
    await sweep_orphans()
    await expire_old_outcomes()
    while True:
        await asyncio.sleep(settings.idempotency_orphan_threshold_seconds)
        try:
            await sweep_orphans()
            await expire_old_outcomes()
        except Exception:
            logger.exception("IdempotencyOrphanSweeper error")
