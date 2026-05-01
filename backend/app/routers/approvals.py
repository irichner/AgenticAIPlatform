from __future__ import annotations
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import resolve_org
from app.core.rbac import require_role
from app.core.redis_client import get_redis
from app.dependencies import get_db
from app.models.approval_request import ApprovalRequest
from app.models.run import Run
from app.schemas.approval import ApprovalDecision, ApprovalRequestOut

router = APIRouter(prefix="/approvals", tags=["approvals"])


async def _get_approval_for_org(
    approval_id: uuid.UUID,
    org_id: uuid.UUID,
    db: AsyncSession,
) -> ApprovalRequest:
    result = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.id == approval_id,
            ApprovalRequest.org_id == org_id,
        )
    )
    approval = result.scalar_one_or_none()
    if approval is None:
        raise HTTPException(status_code=404, detail="Approval request not found")
    return approval


@router.get("", response_model=list[ApprovalRequestOut])
async def list_approvals(
    approval_status: str | None = None,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(ApprovalRequest)
        .where(ApprovalRequest.org_id == org_id)
        .order_by(ApprovalRequest.created_at.desc())
    )
    if approval_status:
        stmt = stmt.where(ApprovalRequest.status == approval_status)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{approval_id}", response_model=ApprovalRequestOut)
async def get_approval(
    approval_id: uuid.UUID,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    return await _get_approval_for_org(approval_id, org_id, db)


@router.post("/{approval_id}/decide", response_model=ApprovalRequestOut)
async def decide_approval(
    approval_id: uuid.UUID,
    payload: ApprovalDecision,
    background_tasks: BackgroundTasks,
    request: Request,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
    _role: str = Depends(require_role(["admin", "editor"])),
):
    approval = await _get_approval_for_org(approval_id, org_id, db)
    if approval.status != "pending":
        raise HTTPException(status_code=400, detail=f"Approval is already '{approval.status}'")

    approved = payload.decision == "approve"
    approval.decision = payload.decision
    approval.decided_at = datetime.now(timezone.utc)
    approval.status = "approved" if approved else "rejected"

    run_res = await db.execute(select(Run).where(Run.id == approval.run_id))
    run = run_res.scalar_one_or_none()

    await db.commit()
    await db.refresh(approval)

    if run:
        background_tasks.add_task(
            _resume_run,
            str(approval.run_id),
            str(approval.thread_id),
            approved,
            request.app.state,
        )

    return approval


async def _resume_run(
    run_id: str,
    thread_id: str,
    approved: bool,
    app_state,
) -> None:
    from app.db.engine import AsyncSessionLocal
    from app.agents.executor import execute_run_resume

    redis = get_redis()
    channel = f"run:{run_id}"

    await redis.publish(channel, json.dumps({
        "event": "approval_decision",
        "run_id": run_id,
        "approved": approved,
    }))

    try:
        checkpointer = getattr(app_state, "checkpointer", None)
        if checkpointer is None:
            raise RuntimeError("Checkpointer not initialised — cannot resume run")
        await execute_run_resume(run_id, thread_id, approved, checkpointer)
    except Exception as exc:
        async with AsyncSessionLocal() as db:
            run_res = await db.execute(
                text("SELECT id FROM runs WHERE id = :id"),
                {"id": run_id},
            )
            if run_res.scalar_one_or_none():
                await db.execute(
                    text("UPDATE runs SET status='failed', error=:err WHERE id=:id"),
                    {"err": str(exc), "id": run_id},
                )
                await db.commit()
        await redis.publish(channel, json.dumps({"event": "error", "run_id": run_id, "error": str(exc)}))
