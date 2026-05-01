"""
MCP Gateway FastAPI router.

Prefix: /api/mcp
Tags: mcp-gateway

Endpoints:
  GET    /registrations                        list org registrations
  POST   /registrations                        create registration
  PATCH  /registrations/{reg_id}               update registration
  DELETE /registrations/{reg_id}               delete registration
  GET    /registrations/{reg_id}/health        probe + return health status
  GET    /registrations/{reg_id}/permissions   list tool permissions
  POST   /registrations/{reg_id}/permissions   upsert tool permission
  DELETE /registrations/{reg_id}/permissions/{tool_name}  delete permission
  GET    /tools                                list all tools (merged, RBAC-filtered)
  POST   /call                                 call a tool
"""
from __future__ import annotations

import hashlib
import json
import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import resolve_org, current_user
from app.dependencies import get_db
from app.models.user import User
from app.mcp_gateway.models import McpRegistration, McpToolPermission
from app.mcp_gateway.revocation import publish_revocation
from app.mcp_gateway.schemas import (
    RegistrationCreate,
    RegistrationOut,
    RegistrationUpdate,
    ToolPermissionCreate,
    ToolPermissionOut,
    ToolCallRequest,
    ToolCallResult,
    ToolInfo,
)
import app.mcp_gateway.gateway as gateway_module

router = APIRouter(prefix="/mcp", tags=["mcp-gateway"])

logger = logging.getLogger(__name__)


def _cred_hash(auth_config: dict | None) -> str | None:
    if not auth_config:
        return None
    stable = json.dumps(auth_config, sort_keys=True).encode()
    return hashlib.sha256(stable).hexdigest()


def _redact(reg: McpRegistration) -> dict | None:
    if reg.auth_config is None:
        return None
    from app.mcp_gateway.auth import get_auth_handler
    try:
        handler = get_auth_handler(reg.auth_type)
        return handler.redact(reg)
    except Exception:
        return {"__redacted__": True}


def _reg_out(reg: McpRegistration) -> RegistrationOut:
    return RegistrationOut(
        id=reg.id,
        org_id=reg.org_id,
        name=reg.name,
        mcp_url=reg.mcp_url,
        transport=reg.transport,
        auth_type=reg.auth_type,
        auth_config=_redact(reg),
        credential_hash=reg.credential_hash,
        sampling_policy=reg.sampling_policy,
        max_tool_calls_per_run=reg.max_tool_calls_per_run,
        max_wall_time_seconds=reg.max_wall_time_seconds,
        guardrail_prompt_additions=reg.guardrail_prompt_additions,
        multi_tenant_claim=reg.multi_tenant_claim,
        health_status=reg.health_status,
        enabled=reg.enabled,
        created_at=reg.created_at,
        updated_at=reg.updated_at,
    )


# ── Registrations ─────────────────────────────────────────────────────────────

@router.get("/registrations", response_model=list[RegistrationOut])
async def list_registrations(
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(McpRegistration)
        .where(McpRegistration.org_id == org_id)
        .order_by(McpRegistration.name)
    )
    return [_reg_out(r) for r in result.scalars().all()]


@router.post("/registrations", response_model=RegistrationOut, status_code=status.HTTP_201_CREATED)
async def create_registration(
    payload: RegistrationCreate,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    reg = McpRegistration(
        org_id=org_id,
        credential_hash=_cred_hash(payload.auth_config),
        **payload.model_dump(),
    )
    db.add(reg)
    await db.commit()
    await db.refresh(reg)
    return _reg_out(reg)


@router.patch("/registrations/{reg_id}", response_model=RegistrationOut)
async def update_registration(
    reg_id: uuid.UUID,
    payload: RegistrationUpdate,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    reg = await db.scalar(
        select(McpRegistration).where(McpRegistration.id == reg_id, McpRegistration.org_id == org_id)
    )
    if reg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")

    updates = payload.model_dump(exclude_none=True)
    if "auth_config" in updates:
        updates["credential_hash"] = _cred_hash(updates["auth_config"])

    for field, value in updates.items():
        setattr(reg, field, value)

    await db.commit()
    await db.refresh(reg)

    if "auth_config" in updates or "mcp_url" in updates:
        from app.mcp_gateway.cache import invalidate_manifest
        await invalidate_manifest(str(org_id), str(reg_id), reg.credential_hash or "")
        await publish_revocation(str(reg_id), reason="credential_rotated")

    return _reg_out(reg)


@router.delete("/registrations/{reg_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_registration(
    reg_id: uuid.UUID,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    reg = await db.scalar(
        select(McpRegistration).where(McpRegistration.id == reg_id, McpRegistration.org_id == org_id)
    )
    if reg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")
    await publish_revocation(str(reg_id), reason="registration_deleted")
    await db.delete(reg)
    await db.commit()


@router.get("/registrations/{reg_id}/health")
async def probe_health(
    reg_id: uuid.UUID,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    reg = await db.scalar(
        select(McpRegistration).where(McpRegistration.id == reg_id, McpRegistration.org_id == org_id)
    )
    if reg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")
    new_status = await gateway_module.update_health_status(db, reg)
    return {"registration_id": str(reg_id), "health_status": new_status}


# ── Tool permissions ──────────────────────────────────────────────────────────

@router.get("/registrations/{reg_id}/permissions", response_model=list[ToolPermissionOut])
async def list_permissions(
    reg_id: uuid.UUID,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    reg = await db.scalar(
        select(McpRegistration).where(McpRegistration.id == reg_id, McpRegistration.org_id == org_id)
    )
    if reg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")
    result = await db.execute(
        select(McpToolPermission).where(McpToolPermission.registration_id == reg_id)
    )
    return result.scalars().all()


@router.post("/registrations/{reg_id}/permissions", response_model=ToolPermissionOut, status_code=status.HTTP_201_CREATED)
async def upsert_permission(
    reg_id: uuid.UUID,
    payload: ToolPermissionCreate,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    reg = await db.scalar(
        select(McpRegistration).where(McpRegistration.id == reg_id, McpRegistration.org_id == org_id)
    )
    if reg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")

    stmt = (
        pg_insert(McpToolPermission)
        .values(
            id=uuid.uuid4(),
            registration_id=reg_id,
            **payload.model_dump(),
        )
        .on_conflict_do_update(
            constraint="uq_mcp_tool_perm",
            set_={
                k: payload.model_dump()[k]
                for k in payload.model_dump()
                if k != "tool_name"
            },
        )
        .returning(McpToolPermission)
    )
    result = await db.execute(stmt)
    perm = result.scalar_one()
    await db.commit()
    return perm


@router.delete("/registrations/{reg_id}/permissions/{tool_name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_permission(
    reg_id: uuid.UUID,
    tool_name: str,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    reg = await db.scalar(
        select(McpRegistration).where(McpRegistration.id == reg_id, McpRegistration.org_id == org_id)
    )
    if reg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")
    perm = await db.scalar(
        select(McpToolPermission).where(
            McpToolPermission.registration_id == reg_id,
            McpToolPermission.tool_name == tool_name,
        )
    )
    if perm is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Permission not found")
    await db.delete(perm)
    await db.commit()


# ── Tools + call ──────────────────────────────────────────────────────────────

@router.get("/tools", response_model=list[ToolInfo])
async def list_tools(
    run_id: uuid.UUID | None = None,
    org_id: uuid.UUID = Depends(resolve_org),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    return await gateway_module.list_tools(
        db=db,
        org_id=org_id,
        run_id=run_id,
        user_id=user.id,
        user_roles=[],
    )


@router.post("/call", response_model=ToolCallResult)
async def call_tool(
    payload: ToolCallRequest,
    org_id: uuid.UUID = Depends(resolve_org),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    run_id = uuid.UUID(payload.run_id) if payload.run_id else None
    return await gateway_module.call_tool(
        db=db,
        org_id=org_id,
        registration_id=payload.registration_id,
        tool_name=payload.tool_name,
        tool_args=payload.tool_args,
        run_id=run_id,
        user_id=user.id,
        user_roles=[],
        idempotency_key=payload.idempotency_key,
    )
