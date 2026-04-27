from __future__ import annotations
from datetime import datetime
from uuid import UUID
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import csv
import io

from app.dependencies import get_db
from app.auth.dependencies import require_permission
from app.auth.context import AuthContext
from app.auth.permissions import P
from app.models.audit_log import AuditLog
from app.models.user import User
from pydantic import BaseModel

router = APIRouter(prefix="/orgs", tags=["audit"])


class AuditLogOut(BaseModel):
    id: int
    at: datetime
    actor_email: str | None
    org_id: UUID | None
    tenant_id: UUID | None
    permission: str | None
    action: str
    target_type: str | None
    target_id: str | None
    ip: str | None

    model_config = {"from_attributes": True}


@router.get("/{org_id}/audit-log", response_model=list[AuditLogOut])
async def get_audit_log(
    ctx: AuthContext = Depends(require_permission(P.ORG_AUDIT_LOG_READ, scope="org")),
    db: AsyncSession = Depends(get_db),
    actor_id: UUID | None = Query(None),
    action: str | None = Query(None),
    since: datetime | None = Query(None),
    until: datetime | None = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
) -> list[AuditLogOut]:
    stmt = (
        select(AuditLog, User.email.label("actor_email"))
        .outerjoin(User, User.id == AuditLog.actor_user_id)
        .where(AuditLog.org_id == ctx.scope_id)
    )
    if actor_id:
        stmt = stmt.where(AuditLog.actor_user_id == actor_id)
    if action:
        stmt = stmt.where(AuditLog.action.ilike(f"%{action}%"))
    if since:
        stmt = stmt.where(AuditLog.at >= since)
    if until:
        stmt = stmt.where(AuditLog.at <= until)
    stmt = stmt.order_by(AuditLog.at.desc()).limit(limit).offset(offset)

    result = await db.execute(stmt)
    rows = result.fetchall()
    return [
        AuditLogOut(
            id=log.id,
            at=log.at,
            actor_email=actor_email,
            org_id=log.org_id,
            tenant_id=log.tenant_id,
            permission=log.permission,
            action=log.action,
            target_type=log.target_type,
            target_id=log.target_id,
            ip=str(log.ip) if log.ip else None,
        )
        for log, actor_email in rows
    ]


@router.get("/{org_id}/audit-log/export")
async def export_audit_log(
    ctx: AuthContext = Depends(require_permission(P.ORG_AUDIT_LOG_READ, scope="org")),
    db: AsyncSession = Depends(get_db),
    since: datetime | None = Query(None),
    until: datetime | None = Query(None),
) -> StreamingResponse:
    stmt = (
        select(AuditLog, User.email.label("actor_email"))
        .outerjoin(User, User.id == AuditLog.actor_user_id)
        .where(AuditLog.org_id == ctx.scope_id)
    )
    if since:
        stmt = stmt.where(AuditLog.at >= since)
    if until:
        stmt = stmt.where(AuditLog.at <= until)
    stmt = stmt.order_by(AuditLog.at.desc()).limit(10_000)

    result = await db.execute(stmt)
    rows = result.fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "at", "actor", "action", "target_type", "target_id", "permission", "ip"])
    for log, actor_email in rows:
        writer.writerow([
            log.id, log.at.isoformat(), actor_email or "",
            log.action, log.target_type or "", log.target_id or "",
            log.permission or "", str(log.ip) if log.ip else "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit-log.csv"},
    )
