"""Commission Engine API endpoints.

GET    /api/commission-plans                    — list plans
POST   /api/commission-plans                    — create plan
GET    /api/commission-plans/{id}               — get plan
PATCH  /api/commission-plans/{id}               — update plan

GET    /api/quota-allocations                   — list quota allocations
POST   /api/quota-allocations                   — create/update quota

GET    /api/commission/calculate                — calculate commission for current user
POST   /api/commission/what-if                  — what-if simulation
GET    /api/commission/attainment               — attainment history
POST   /api/commission/snapshot                 — take attainment snapshot now
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID
from datetime import datetime, date, timezone
from typing import Any
from pydantic import BaseModel

from app.dependencies import get_db
from app.auth.dependencies import resolve_org, current_user
from app.models.commission import CommissionPlan, QuotaAllocation, AttainmentSnapshot
from app.models.opportunity import Opportunity
from app.models.user import User

router = APIRouter(prefix="/commission", tags=["commission"])
plans_router = APIRouter(prefix="/commission-plans", tags=["commission"])
quota_router = APIRouter(prefix="/quota-allocations", tags=["commission"])

# ── Schemas ───────────────────────────────────────────────────────────────────

class CommissionPlanOut(BaseModel):
    id: UUID
    org_id: UUID
    name: str
    description: str | None = None
    plan_year: int
    plan_type: str
    is_active: bool
    definition: dict
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class CommissionPlanCreate(BaseModel):
    name: str
    description: str | None = None
    plan_year: int
    plan_type: str = "tiered"
    is_active: bool = True
    definition: dict = {}


class CommissionPlanUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    plan_type: str | None = None
    is_active: bool | None = None
    definition: dict | None = None


class QuotaAllocationOut(BaseModel):
    id: UUID
    org_id: UUID
    user_id: UUID
    plan_id: UUID | None = None
    period_year: int
    period_month: int | None = None
    quota_amount: float
    quota_type: str
    created_at: datetime
    model_config = {"from_attributes": True}


class QuotaAllocationCreate(BaseModel):
    user_id: UUID
    plan_id: UUID | None = None
    period_year: int
    period_month: int | None = None
    quota_amount: float
    quota_type: str = "arr"


class WhatIfDeal(BaseModel):
    id: str = "hypo"
    name: str
    arr: float
    close_date: str = ""
    deal_type: str = "new"


class WhatIfRequest(BaseModel):
    user_id: UUID
    plan_id: UUID
    period_year: int
    period_month: int | None = None
    hypothetical_deals: list[WhatIfDeal]


# ── Commission Plans ──────────────────────────────────────────────────────────

@plans_router.get("", response_model=list[CommissionPlanOut])
async def list_plans(
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CommissionPlan).where(CommissionPlan.org_id == org_id).order_by(CommissionPlan.plan_year.desc())
    )
    return result.scalars().all()


@plans_router.post("", response_model=CommissionPlanOut, status_code=status.HTTP_201_CREATED)
async def create_plan(
    payload: CommissionPlanCreate,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    plan = CommissionPlan(org_id=org_id, **payload.model_dump())
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


@plans_router.get("/{plan_id}", response_model=CommissionPlanOut)
async def get_plan(
    plan_id: UUID,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CommissionPlan).where(CommissionPlan.id == plan_id, CommissionPlan.org_id == org_id)
    )
    plan = result.scalar_one_or_none()
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found")
    return plan


@plans_router.patch("/{plan_id}", response_model=CommissionPlanOut)
async def update_plan(
    plan_id: UUID,
    payload: CommissionPlanUpdate,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CommissionPlan).where(CommissionPlan.id == plan_id, CommissionPlan.org_id == org_id)
    )
    plan = result.scalar_one_or_none()
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(plan, field, value)
    await db.commit()
    await db.refresh(plan)
    return plan


# ── Quota Allocations ─────────────────────────────────────────────────────────

@quota_router.get("", response_model=list[QuotaAllocationOut])
async def list_quotas(
    user_id: UUID | None = Query(None),
    period_year: int | None = Query(None),
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    q = select(QuotaAllocation).where(QuotaAllocation.org_id == org_id)
    if user_id:
        q = q.where(QuotaAllocation.user_id == user_id)
    if period_year:
        q = q.where(QuotaAllocation.period_year == period_year)
    result = await db.execute(q.order_by(QuotaAllocation.period_year.desc()))
    return result.scalars().all()


@quota_router.post("", response_model=QuotaAllocationOut, status_code=status.HTTP_201_CREATED)
async def create_or_update_quota(
    payload: QuotaAllocationCreate,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    # Check for existing
    existing_result = await db.execute(
        select(QuotaAllocation).where(
            QuotaAllocation.org_id == org_id,
            QuotaAllocation.user_id == payload.user_id,
            QuotaAllocation.period_year == payload.period_year,
            QuotaAllocation.period_month == payload.period_month,
        )
    )
    existing = existing_result.scalar_one_or_none()
    if existing:
        existing.quota_amount = payload.quota_amount
        existing.quota_type = payload.quota_type
        if payload.plan_id:
            existing.plan_id = payload.plan_id
        await db.commit()
        await db.refresh(existing)
        return existing

    alloc = QuotaAllocation(org_id=org_id, **payload.model_dump())
    db.add(alloc)
    await db.commit()
    await db.refresh(alloc)
    return alloc


# ── Commission Calculation ─────────────────────────────────────────────────────

@router.get("/calculate")
async def calculate_commission(
    user_id: UUID = Query(...),
    plan_id: UUID = Query(...),
    period_year: int = Query(...),
    period_month: int | None = Query(None),
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    """Calculate commission for a rep in a given period."""
    from app.agents.prebuilt.commission_engine import calculate_commission as calc_fn, DealRecord

    # Get plan
    plan_res = await db.execute(
        select(CommissionPlan).where(CommissionPlan.id == plan_id, CommissionPlan.org_id == org_id)
    )
    plan = plan_res.scalar_one_or_none()
    if not plan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found")

    # Get quota
    quota_res = await db.execute(
        select(QuotaAllocation).where(
            QuotaAllocation.org_id == org_id,
            QuotaAllocation.user_id == user_id,
            QuotaAllocation.period_year == period_year,
            QuotaAllocation.period_month == period_month,
        )
    )
    quota_alloc = quota_res.scalar_one_or_none()
    quota = float(quota_alloc.quota_amount) if quota_alloc else 0.0

    # Get closed-won opportunities in the period
    q = select(Opportunity).where(
        Opportunity.org_id == org_id,
        Opportunity.owner_id == user_id,
        Opportunity.won_at.isnot(None),
    )
    if period_month:
        q = q.where(
            func.date_part("year", Opportunity.won_at) == period_year,
            func.date_part("month", Opportunity.won_at) == period_month,
        )
    else:
        q = q.where(func.date_part("year", Opportunity.won_at) == period_year)

    opps_res = await db.execute(q)
    closed_opps = opps_res.scalars().all()

    deals = [
        DealRecord(
            id=str(o.id),
            name=o.name,
            arr=float(o.arr or 0),
            close_date=o.won_at.date().isoformat() if o.won_at else "",
            deal_type=o.deal_type or "new",
            is_closed_won=True,
        )
        for o in closed_opps
    ]

    plan_dict = {"id": str(plan.id), "name": plan.name, "plan_type": plan.plan_type, **plan.definition}
    result = calc_fn(str(user_id), plan_dict, quota, deals, period_year, period_month)

    return {
        "user_id": result.user_id,
        "plan_name": result.plan_name,
        "period": f"{period_year}-{period_month:02d}" if period_month else str(period_year),
        "quota": result.quota,
        "attainment_amount": result.attainment_amount,
        "attainment_pct": result.attainment_pct,
        "base_commission": result.base_commission,
        "accelerator_bonus": result.accelerator_bonus,
        "spif_bonus": result.spif_bonus,
        "draw_recovery": result.draw_recovery,
        "total_commission": result.total_commission,
        "tier_breakdown": result.tier_breakdown,
        "deal_breakdown": result.deal_breakdown,
        "notes": result.notes,
    }


@router.post("/what-if")
async def what_if(
    payload: WhatIfRequest,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    """What-if commission simulation: given hypothetical closed deals, what would the payout be?"""
    from app.agents.prebuilt.commission_engine import what_if_simulation, DealRecord

    plan_res = await db.execute(
        select(CommissionPlan).where(CommissionPlan.id == payload.plan_id, CommissionPlan.org_id == org_id)
    )
    plan = plan_res.scalar_one_or_none()
    if not plan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found")

    quota_res = await db.execute(
        select(QuotaAllocation).where(
            QuotaAllocation.org_id == org_id,
            QuotaAllocation.user_id == payload.user_id,
            QuotaAllocation.period_year == payload.period_year,
            QuotaAllocation.period_month == payload.period_month,
        )
    )
    quota_alloc = quota_res.scalar_one_or_none()
    quota = float(quota_alloc.quota_amount) if quota_alloc else 0.0

    # Current closed deals
    q = select(Opportunity).where(
        Opportunity.org_id == org_id,
        Opportunity.owner_id == payload.user_id,
        Opportunity.won_at.isnot(None),
    )
    if payload.period_month:
        q = q.where(
            func.date_part("year", Opportunity.won_at) == payload.period_year,
            func.date_part("month", Opportunity.won_at) == payload.period_month,
        )
    else:
        q = q.where(func.date_part("year", Opportunity.won_at) == payload.period_year)

    opps_res = await db.execute(q)
    current_deals = [
        DealRecord(id=str(o.id), name=o.name, arr=float(o.arr or 0),
                   close_date="", deal_type=o.deal_type or "new", is_closed_won=True)
        for o in opps_res.scalars().all()
    ]

    hypo_deals = [
        DealRecord(id=d.id, name=d.name, arr=d.arr, close_date=d.close_date,
                   deal_type=d.deal_type, is_closed_won=True)
        for d in payload.hypothetical_deals
    ]

    plan_dict = {"id": str(plan.id), "name": plan.name, "plan_type": plan.plan_type, **plan.definition}
    return what_if_simulation(str(payload.user_id), plan_dict, quota, current_deals, hypo_deals,
                               payload.period_year, payload.period_month)


@router.get("/attainment")
async def get_attainment(
    user_id: UUID = Query(...),
    period_year: int = Query(...),
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AttainmentSnapshot).where(
            AttainmentSnapshot.org_id == org_id,
            AttainmentSnapshot.user_id == user_id,
            AttainmentSnapshot.period_year == period_year,
        ).order_by(AttainmentSnapshot.snapshot_date.asc())
    )
    snapshots = result.scalars().all()
    return [
        {
            "date": s.snapshot_date.isoformat(),
            "month": s.period_month,
            "attainment_amount": float(s.attainment_amount),
            "attainment_pct": float(s.attainment_pct),
            "commission_earned": float(s.commission_earned),
        }
        for s in snapshots
    ]
