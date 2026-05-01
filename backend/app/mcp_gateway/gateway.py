"""
MCPGateway — main orchestrator.

list_tools(org_id, run_id, user_id, user_roles):
  1. Feature-flag check
  2. Load registrations for org
  3. Build EgressGuard
  4. For each registration: auth → manifest cache hit/miss → list tools
  5. Filter by RBACChecker
  6. Create ManifestSnapshot for run_id (once per run)
  7. Return merged tool list

call_tool(org_id, run_id, user_id, user_roles, registration_id, tool_name, tool_args, idempotency_key):
  1. Feature-flag check
  2. Load registration (enforce org_id match)
  3. Idempotency check
  4. Budget reserve
  5. EgressGuard.check
  6. RBAC assert_allowed
  7. Snapshot assert_tool_in_snapshot
  8. Auth headers
  9. MCPClient.call_tool
  10. Sanitize output
  11. Idempotency complete / fail
  12. Budget update
  13. emit_call_record
  14. Return sanitized result
"""
from __future__ import annotations

import hashlib
import json
import time
import uuid
import logging
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.mcp_gateway.auth import get_auth_handler
from app.mcp_gateway.budget import init_budget, reserve_call, get_remaining
from app.mcp_gateway.cache import get_manifest, set_manifest
from app.mcp_gateway.client import MCPClient, CircuitOpenError
from app.mcp_gateway.egress import EgressGuard
from app.mcp_gateway.idempotency import claim, complete, fail, IdempotencyConflictError
from app.mcp_gateway.models import McpRegistration
from app.mcp_gateway.observability import emit_call_record
from app.mcp_gateway.rbac import RBACChecker
from app.mcp_gateway.sanitizer import sanitize
from app.mcp_gateway.schemas import ToolInfo, ToolCallResult
from app.mcp_gateway.snapshot import (
    create_snapshot,
    get_snapshot,
    assert_tool_in_snapshot,
)
from app.models.org import Org

logger = logging.getLogger(__name__)


def _credential_hash(auth_config: dict | None) -> str:
    if not auth_config:
        return "none"
    stable = json.dumps(auth_config, sort_keys=True).encode()
    return hashlib.sha256(stable).hexdigest()[:16]


async def _check_feature_flag(db: AsyncSession, org_id: uuid.UUID) -> None:
    org = await db.get(Org, org_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Org not found")
    if not getattr(org, "mcp_gateway_enabled", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="MCP Gateway is not enabled for this org",
        )


async def list_tools(
    db: AsyncSession,
    org_id: uuid.UUID,
    run_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    user_roles: list[str] | None = None,
) -> list[ToolInfo]:
    await _check_feature_flag(db, org_id)

    regs_result = await db.execute(
        select(McpRegistration)
        .options(selectinload(McpRegistration.tool_permissions))
        .where(McpRegistration.org_id == org_id, McpRegistration.enabled == True)  # noqa: E712
    )
    registrations: list[McpRegistration] = list(regs_result.scalars().all())
    if not registrations:
        return []

    egress = EgressGuard(registrations)
    rbac = RBACChecker(user_id=user_id, user_roles=user_roles or [])
    _org = await db.get(Org, org_id)

    all_tools: list[ToolInfo] = []
    tools_by_reg: dict[str, list[dict[str, Any]]] = {}

    for reg in registrations:
        try:
            egress.check(reg.mcp_url)
        except HTTPException:
            logger.warning("EgressGuard blocked registration %s (%s)", reg.id, reg.mcp_url)
            continue

        auth = get_auth_handler(reg.auth_type)
        cred_hash = _credential_hash(reg.auth_config)
        cached_tools = await get_manifest(str(org_id), str(reg.id), cred_hash)

        if cached_tools is None:
            try:
                client = MCPClient(reg, {**auth.headers(reg), "x-lanara-org-id": str(org_id)})
                raw_tools = await client.list_tools()
            except CircuitOpenError as exc:
                logger.warning("Circuit open for %s: %s", reg.name, exc)
                continue
            except Exception as exc:
                logger.warning("list_tools failed for %s: %s", reg.name, exc)
                continue
            await set_manifest(str(org_id), str(reg.id), cred_hash, raw_tools)
        else:
            raw_tools = cached_tools

        filtered = rbac.filter_tools(raw_tools, reg.tool_permissions)
        tools_by_reg[str(reg.id)] = filtered

        for tool in filtered:
            all_tools.append(ToolInfo(
                name=tool["name"],
                description=tool.get("description"),
                input_schema=tool.get("inputSchema", {}),
                registration_id=reg.id,
            ))

    # Pin snapshot once at run start
    if run_id is not None:
        existing = await get_snapshot(db, run_id)
        if existing is None:
            await create_snapshot(db, run_id, org_id, user_id, registrations, tools_by_reg)

    return all_tools


async def call_tool(
    db: AsyncSession,
    org_id: uuid.UUID,
    registration_id: uuid.UUID,
    tool_name: str,
    tool_args: dict[str, Any],
    run_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    user_roles: list[str] | None = None,
    idempotency_key: str | None = None,
) -> ToolCallResult:
    await _check_feature_flag(db, org_id)

    reg_result = await db.execute(
        select(McpRegistration)
        .options(selectinload(McpRegistration.tool_permissions))
        .where(McpRegistration.id == registration_id, McpRegistration.org_id == org_id)
    )
    reg = reg_result.scalar_one_or_none()
    if reg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")
    if not reg.enabled:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Registration is disabled")

    # Idempotency
    if idempotency_key:
        try:
            existing = await claim(db, org_id, registration_id, tool_name, idempotency_key)
        except IdempotencyConflictError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
        if existing is not None:
            return ToolCallResult(
                tool_name=tool_name,
                result=existing.result_json,
                cached=True,
                budget_remaining=await get_remaining(str(run_id)) if run_id else None,
            )

    # Budget
    run_id_str = str(run_id) if run_id else f"direct:{uuid.uuid4()}"
    remaining = await get_remaining(run_id_str)
    if remaining is None:
        await init_budget(run_id_str, reg.max_tool_calls_per_run, reg.max_wall_time_seconds)

    try:
        remaining = await reserve_call(run_id_str, reg.max_wall_time_seconds)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc))

    # Egress
    egress = EgressGuard([reg])
    egress.check(reg.mcp_url)

    # RBAC
    rbac = RBACChecker(user_id=user_id, user_roles=user_roles or [])
    perm = rbac.assert_allowed(tool_name, reg.tool_permissions)

    # Requires idempotency key check
    if perm and perm.requires_idempotency_key and not idempotency_key:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Tool '{tool_name}' requires an idempotency_key",
        )

    # Snapshot check
    if run_id is not None:
        snapshot = await get_snapshot(db, run_id)
        if snapshot is not None:
            assert_tool_in_snapshot(snapshot, registration_id, tool_name)

    auth = get_auth_handler(reg.auth_type)
    mcp_headers = {**auth.headers(reg), "x-lanara-org-id": str(org_id)}
    client = MCPClient(reg, mcp_headers)

    t0 = time.monotonic()
    raw_result = None
    error_str = None

    try:
        raw_result = await client.call_tool(tool_name, tool_args)
        sanitized = sanitize(raw_result)
    except CircuitOpenError as exc:
        error_str = str(exc)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=error_str)
    except Exception as exc:
        error_str = str(exc)
        if idempotency_key:
            await fail(db, org_id, registration_id, tool_name, idempotency_key, error_str)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=error_str)
    finally:
        latency_ms = (time.monotonic() - t0) * 1000
        emit_call_record(
            org_id=str(org_id),
            run_id=str(run_id) if run_id else None,
            registration_id=str(registration_id),
            tool_name=tool_name,
            credential_hash=reg.credential_hash,
            args=tool_args,
            result=raw_result,
            error=error_str,
            latency_ms=latency_ms,
        )

    if idempotency_key:
        result_payload = {"content": sanitized}
        await complete(db, org_id, registration_id, tool_name, idempotency_key, result_payload)

    return ToolCallResult(
        tool_name=tool_name,
        result=sanitized,
        cached=False,
        budget_remaining=remaining,
    )


async def update_health_status(db: AsyncSession, reg: McpRegistration) -> str:
    """Probe a registration and update its health_status. Returns new status."""
    auth = get_auth_handler(reg.auth_type)
    try:
        client = MCPClient(reg, auth.headers(reg))
        await client.list_tools()
        reg.health_status = "healthy"
    except CircuitOpenError:
        reg.health_status = "circuit_open"
    except Exception:
        reg.health_status = "unreachable"
    await db.commit()
    return reg.health_status
