"""Deal Health Agent — scores all open opportunities and flags risks.

Runs nightly (or on-demand). For each open opportunity:
1. Calculates health score 0-100 based on signals
2. Creates DealSignal records for detected issues
3. Updates opportunity.health_score
"""
from __future__ import annotations
import asyncio
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.engine import AsyncSessionLocal
from app.models.opportunity import Opportunity
from app.models.activity import Activity
from app.models.deal_intelligence import DealSignal

_NIGHTLY_INTERVAL_SECONDS = 3600 * 6  # every 6 hours


def _compute_health_score(opp: Opportunity, activities: list[Activity], existing_signals: list[DealSignal]) -> tuple[int, list[dict]]:
    """Pure function: compute 0-100 health score and list of new signal events to emit."""
    score = 70  # baseline
    signals_to_emit: list[dict] = []
    now = datetime.now(timezone.utc)

    # 1. Days since last contact (max penalty: -30)
    if activities:
        last_activity = max(activities, key=lambda a: a.occurred_at)
        # Ensure both are offset-aware
        la_time = last_activity.occurred_at
        if la_time.tzinfo is None:
            la_time = la_time.replace(tzinfo=timezone.utc)
        days_since = (now - la_time).days
        if days_since > 30:
            score -= 30
            signals_to_emit.append({
                "signal_type": "risk_flag",
                "severity": "high",
                "title": f"No contact in {days_since} days",
                "description": f"Last activity was {days_since} days ago. Deal may be going cold.",
            })
        elif days_since > 14:
            score -= 15
            signals_to_emit.append({
                "signal_type": "risk_flag",
                "severity": "medium",
                "title": f"Low engagement — {days_since} days since last contact",
                "description": "Consider reaching out to re-engage.",
            })
    else:
        # No activities at all
        score -= 20
        signals_to_emit.append({
            "signal_type": "risk_flag",
            "severity": "medium",
            "title": "No activities logged",
            "description": "No emails, calls, or meetings recorded for this opportunity.",
        })

    # 2. Close date proximity
    if opp.close_date:
        close_dt = datetime.combine(opp.close_date, datetime.min.time()).replace(tzinfo=timezone.utc)
        days_to_close = (close_dt - now).days
        if days_to_close < 0:
            score -= 20
            signals_to_emit.append({
                "signal_type": "risk_flag",
                "severity": "high",
                "title": "Past close date",
                "description": f"Close date was {abs(days_to_close)} days ago. Update or mark as lost.",
            })
        elif days_to_close < 14 and len(activities) < 3:
            score -= 10
            signals_to_emit.append({
                "signal_type": "risk_flag",
                "severity": "medium",
                "title": "Closing soon with low activity",
                "description": f"Deal closes in {days_to_close} days but only {len(activities)} activities logged.",
            })

    # 3. Activity volume bonus
    recent_activities = [a for a in activities if (now - (a.occurred_at if a.occurred_at.tzinfo else a.occurred_at.replace(tzinfo=timezone.utc))).days <= 14]
    if len(recent_activities) >= 3:
        score += 10
    elif len(recent_activities) >= 1:
        score += 5

    # 4. Competitor mention penalty
    competitor_signals = [s for s in existing_signals if s.signal_type == "competitor_mention"]
    if competitor_signals:
        score -= 10

    return max(0, min(100, score)), signals_to_emit


async def _score_opportunity(db: AsyncSession, opp: Opportunity) -> None:
    # Get recent activities for this opportunity
    acts_result = await db.execute(
        select(Activity)
        .where(Activity.org_id == opp.org_id, Activity.opportunity_id == opp.id)
        .order_by(Activity.occurred_at.desc())
        .limit(20)
    )
    activities = acts_result.scalars().all()

    # Get existing signals
    sigs_result = await db.execute(
        select(DealSignal)
        .where(DealSignal.org_id == opp.org_id, DealSignal.opportunity_id == opp.id)
        .order_by(DealSignal.created_at.desc())
        .limit(10)
    )
    existing_signals = sigs_result.scalars().all()

    score, new_signals = _compute_health_score(opp, activities, existing_signals)

    # Update health score
    await db.execute(
        update(Opportunity)
        .where(Opportunity.id == opp.id)
        .values(health_score=score)
    )

    # Emit new deal signals (deduplicate by title within 24h)
    existing_titles = {s.title for s in existing_signals if (datetime.now(timezone.utc) - (s.created_at if s.created_at.tzinfo else s.created_at.replace(tzinfo=timezone.utc))).total_seconds() < 86400}
    for sig in new_signals:
        if sig["title"] not in existing_titles:
            db.add(DealSignal(
                org_id=opp.org_id,
                opportunity_id=opp.id,
                **sig,
            ))

    await db.commit()


async def score_all_opportunities(org_id=None) -> dict:
    """Score all open opportunities. Pass org_id to limit to one org."""
    scored = 0
    errors = 0

    async with AsyncSessionLocal() as db:
        q = select(Opportunity).where(
            Opportunity.won_at.is_(None),
            Opportunity.lost_at.is_(None),
        )
        if org_id:
            q = q.where(Opportunity.org_id == org_id)
        result = await db.execute(q)
        opportunities = result.scalars().all()

    for opp in opportunities:
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(Opportunity).where(Opportunity.id == opp.id))
                fresh_opp = result.scalar_one_or_none()
                if fresh_opp:
                    await _score_opportunity(db, fresh_opp)
                    scored += 1
        except Exception as e:
            errors += 1
            print(f"DealHealth: error scoring {opp.id}: {e}")

    return {"scored": scored, "errors": errors}


async def run_deal_health_loop() -> None:
    """Background loop: score all deals every 6 hours."""
    print("DealHealth: starting scoring loop")
    await asyncio.sleep(120)  # wait for app to fully start
    while True:
        try:
            result = await score_all_opportunities()
            print(f"DealHealth: scored {result['scored']} opportunities, {result['errors']} errors")
        except Exception as e:
            print(f"DealHealth: loop error: {e}")
        await asyncio.sleep(_NIGHTLY_INTERVAL_SECONDS)
