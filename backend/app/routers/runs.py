from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.agents.executor import execute_run
from app.auth.dependencies import resolve_org
from app.core.redis_client import get_redis
from app.dependencies import get_db
from app.models.agent import Agent, AgentVersion
from app.models.business_unit import BusinessUnit
from app.models.run import Run
from app.schemas.run import RunCreate, RunOut

router = APIRouter(prefix="/runs", tags=["runs"])


async def _get_run_for_org(run_id: UUID, org_id: UUID, db: AsyncSession) -> Run:
    result = await db.execute(
        select(Run)
        .join(BusinessUnit, BusinessUnit.id == Run.business_unit_id)
        .where(Run.id == run_id, BusinessUnit.org_id == org_id)
    )
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    return run


@router.post("", response_model=RunOut, status_code=status.HTTP_201_CREATED)
async def create_run(
    payload: RunCreate,
    background_tasks: BackgroundTasks,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    agent_res = await db.execute(
        select(Agent)
        .join(BusinessUnit, BusinessUnit.id == Agent.business_unit_id)
        .where(Agent.id == payload.agent_id, BusinessUnit.org_id == org_id)
    )
    agent = agent_res.scalar_one_or_none()
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    if agent.status != "published":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only published agents can be executed",
        )

    version_res = await db.execute(
        select(AgentVersion)
        .where(AgentVersion.agent_id == agent.id)
        .order_by(AgentVersion.version_number.desc())
        .limit(1)
    )
    latest_version = version_res.scalar_one_or_none()

    run = Run(
        agent_id=agent.id,
        agent_version_id=latest_version.id if latest_version else None,
        business_unit_id=agent.business_unit_id,
        status="pending",
        input=payload.input,
        started_at=datetime.now(timezone.utc),
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    background_tasks.add_task(execute_run, str(run.id))

    return run


@router.get("/{run_id}/stream")
async def stream_run(
    run_id: UUID,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    redis = get_redis()
    channel = f"run:{run_id}"

    run = await _get_run_for_org(run_id, org_id, db)

    if run.status in ("completed", "failed"):
        async def finished_generator():
            event_type = "complete" if run.status == "completed" else "error"
            yield {
                "data": json.dumps({
                    "event": event_type,
                    "run_id": str(run_id),
                    "output": run.output,
                    "error": run.error,
                })
            }
        return EventSourceResponse(finished_generator())

    async def live_generator():
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)
        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                data = json.loads(message["data"])
                yield {"data": json.dumps(data)}
                if data.get("event") in ("complete", "error"):
                    break
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()

    return EventSourceResponse(live_generator())


@router.get("/{run_id}", response_model=RunOut)
async def get_run(
    run_id: UUID,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    return await _get_run_for_org(run_id, org_id, db)


@router.get("", response_model=list[RunOut])
async def list_runs(
    agent_id: UUID | None = None,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Run)
        .join(BusinessUnit, BusinessUnit.id == Run.business_unit_id)
        .where(BusinessUnit.org_id == org_id)
        .order_by(Run.created_at.desc())
    )
    if agent_id:
        stmt = stmt.where(Run.agent_id == agent_id)
    result = await db.execute(stmt)
    return result.scalars().all()
