"""Next Best Action Agent — recommends what a rep should do next for each deal.

Uses Claude to analyze deal state (health score, last activity, buying group coverage,
deal signals) and generate a prioritized action recommendation.
"""
from __future__ import annotations
import json
import os
import re
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.opportunity import Opportunity
from app.models.activity import Activity
from app.models.deal_intelligence import DealSignal, BuyingGroupMember


async def get_next_best_action(
    db: AsyncSession,
    org_id: UUID,
    opportunity_id: UUID,
) -> dict:
    """Generate a Next Best Action recommendation for a specific opportunity."""

    # Gather deal context
    opp_res = await db.execute(
        select(Opportunity).where(Opportunity.id == opportunity_id, Opportunity.org_id == org_id)
    )
    opp = opp_res.scalar_one_or_none()
    if not opp:
        return {"error": "Opportunity not found"}

    # Recent activities
    acts_res = await db.execute(
        select(Activity)
        .where(Activity.org_id == org_id, Activity.opportunity_id == opportunity_id)
        .order_by(Activity.occurred_at.desc())
        .limit(5)
    )
    activities = acts_res.scalars().all()

    # Deal signals
    sigs_res = await db.execute(
        select(DealSignal)
        .where(DealSignal.org_id == org_id, DealSignal.opportunity_id == opportunity_id)
        .order_by(DealSignal.created_at.desc())
        .limit(10)
    )
    signals = sigs_res.scalars().all()

    # Buying group
    bg_res = await db.execute(
        select(BuyingGroupMember)
        .where(BuyingGroupMember.org_id == org_id, BuyingGroupMember.opportunity_id == opportunity_id)
    )
    buying_group = bg_res.scalars().all()

    # Build context for LLM
    now = datetime.now(timezone.utc)
    days_to_close = None
    if opp.close_date:
        close_dt = datetime.combine(opp.close_date, datetime.min.time()).replace(tzinfo=timezone.utc)
        days_to_close = (close_dt - now).days

    last_activity_days = None
    if activities:
        la = activities[0].occurred_at
        if la.tzinfo is None:
            la = la.replace(tzinfo=timezone.utc)
        last_activity_days = (now - la).days

    context = f"""Opportunity: {opp.name}
ARR: ${opp.arr or 0:,.0f}
Deal type: {opp.deal_type or 'unknown'}
Health score: {opp.health_score or 'not scored'}/100
Days to close date: {days_to_close if days_to_close is not None else 'no close date set'}
Days since last activity: {last_activity_days if last_activity_days is not None else 'no activities'}
Total activities: {len(activities)}
Buying group size: {len(buying_group)} members
Buying group roles: {', '.join(set(m.role for m in buying_group)) or 'none mapped'}
Active deal signals: {', '.join(s.title for s in signals[:3]) or 'none'}
"""

    prompt = f"""{context}

Based on this deal state, provide a single, specific Next Best Action recommendation for the sales rep.
Be direct and actionable. Format as JSON:
{{
  "action": "one clear sentence describing what to do",
  "reason": "why this is the priority right now",
  "urgency": "high | medium | low",
  "channel": "email | call | meeting | internal",
  "suggested_message": "optional brief message/talking point if applicable"
}}"""

    try:
        from langchain_anthropic import ChatAnthropic
        from langchain_core.messages import HumanMessage

        llm = ChatAnthropic(
            model=os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001"),
            api_key=os.getenv("ANTHROPIC_API_KEY", ""),
            max_tokens=512,
        )
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        text = response.content.strip()
        json_match = re.search(r'\{.*\}', text, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
            result["opportunity_id"] = str(opportunity_id)
            result["opportunity_name"] = opp.name
            return result
    except Exception as e:
        pass

    # Fallback: rule-based NBA
    if last_activity_days and last_activity_days > 14:
        action = f"Send a follow-up email to re-engage — no contact in {last_activity_days} days"
        urgency = "high" if last_activity_days > 30 else "medium"
    elif days_to_close and days_to_close < 14:
        action = "Schedule a closing call to address final objections and confirm timeline"
        urgency = "high"
    elif not buying_group:
        action = "Map the buying group — identify who else is involved in the decision"
        urgency = "medium"
    else:
        action = "Send a value-add resource (case study, ROI calculator) to keep deal warm"
        urgency = "low"

    return {
        "action": action,
        "reason": "Rule-based recommendation (LLM unavailable)",
        "urgency": urgency,
        "channel": "email",
        "opportunity_id": str(opportunity_id),
        "opportunity_name": opp.name,
    }
