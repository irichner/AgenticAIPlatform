from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.scheduler import compute_initial_next_run
from app.auth.dependencies import resolve_org
from app.dependencies import get_db
from app.models.agent import Agent
from app.models.agent_schedule import AgentSchedule
from app.models.business_unit import BusinessUnit
from app.models.run import Run
from app.schemas.schedule import ScheduleCreate, ScheduleOut, ScheduleUpdate

router = APIRouter(prefix="/schedules", tags=["schedules"])


async def _get_schedule(schedule_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession) -> AgentSchedule:
    result = await db.execute(
        select(AgentSchedule).where(
            AgentSchedule.id == schedule_id,
            AgentSchedule.org_id == org_id,
        )
    )
    schedule = result.scalar_one_or_none()
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")
    return schedule


async def _get_agent(agent_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession) -> Agent:
    result = await db.execute(
        select(Agent)
        .join(BusinessUnit, BusinessUnit.id == Agent.business_unit_id)
        .where(Agent.id == agent_id, BusinessUnit.org_id == org_id)
    )
    agent = result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return agent


@router.get("", response_model=list[ScheduleOut])
async def list_schedules(
    agent_id: uuid.UUID | None = None,
    enabled: bool | None = None,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    q = select(AgentSchedule).where(AgentSchedule.org_id == org_id)
    if agent_id is not None:
        q = q.where(AgentSchedule.agent_id == agent_id)
    if enabled is not None:
        q = q.where(AgentSchedule.enabled == enabled)
    q = q.order_by(AgentSchedule.created_at.desc())
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=ScheduleOut, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    payload: ScheduleCreate,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    agent = await _get_agent(payload.agent_id, org_id, db)

    schedule = AgentSchedule(
        org_id=org_id,
        agent_id=agent.id,
        name=payload.name,
        description=payload.description,
        schedule_type=payload.schedule_type,
        cron_expression=payload.cron_expression,
        interval_seconds=payload.interval_seconds,
        run_at=payload.run_at,
        timezone=payload.timezone,
        input_override=payload.input_override,
        enabled=payload.enabled,
        max_retries=payload.max_retries,
        retry_delay_seconds=payload.retry_delay_seconds,
        timeout_seconds=payload.timeout_seconds,
    )

    if payload.enabled:
        try:
            schedule.next_run_at = compute_initial_next_run(schedule)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid schedule configuration: {exc}",
            ) from exc

    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)
    return schedule


@router.get("/{schedule_id}", response_model=ScheduleOut)
async def get_schedule(
    schedule_id: uuid.UUID,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    return await _get_schedule(schedule_id, org_id, db)


@router.put("/{schedule_id}", response_model=ScheduleOut)
async def update_schedule(
    schedule_id: uuid.UUID,
    payload: ScheduleUpdate,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    schedule = await _get_schedule(schedule_id, org_id, db)

    for field, val in payload.model_dump(exclude_none=True).items():
        setattr(schedule, field, val)

    # Recompute next_run_at if any scheduling field changed
    if any(
        payload.model_dump(exclude_none=True).get(f)
        for f in ("cron_expression", "interval_seconds", "run_at", "timezone", "enabled")
    ):
        if schedule.enabled:
            try:
                schedule.next_run_at = compute_initial_next_run(schedule)
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Invalid schedule configuration: {exc}",
                ) from exc
        else:
            schedule.next_run_at = None

    await db.commit()
    await db.refresh(schedule)
    return schedule


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    schedule_id: uuid.UUID,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    schedule = await _get_schedule(schedule_id, org_id, db)
    await db.delete(schedule)
    await db.commit()


@router.post("/{schedule_id}/toggle", response_model=ScheduleOut)
async def toggle_schedule(
    schedule_id: uuid.UUID,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    schedule = await _get_schedule(schedule_id, org_id, db)
    schedule.enabled = not schedule.enabled

    if schedule.enabled:
        try:
            schedule.next_run_at = compute_initial_next_run(schedule)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Cannot enable — invalid schedule configuration: {exc}",
            ) from exc
    else:
        schedule.next_run_at = None

    await db.commit()
    await db.refresh(schedule)
    return schedule


@router.post("/{schedule_id}/trigger", response_model=dict)
async def manual_trigger(
    schedule_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    """Immediately fire a scheduled run outside of its normal cadence."""
    schedule = await _get_schedule(schedule_id, org_id, db)

    agent_res = await db.execute(select(Agent).where(Agent.id == schedule.agent_id))
    agent = agent_res.scalar_one_or_none()
    if agent is None or agent.status != "published":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Agent is not published — cannot trigger a run",
        )

    now = datetime.now(timezone.utc)
    run = Run(
        agent_id=schedule.agent_id,
        business_unit_id=agent.business_unit_id,
        status="pending",
        input=schedule.input_override or {},
        started_at=now,
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    from app.agents.executor import execute_run
    background_tasks.add_task(execute_run, str(run.id))

    return {"run_id": str(run.id), "schedule_id": str(schedule_id), "triggered_at": now.isoformat()}
