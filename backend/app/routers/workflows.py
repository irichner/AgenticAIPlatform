from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from app.dependencies import get_db
from app.auth.dependencies import require_org_permission
from app.auth.context import AuthContext
from app.auth.permissions import P
from app.models.workflow import Workflow, WorkflowVersion
from app.schemas.workflow import (
    WorkflowCreate,
    WorkflowUpdate,
    WorkflowOut,
    WorkflowListItem,
    WorkflowVersionCreate,
    WorkflowVersionOut,
)

router = APIRouter(prefix="/workflows", tags=["workflows"])


def _owns_or_admin(workflow: Workflow, ctx: AuthContext) -> bool:
    return "*" in ctx.permissions or workflow.created_by == ctx.user.id


@router.get("", response_model=list[WorkflowListItem])
async def list_workflows(
    ctx: AuthContext = Depends(require_org_permission(P.WORKFLOW_READ)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Workflow)
        .where(Workflow.org_id == ctx.scope_id)
        .order_by(Workflow.updated_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=WorkflowOut, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    payload: WorkflowCreate,
    ctx: AuthContext = Depends(require_org_permission(P.WORKFLOW_CREATE)),
    db: AsyncSession = Depends(get_db),
):
    wf = Workflow(org_id=ctx.scope_id, name=payload.name, graph=payload.graph, created_by=ctx.user.id)
    db.add(wf)
    await db.commit()
    await db.refresh(wf)
    return wf


@router.get("/{workflow_id}", response_model=WorkflowOut)
async def get_workflow(
    workflow_id: UUID,
    ctx: AuthContext = Depends(require_org_permission(P.WORKFLOW_READ)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Workflow).where(Workflow.id == workflow_id, Workflow.org_id == ctx.scope_id)
    )
    wf = result.scalar_one_or_none()
    if wf is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return wf


@router.put("/{workflow_id}", response_model=WorkflowOut)
async def update_workflow(
    workflow_id: UUID,
    payload: WorkflowUpdate,
    ctx: AuthContext = Depends(require_org_permission(P.WORKFLOW_UPDATE)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Workflow).where(Workflow.id == workflow_id, Workflow.org_id == ctx.scope_id)
    )
    wf = result.scalar_one_or_none()
    if wf is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    if not _owns_or_admin(wf, ctx):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only edit your own workflows")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(wf, field, value)

    await db.commit()
    await db.refresh(wf)
    return wf


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow(
    workflow_id: UUID,
    ctx: AuthContext = Depends(require_org_permission(P.WORKFLOW_DELETE)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Workflow).where(Workflow.id == workflow_id, Workflow.org_id == ctx.scope_id)
    )
    wf = result.scalar_one_or_none()
    if wf is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    if not _owns_or_admin(wf, ctx):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only delete your own workflows")

    await db.delete(wf)
    await db.commit()


@router.get("/{workflow_id}/versions", response_model=list[WorkflowVersionOut])
async def list_versions(
    workflow_id: UUID,
    ctx: AuthContext = Depends(require_org_permission(P.WORKFLOW_READ)),
    db: AsyncSession = Depends(get_db),
):
    wf = await db.execute(
        select(Workflow).where(Workflow.id == workflow_id, Workflow.org_id == ctx.scope_id)
    )
    if not wf.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    result = await db.execute(
        select(WorkflowVersion)
        .where(WorkflowVersion.workflow_id == workflow_id)
        .order_by(WorkflowVersion.version.desc())
    )
    return result.scalars().all()


@router.post(
    "/{workflow_id}/versions",
    response_model=WorkflowVersionOut,
    status_code=status.HTTP_201_CREATED,
)
async def save_version(
    workflow_id: UUID,
    payload: WorkflowVersionCreate,
    ctx: AuthContext = Depends(require_org_permission(P.WORKFLOW_UPDATE)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Workflow).where(Workflow.id == workflow_id, Workflow.org_id == ctx.scope_id)
    )
    wf = result.scalar_one_or_none()
    if wf is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    if not _owns_or_admin(wf, ctx):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only version your own workflows")

    snap = WorkflowVersion(
        workflow_id=wf.id,
        version=wf.version,
        name=wf.name,
        graph=wf.graph,
        bpmn_xml=wf.bpmn_xml,
        note=payload.note,
    )
    db.add(snap)
    wf.version = wf.version + 1

    await db.commit()
    await db.refresh(snap)
    return snap


@router.post(
    "/{workflow_id}/versions/{version_id}/restore",
    response_model=WorkflowOut,
)
async def restore_version(
    workflow_id: UUID,
    version_id: UUID,
    ctx: AuthContext = Depends(require_org_permission(P.WORKFLOW_UPDATE)),
    db: AsyncSession = Depends(get_db),
):
    wf_result = await db.execute(
        select(Workflow).where(Workflow.id == workflow_id, Workflow.org_id == ctx.scope_id)
    )
    wf = wf_result.scalar_one_or_none()
    if wf is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    if not _owns_or_admin(wf, ctx):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only restore your own workflows")

    ver_result = await db.execute(
        select(WorkflowVersion)
        .where(WorkflowVersion.id == version_id, WorkflowVersion.workflow_id == workflow_id)
    )
    ver = ver_result.scalar_one_or_none()
    if ver is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")

    wf.graph    = ver.graph
    wf.bpmn_xml = ver.bpmn_xml
    wf.name     = ver.name

    await db.commit()
    await db.refresh(wf)
    return wf
