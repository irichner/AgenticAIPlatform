from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import resolve_org
from app.dependencies import get_db
from app.models.agent import Agent
from app.models.agent_tool_allowlist import AgentToolAllowlist
from app.models.business_unit import BusinessUnit
from app.models.mcp_tool import McpTool
from app.schemas.agent_tool_allowlist import AgentToolAllowlistEntry, AgentToolAllowlistSet

router = APIRouter(prefix="/agent-tool-allowlist", tags=["agent-tool-allowlist"])


async def _verify_agent_org(agent_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession) -> None:
    result = await db.execute(
        select(Agent)
        .join(BusinessUnit, BusinessUnit.id == Agent.business_unit_id)
        .where(Agent.id == agent_id, BusinessUnit.org_id == org_id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")


@router.get("", response_model=list[AgentToolAllowlistEntry])
async def list_allowlist(
    agent_id: uuid.UUID,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    await _verify_agent_org(agent_id, org_id, db)
    result = await db.execute(
        select(AgentToolAllowlist)
        .where(AgentToolAllowlist.agent_id == agent_id)
        .order_by(AgentToolAllowlist.created_at)
    )
    return result.scalars().all()


@router.put("", response_model=list[AgentToolAllowlistEntry])
async def set_allowlist(
    payload: AgentToolAllowlistSet,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    """Replace the full allowlist for an agent. Empty mcp_tool_ids = allow all (no restriction)."""
    await _verify_agent_org(payload.agent_id, org_id, db)

    # Delete existing entries for this agent
    await db.execute(
        delete(AgentToolAllowlist).where(AgentToolAllowlist.agent_id == payload.agent_id)
    )

    # Insert new entries, resolving mcp_server_id for each tool
    new_entries: list[AgentToolAllowlist] = []
    for tool_id in payload.mcp_tool_ids:
        tool_result = await db.execute(select(McpTool).where(McpTool.id == tool_id))
        tool = tool_result.scalar_one_or_none()
        if tool is None:
            continue
        entry = AgentToolAllowlist(
            agent_id=payload.agent_id,
            mcp_server_id=tool.server_id,
            mcp_tool_id=tool_id,
        )
        db.add(entry)
        new_entries.append(entry)

    await db.commit()
    for e in new_entries:
        await db.refresh(e)
    return new_entries


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(
    entry_id: uuid.UUID,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentToolAllowlist).where(AgentToolAllowlist.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    await db.delete(entry)
    await db.commit()
