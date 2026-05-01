"""
Agent scheduler — polls agent_schedules every 30 s and fires due runs.

Scheduling types:
  cron     — standard 5-field cron expression, evaluated in the schedule's timezone
  interval — fires every N seconds after the last run (or after creation)
  once     — fires once at run_at, then disables itself
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from croniter import croniter
from sqlalchemy import select

from app.db.engine import AsyncSessionLocal
from app.models.agent_schedule import AgentSchedule
from app.models.agent import Agent
from app.models.run import Run

logger = logging.getLogger(__name__)

_POLL_INTERVAL = 30  # seconds


# ── Next-run helpers ──────────────────────────────────────────────────────────

def _safe_tz(tz_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, Exception):
        return ZoneInfo("UTC")


def compute_next_cron(expression: str, tz_name: str) -> datetime:
    tz = _safe_tz(tz_name)
    now_utc = datetime.now(timezone.utc)
    now_local = now_utc.astimezone(tz)
    # croniter works best with naive datetimes; convert, compute, re-attach tz
    now_naive = now_local.replace(tzinfo=None)
    try:
        cron = croniter(expression, now_naive)
        next_naive = cron.get_next(datetime)
    except Exception as exc:
        logger.error("Invalid cron expression %r: %s", expression, exc)
        raise
    next_local = next_naive.replace(tzinfo=tz)
    return next_local.astimezone(timezone.utc)


def compute_next_interval(interval_seconds: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(seconds=interval_seconds)


def compute_initial_next_run(schedule: AgentSchedule) -> datetime | None:
    """Compute next_run_at when a schedule is first created or re-enabled."""
    if schedule.schedule_type == "cron":
        return compute_next_cron(schedule.cron_expression, schedule.timezone)
    if schedule.schedule_type == "interval":
        return compute_next_interval(schedule.interval_seconds)
    if schedule.schedule_type == "once":
        return schedule.run_at
    return None


# ── Execution wrapper ─────────────────────────────────────────────────────────

async def _execute_scheduled_run(schedule_id: uuid.UUID, run_id: str) -> None:
    """
    Thin wrapper around execute_run that updates the schedule record
    with the final status and computes the next_run_at afterward.
    """
    from app.agents.executor import execute_run

    success = True
    try:
        await execute_run(run_id)
    except Exception as exc:
        success = False
        logger.error("Scheduled run %s failed: %s", run_id, exc)
    finally:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(AgentSchedule).where(AgentSchedule.id == schedule_id)
            )
            schedule = result.scalar_one_or_none()
            if schedule is None:
                return

            now = datetime.now(timezone.utc)
            schedule.last_run_status = "success" if success else "failed"
            schedule.last_run_id = uuid.UUID(run_id)

            if not success:
                schedule.failure_count = (schedule.failure_count or 0) + 1

            # Re-compute next_run_at (once-type disables itself)
            if schedule.schedule_type == "once":
                schedule.enabled = False
                schedule.next_run_at = None
            elif schedule.schedule_type == "interval":
                schedule.next_run_at = now + timedelta(seconds=schedule.interval_seconds)
            elif schedule.schedule_type == "cron":
                try:
                    schedule.next_run_at = compute_next_cron(
                        schedule.cron_expression, schedule.timezone
                    )
                except Exception:
                    schedule.enabled = False
                    logger.error("Disabling schedule %s — bad cron expression", schedule_id)

            await db.commit()


# ── Main loop ─────────────────────────────────────────────────────────────────

async def run_scheduler_loop() -> None:
    """Background task: poll for due schedules and dispatch runs."""
    await asyncio.sleep(15)  # brief startup grace period
    logger.info("Agent scheduler started (poll every %ds)", _POLL_INTERVAL)

    while True:
        try:
            await _poll_and_dispatch()
        except Exception as exc:
            logger.error("Scheduler poll error: %s", exc)
        await asyncio.sleep(_POLL_INTERVAL)


async def _poll_and_dispatch() -> None:
    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as db:
        # SELECT FOR UPDATE SKIP LOCKED prevents double-firing if multiple
        # worker processes are running the scheduler loop simultaneously.
        result = await db.execute(
            select(AgentSchedule)
            .where(
                AgentSchedule.enabled == True,          # noqa: E712
                AgentSchedule.next_run_at <= now,
                AgentSchedule.last_run_status.in_(["success", "failed", None])
                | AgentSchedule.last_run_status.is_(None),
            )
            .with_for_update(skip_locked=True)
        )
        due = result.scalars().all()

        if not due:
            return

        for schedule in due:
            try:
                await _dispatch_schedule(schedule, now, db)
            except Exception as exc:
                logger.error("Failed to dispatch schedule %s: %s", schedule.id, exc)

        await db.commit()


async def _dispatch_schedule(
    schedule: AgentSchedule,
    now: datetime,
    db,
) -> None:
    """Create a Run and fire the executor in a background task."""
    # Verify agent is published
    agent_res = await db.execute(
        select(Agent).where(Agent.id == schedule.agent_id)
    )
    agent = agent_res.scalar_one_or_none()
    if agent is None or agent.status != "published":
        logger.warning(
            "Skipping schedule %s — agent %s is not published", schedule.id, schedule.agent_id
        )
        schedule.last_run_status = "skipped"
        schedule.next_run_at = _advance_next_run(schedule)
        return

    run_input = schedule.input_override or {}
    run = Run(
        agent_id=schedule.agent_id,
        business_unit_id=agent.business_unit_id,
        status="pending",
        input=run_input,
        started_at=now,
        triggered_by=None,
    )
    db.add(run)
    await db.flush()  # get run.id before commit

    schedule.last_run_at = now
    schedule.last_run_status = "running"
    schedule.last_run_id = run.id
    schedule.run_count = (schedule.run_count or 0) + 1

    run_id = str(run.id)
    schedule_id = schedule.id

    # Fire the run asynchronously; the wrapper updates status on completion.
    asyncio.create_task(_execute_scheduled_run(schedule_id, run_id))

    logger.info(
        "Dispatched scheduled run %s for agent %s (schedule %s)",
        run_id, schedule.agent_id, schedule.id,
    )


def _advance_next_run(schedule: AgentSchedule) -> datetime | None:
    """Compute next_run_at for a skipped schedule (move it forward)."""
    if schedule.schedule_type == "once":
        schedule.enabled = False
        return None
    if schedule.schedule_type == "interval":
        return compute_next_interval(schedule.interval_seconds)
    if schedule.schedule_type == "cron":
        try:
            return compute_next_cron(schedule.cron_expression, schedule.timezone)
        except Exception:
            return None
    return None
