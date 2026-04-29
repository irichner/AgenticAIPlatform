from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID
from datetime import datetime, timezone

from app.dependencies import get_db
from app.auth.dependencies import resolve_org
from app.models.opportunity import Opportunity, OpportunityStage
from app.schemas.opportunity import (
    OpportunityCreate, OpportunityUpdate, OpportunityOut,
    OpportunityStageCreate, OpportunityStageUpdate, OpportunityStageOut,
)

router = APIRouter(tags=["crm-opportunities"])

# ── Stages ────────────────────────────────────────────────────────────────────

stages_router = APIRouter(prefix="/opportunity-stages")


@stages_router.get("", response_model=list[OpportunityStageOut])
async def list_stages(
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OpportunityStage)
        .where(OpportunityStage.org_id == org_id)
        .order_by(OpportunityStage.order)
    )
    return result.scalars().all()


@stages_router.post("", response_model=OpportunityStageOut, status_code=status.HTTP_201_CREATED)
async def create_stage(
    payload: OpportunityStageCreate,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    stage = OpportunityStage(org_id=org_id, **payload.model_dump())
    db.add(stage)
    await db.commit()
    await db.refresh(stage)
    return stage


@stages_router.patch("/{stage_id}", response_model=OpportunityStageOut)
async def update_stage(
    stage_id: UUID,
    payload: OpportunityStageUpdate,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OpportunityStage).where(
            OpportunityStage.id == stage_id, OpportunityStage.org_id == org_id
        )
    )
    stage = result.scalar_one_or_none()
    if stage is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stage not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(stage, field, value)
    await db.commit()
    await db.refresh(stage)
    return stage


@stages_router.delete("/{stage_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stage(
    stage_id: UUID,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OpportunityStage).where(
            OpportunityStage.id == stage_id, OpportunityStage.org_id == org_id
        )
    )
    stage = result.scalar_one_or_none()
    if stage is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stage not found")
    await db.delete(stage)
    await db.commit()


# ── Opportunities ─────────────────────────────────────────────────────────────

opps_router = APIRouter(prefix="/opportunities")


@opps_router.get("", response_model=list[OpportunityOut])
async def list_opportunities(
    account_id: UUID | None = Query(None),
    owner_id: UUID | None = Query(None),
    stage_id: UUID | None = Query(None),
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    q = select(Opportunity).where(Opportunity.org_id == org_id)
    if account_id:
        q = q.where(Opportunity.account_id == account_id)
    if owner_id:
        q = q.where(Opportunity.owner_id == owner_id)
    if stage_id:
        q = q.where(Opportunity.stage_id == stage_id)
    result = await db.execute(q.order_by(Opportunity.close_date.asc().nulls_last()))
    return result.scalars().all()


@opps_router.post("", response_model=OpportunityOut, status_code=status.HTTP_201_CREATED)
async def create_opportunity(
    payload: OpportunityCreate,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    opp = Opportunity(org_id=org_id, **payload.model_dump())
    db.add(opp)
    await db.commit()
    await db.refresh(opp)
    return opp


@opps_router.get("/{opp_id}", response_model=OpportunityOut)
async def get_opportunity(
    opp_id: UUID,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Opportunity).where(Opportunity.id == opp_id, Opportunity.org_id == org_id)
    )
    opp = result.scalar_one_or_none()
    if opp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Opportunity not found")
    return opp


@opps_router.patch("/{opp_id}", response_model=OpportunityOut)
async def update_opportunity(
    opp_id: UUID,
    payload: OpportunityUpdate,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Opportunity).where(Opportunity.id == opp_id, Opportunity.org_id == org_id)
    )
    opp = result.scalar_one_or_none()
    if opp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Opportunity not found")

    updates = payload.model_dump(exclude_unset=True)

    # Auto-stamp won/lost timestamps
    newly_won = False
    if "stage_id" in updates and updates["stage_id"]:
        stage_res = await db.execute(
            select(OpportunityStage).where(
                OpportunityStage.id == updates["stage_id"],
                OpportunityStage.org_id == org_id,
            )
        )
        stage = stage_res.scalar_one_or_none()
        if stage:
            if stage.is_won and not opp.won_at:
                opp.won_at = datetime.now(timezone.utc)
                newly_won = True
            elif stage.is_lost and not opp.lost_at:
                opp.lost_at = datetime.now(timezone.utc)

    for field, value in updates.items():
        setattr(opp, field, value)

    await db.commit()
    await db.refresh(opp)

    # Push leaderboard score on deal close (fire-and-forget)
    if newly_won and opp.owner_id and opp.arr and opp.won_at:
        import asyncio
        from app.services.leaderboard import add_or_update_score
        asyncio.create_task(add_or_update_score(
            str(org_id),
            str(opp.owner_id),
            float(opp.arr),
            opp.won_at.year,
            opp.won_at.month,
        ))

    return opp


@opps_router.delete("/{opp_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_opportunity(
    opp_id: UUID,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Opportunity).where(Opportunity.id == opp_id, Opportunity.org_id == org_id)
    )
    opp = result.scalar_one_or_none()
    if opp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Opportunity not found")
    await db.delete(opp)
    await db.commit()


# Pipeline summary: total ARR by stage
@opps_router.get("/summary/pipeline", response_model=list[dict])
async def pipeline_summary(
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(
            Opportunity.stage_id,
            func.count(Opportunity.id).label("count"),
            func.sum(Opportunity.arr).label("total_arr"),
        )
        .where(Opportunity.org_id == org_id, Opportunity.won_at.is_(None), Opportunity.lost_at.is_(None))
        .group_by(Opportunity.stage_id)
    )
    rows = result.all()
    return [{"stage_id": str(r.stage_id) if r.stage_id else None, "count": r.count, "total_arr": float(r.total_arr or 0)} for r in rows]
