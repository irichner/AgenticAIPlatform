from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from app.auth.dependencies import resolve_org
from app.dependencies import get_db
from app.models.agent import Agent
from app.models.agent_group import AgentGroup
from app.models.business_unit import BusinessUnit
from app.schemas.group import AgentGroupCreate, AgentGroupOut

router = APIRouter(prefix="/groups", tags=["groups"])


@router.get("", response_model=list[AgentGroupOut])
async def list_groups(
    business_unit_id: UUID | None = None,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(AgentGroup)
        .join(BusinessUnit, BusinessUnit.id == AgentGroup.business_unit_id)
        .where(BusinessUnit.org_id == org_id)
    )
    if business_unit_id:
        stmt = stmt.where(AgentGroup.business_unit_id == business_unit_id)
    result = await db.execute(stmt.order_by(AgentGroup.name))
    return result.scalars().all()


@router.post("", response_model=AgentGroupOut, status_code=status.HTTP_201_CREATED)
async def create_group(
    payload: AgentGroupCreate,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    bu_res = await db.execute(
        select(BusinessUnit).where(
            BusinessUnit.id == payload.business_unit_id,
            BusinessUnit.org_id == org_id,
        )
    )
    if not bu_res.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business unit not found")

    group = AgentGroup(
        org_id=org_id,
        business_unit_id=payload.business_unit_id,
        name=payload.name,
        description=payload.description,
    )
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return group


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    group_id: UUID,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentGroup)
        .join(BusinessUnit, BusinessUnit.id == AgentGroup.business_unit_id)
        .where(AgentGroup.id == group_id, BusinessUnit.org_id == org_id)
    )
    group = result.scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    await db.delete(group)
    await db.commit()


@router.patch("/{group_id}/agents/{agent_id}", status_code=status.HTTP_200_OK)
async def assign_agent(
    group_id: UUID,
    agent_id: UUID,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    group_res = await db.execute(
        select(AgentGroup)
        .join(BusinessUnit, BusinessUnit.id == AgentGroup.business_unit_id)
        .where(AgentGroup.id == group_id, BusinessUnit.org_id == org_id)
    )
    if not group_res.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    agent_res = await db.execute(
        select(Agent)
        .join(BusinessUnit, BusinessUnit.id == Agent.business_unit_id)
        .where(Agent.id == agent_id, BusinessUnit.org_id == org_id)
    )
    agent = agent_res.scalar_one_or_none()
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    agent.group_id = group_id
    await db.commit()
    return {"ok": True}


@router.delete("/{group_id}/agents/{agent_id}", status_code=status.HTTP_200_OK)
async def unassign_agent(
    group_id: UUID,
    agent_id: UUID,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    group_res = await db.execute(
        select(AgentGroup)
        .join(BusinessUnit, BusinessUnit.id == AgentGroup.business_unit_id)
        .where(AgentGroup.id == group_id, BusinessUnit.org_id == org_id)
    )
    if not group_res.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    agent_res = await db.execute(
        select(Agent)
        .join(BusinessUnit, BusinessUnit.id == Agent.business_unit_id)
        .where(Agent.id == agent_id, BusinessUnit.org_id == org_id)
    )
    agent = agent_res.scalar_one_or_none()
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    agent.group_id = None
    await db.commit()
    return {"ok": True}
