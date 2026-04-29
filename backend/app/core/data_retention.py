"""Data retention background task — purge stale rows from high-volume tables.

Retention windows (configurable via env vars):
  RETAIN_RUNS_DAYS      — Run records older than N days where status is terminal (default: 90)
  RETAIN_SIGNALS_DAYS   — Processed/failed signals older than N days (default: 30)
  RETAIN_AUDIT_LOG_DAYS — Audit log entries older than N days (default: 365)

The task runs once daily at startup offset to avoid overlapping with other jobs.
"""
from __future__ import annotations
import asyncio
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, text

from app.db.engine import AsyncSessionLocal
from app.db.rls import bypass_rls

_RETAIN_RUNS_DAYS = int(os.getenv("RETAIN_RUNS_DAYS", "90"))
_RETAIN_SIGNALS_DAYS = int(os.getenv("RETAIN_SIGNALS_DAYS", "30"))
_RETAIN_AUDIT_LOG_DAYS = int(os.getenv("RETAIN_AUDIT_LOG_DAYS", "365"))

_RUN_INTERVAL_SECONDS = 86_400  # 24 hours


async def _purge_once() -> None:
    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as db:
        from app.models.run import Run
        await bypass_rls(db)
        cutoff_runs = now - timedelta(days=_RETAIN_RUNS_DAYS)
        result = await db.execute(
            delete(Run)
            .where(
                Run.status.in_(["completed", "failed", "cancelled"]),
                Run.updated_at < cutoff_runs,
            )
            .returning(Run.id)
        )
        deleted_runs = len(result.fetchall())
        await db.commit()

    async with AsyncSessionLocal() as db:
        from app.models.signals import Signal
        await bypass_rls(db)
        cutoff_signals = now - timedelta(days=_RETAIN_SIGNALS_DAYS)
        result = await db.execute(
            delete(Signal)
            .where(
                Signal.status.in_(["processed", "failed"]),
                Signal.processed_at < cutoff_signals,
            )
            .returning(Signal.id)
        )
        deleted_signals = len(result.fetchall())
        await db.commit()

    async with AsyncSessionLocal() as db:
        from app.models.audit_log import AuditLog
        await bypass_rls(db)
        cutoff_audit = now - timedelta(days=_RETAIN_AUDIT_LOG_DAYS)
        result = await db.execute(
            delete(AuditLog)
            .where(AuditLog.created_at < cutoff_audit)
            .returning(AuditLog.id)
        )
        deleted_audit = len(result.fetchall())
        await db.commit()

    print(
        f"[data_retention] purged: {deleted_runs} runs, "
        f"{deleted_signals} signals, {deleted_audit} audit_log rows"
    )


async def run_data_retention_loop() -> None:
    """Daily loop: purge expired records from high-volume tables."""
    print("[data_retention] starting daily retention loop")
    await asyncio.sleep(300)  # stagger 5 min after startup
    while True:
        try:
            await _purge_once()
        except Exception as e:
            print(f"[data_retention] error: {e}")
        await asyncio.sleep(_RUN_INTERVAL_SECONDS)
