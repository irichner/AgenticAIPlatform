"""Data retention background task — purge stale rows from high-volume tables.

Retention windows are now configurable via Platform Settings (Admin → Settings → Platform)
and fall back to env vars if not set there:
  RETAIN_RUNS_DAYS               (default: 90)
  RETAIN_SIGNALS_DAYS            (default: 30)
  RETAIN_AUDIT_LOG_DAYS          (default: 365)
  RETAIN_ACTIVITIES_DAYS         (default: 365)
  RETAIN_ORPHAN_ACTIVITIES_DAYS  (default: 30)

The task runs once daily at startup offset to avoid overlapping with other jobs.
"""
from __future__ import annotations
import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete

from app.db.engine import AsyncSessionLocal
from app.db.rls import bypass_rls

_RUN_INTERVAL_SECONDS = 86_400  # 24 hours


async def _load_retention_settings(db) -> dict[str, int]:
    from app.core.settings_service import get_setting_any_org
    return {
        "runs":             int(await get_setting_any_org(db, "retain_runs_days",             "90")),
        "signals":          int(await get_setting_any_org(db, "retain_signals_days",          "30")),
        "audit_log":        int(await get_setting_any_org(db, "retain_audit_log_days",        "365")),
        "activities":       int(await get_setting_any_org(db, "retain_activities_days",       "365")),
        "orphan_activities":int(await get_setting_any_org(db, "retain_orphan_activities_days","30")),
    }


async def _purge_once() -> None:
    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as db:
        cfg = await _load_retention_settings(db)

    async with AsyncSessionLocal() as db:
        from app.models.run import Run
        await bypass_rls(db)
        cutoff_runs = now - timedelta(days=cfg["runs"])
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
        cutoff_signals = now - timedelta(days=cfg["signals"])
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
        cutoff_audit = now - timedelta(days=cfg["audit_log"])
        result = await db.execute(
            delete(AuditLog)
            .where(AuditLog.created_at < cutoff_audit)
            .returning(AuditLog.id)
        )
        deleted_audit = len(result.fetchall())
        await db.commit()

    async with AsyncSessionLocal() as db:
        from app.models.activity import Activity
        await bypass_rls(db)
        cutoff_orphan = now - timedelta(days=cfg["orphan_activities"])
        result = await db.execute(
            delete(Activity)
            .where(
                Activity.source.in_(["gmail", "outlook"]),
                Activity.contact_id.is_(None),
                Activity.opportunity_id.is_(None),
                Activity.occurred_at < cutoff_orphan,
            )
            .returning(Activity.id)
        )
        deleted_orphan_activities = len(result.fetchall())
        await db.commit()

    async with AsyncSessionLocal() as db:
        from app.models.activity import Activity
        await bypass_rls(db)
        cutoff_activities = now - timedelta(days=cfg["activities"])
        result = await db.execute(
            delete(Activity)
            .where(Activity.occurred_at < cutoff_activities)
            .returning(Activity.id)
        )
        deleted_activities = len(result.fetchall())
        await db.commit()

    print(
        f"[data_retention] purged: {deleted_runs} runs, "
        f"{deleted_signals} signals, {deleted_audit} audit_log rows, "
        f"{deleted_orphan_activities} orphan activities, {deleted_activities} aged-out activities"
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
