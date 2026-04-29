from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.db_tools import list_available_tables
from app.auth.dependencies import resolve_org
from app.dependencies import get_db
from app.models.agent import Agent
from app.models.agent_db_policy import AgentDbPolicy
from app.models.business_unit import BusinessUnit
from app.schemas.agent_db_policy import AgentDbPolicyCreate, AgentDbPolicyOut, AgentDbPolicyUpdate, TableInfoOut

router = APIRouter(prefix="/agent-db-policies", tags=["agent-db-policies"])


async def _get_policy(policy_id: uuid.UUID, org_id: uuid.UUID, db: AsyncSession) -> AgentDbPolicy:
    result = await db.execute(
        select(AgentDbPolicy).where(
            AgentDbPolicy.id == policy_id,
            AgentDbPolicy.org_id == org_id,
        )
    )
    policy = result.scalar_one_or_none()
    if policy is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found")
    return policy


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


@router.get("/tables", response_model=list[TableInfoOut])
async def get_available_tables(
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    """Return all database tables that can be granted to agents, with column metadata."""
    tables = await list_available_tables(db)
    return [
        TableInfoOut(
            table_name=t["table_name"],
            columns=t["columns"],
            has_org_id=t["has_org_id"],
        )
        for t in tables
    ]


@router.get("", response_model=list[AgentDbPolicyOut])
async def list_policies(
    agent_id: uuid.UUID | None = None,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    q = select(AgentDbPolicy).where(AgentDbPolicy.org_id == org_id)
    if agent_id is not None:
        q = q.where(AgentDbPolicy.agent_id == agent_id)
    q = q.order_by(AgentDbPolicy.table_name)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=AgentDbPolicyOut, status_code=status.HTTP_201_CREATED)
async def create_policy(
    payload: AgentDbPolicyCreate,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    await _get_agent(payload.agent_id, org_id, db)

    # Check for duplicate (agent_id, table_name)
    existing = await db.execute(
        select(AgentDbPolicy).where(
            AgentDbPolicy.agent_id == payload.agent_id,
            AgentDbPolicy.table_name == payload.table_name,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A policy for table '{payload.table_name}' already exists for this agent",
        )

    policy = AgentDbPolicy(
        org_id=org_id,
        agent_id=payload.agent_id,
        name=payload.name,
        table_name=payload.table_name,
        allowed_operations=list(payload.allowed_operations),
        column_allowlist=payload.column_allowlist,
        column_blocklist=payload.column_blocklist,
        row_limit=payload.row_limit,
        enabled=payload.enabled,
    )
    db.add(policy)
    await db.commit()
    await db.refresh(policy)
    return policy


@router.get("/{policy_id}", response_model=AgentDbPolicyOut)
async def get_policy(
    policy_id: uuid.UUID,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    return await _get_policy(policy_id, org_id, db)


@router.put("/{policy_id}", response_model=AgentDbPolicyOut)
async def update_policy(
    policy_id: uuid.UUID,
    payload: AgentDbPolicyUpdate,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    policy = await _get_policy(policy_id, org_id, db)

    for field, val in payload.model_dump(exclude_none=True).items():
        if field == "allowed_operations" and val is not None:
            val = list(val)
        setattr(policy, field, val)

    await db.commit()
    await db.refresh(policy)
    return policy


@router.delete("/{policy_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_policy(
    policy_id: uuid.UUID,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    policy = await _get_policy(policy_id, org_id, db)
    await db.delete(policy)
    await db.commit()


@router.post("/{policy_id}/toggle", response_model=AgentDbPolicyOut)
async def toggle_policy(
    policy_id: uuid.UUID,
    org_id: uuid.UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    policy = await _get_policy(policy_id, org_id, db)
    policy.enabled = not policy.enabled
    await db.commit()
    await db.refresh(policy)
    return policy
