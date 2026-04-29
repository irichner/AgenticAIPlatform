"""Deal intelligence API endpoints.

GET  /api/deal-signals                         — list signals for org
GET  /api/opportunities/{id}/signals           — signals for a deal
GET  /api/opportunities/{id}/buying-group      — buying group members
POST /api/opportunities/{id}/buying-group      — add member manually
PATCH /api/opportunities/{id}/buying-group/{mid} — update member role
GET  /api/opportunities/{id}/next-best-action  — AI recommendation
POST /api/opportunities/{id}/score             — trigger deal health rescore
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from pydantic import BaseModel

from app.dependencies import get_db
from app.auth.dependencies import resolve_org
from app.models.deal_intelligence import DealSignal, BuyingGroupMember
from app.models.opportunity import Opportunity

router = APIRouter(tags=["deal-intelligence"])

# ── Schemas ───────────────────────────────────────────────────────────────────

class DealSignalOut(BaseModel):
    id: UUID
    org_id: UUID
    opportunity_id: UUID
    signal_type: str
    severity: str
    title: str
    description: str | None = None
    created_at: str

    model_config = {"from_attributes": True}

    def model_post_init(self, __context):
        if hasattr(self, 'created_at') and not isinstance(self.created_at, str):
            self.created_at = self.created_at.isoformat()


class BuyingGroupMemberOut(BaseModel):
    id: UUID
    org_id: UUID
    opportunity_id: UUID
    contact_id: UUID | None = None
    name: str
    email: str | None = None
    role: str
    engagement_level: str
    discovered_via: str | None = None
    notes: str | None = None
    created_at: str

    model_config = {"from_attributes": True}

    def model_post_init(self, __context):
        if hasattr(self, 'created_at') and not isinstance(self.created_at, str):
            self.created_at = self.created_at.isoformat()


class BuyingGroupMemberCreate(BaseModel):
    name: str
    email: str | None = None
    role: str = "unknown"
    engagement_level: str = "unknown"
    contact_id: UUID | None = None
    notes: str | None = None


class BuyingGroupMemberUpdate(BaseModel):
    role: str | None = None
    engagement_level: str | None = None
    notes: str | None = None


# ── Deal Signals ──────────────────────────────────────────────────────────────

signals_router = APIRouter(prefix="/deal-signals")


@signals_router.get("", response_model=list[dict])
async def list_deal_signals(
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
):
    result = await db.execute(
        select(DealSignal)
        .where(DealSignal.org_id == org_id)
        .order_by(DealSignal.created_at.desc())
        .limit(limit)
    )
    signals = result.scalars().all()
    return [
        {
            "id": str(s.id),
            "opportunity_id": str(s.opportunity_id),
            "signal_type": s.signal_type,
            "severity": s.severity,
            "title": s.title,
            "description": s.description,
            "created_at": s.created_at.isoformat(),
        }
        for s in signals
    ]


# ── Per-opportunity: signals, buying group, NBA, score ───────────────────────

opp_intelligence_router = APIRouter(prefix="/opportunities/{opp_id}")


async def _get_opp(db, opp_id, org_id):
    result = await db.execute(
        select(Opportunity).where(Opportunity.id == opp_id, Opportunity.org_id == org_id)
    )
    opp = result.scalar_one_or_none()
    if opp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Opportunity not found")
    return opp


@opp_intelligence_router.get("/signals")
async def get_opp_signals(
    opp_id: UUID,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    await _get_opp(db, opp_id, org_id)
    result = await db.execute(
        select(DealSignal)
        .where(DealSignal.org_id == org_id, DealSignal.opportunity_id == opp_id)
        .order_by(DealSignal.created_at.desc())
    )
    signals = result.scalars().all()
    return [
        {
            "id": str(s.id), "signal_type": s.signal_type, "severity": s.severity,
            "title": s.title, "description": s.description, "created_at": s.created_at.isoformat(),
        }
        for s in signals
    ]


@opp_intelligence_router.get("/buying-group")
async def get_buying_group(
    opp_id: UUID,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    await _get_opp(db, opp_id, org_id)
    result = await db.execute(
        select(BuyingGroupMember)
        .where(BuyingGroupMember.org_id == org_id, BuyingGroupMember.opportunity_id == opp_id)
        .order_by(BuyingGroupMember.created_at.asc())
    )
    members = result.scalars().all()
    return [
        {
            "id": str(m.id), "name": m.name, "email": m.email, "role": m.role,
            "engagement_level": m.engagement_level, "discovered_via": m.discovered_via,
            "contact_id": str(m.contact_id) if m.contact_id else None,
            "notes": m.notes, "created_at": m.created_at.isoformat(),
        }
        for m in members
    ]


@opp_intelligence_router.post("/buying-group", status_code=status.HTTP_201_CREATED)
async def add_buying_group_member(
    opp_id: UUID,
    payload: BuyingGroupMemberCreate,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    await _get_opp(db, opp_id, org_id)
    member = BuyingGroupMember(
        org_id=org_id,
        opportunity_id=opp_id,
        **payload.model_dump(),
        discovered_via="manual",
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return {"id": str(member.id), "name": member.name, "role": member.role}


@opp_intelligence_router.patch("/buying-group/{member_id}")
async def update_buying_group_member(
    opp_id: UUID,
    member_id: UUID,
    payload: BuyingGroupMemberUpdate,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BuyingGroupMember).where(
            BuyingGroupMember.id == member_id,
            BuyingGroupMember.org_id == org_id,
            BuyingGroupMember.opportunity_id == opp_id,
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(member, field, value)
    await db.commit()
    await db.refresh(member)
    return {"id": str(member.id), "name": member.name, "role": member.role, "engagement_level": member.engagement_level}


@opp_intelligence_router.get("/next-best-action")
async def next_best_action(
    opp_id: UUID,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    from app.agents.prebuilt.next_best_action import get_next_best_action
    return await get_next_best_action(db, org_id, opp_id)


@opp_intelligence_router.post("/score")
async def rescore_opportunity(
    opp_id: UUID,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    from app.agents.prebuilt.deal_health import score_all_opportunities
    result = await score_all_opportunities(org_id=org_id)

    # Return updated score
    opp_res = await db.execute(
        select(Opportunity).where(Opportunity.id == opp_id, Opportunity.org_id == org_id)
    )
    opp = opp_res.scalar_one_or_none()
    return {"health_score": opp.health_score if opp else None, "scored": result["scored"]}
