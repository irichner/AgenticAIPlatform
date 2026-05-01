"""Rep Coaching Agent.

Analyzes individual rep performance and generates personalized coaching insights:
  - Deal velocity patterns
  - Activity cadence vs. peers
  - Quota attainment trajectory
  - Recommended focus areas
  - Specific deal-level coaching actions

Results are stored as CoachingInsight records (in Redis, keyed per rep/period)
and exposed via GET /api/coaching/{user_id}
"""
from __future__ import annotations
import asyncio
import json
import os
from datetime import datetime, timezone, timedelta
from typing import Any
from uuid import UUID

async def _load_anthropic_config(db, org_id: str) -> tuple[str, str]:
    """Return (api_key, model) from platform settings with env fallbacks."""
    from uuid import UUID as _UUID
    from app.core.settings_service import get_setting
    oid = _UUID(org_id)
    api_key = await get_setting(db, oid, "anthropic_api_key") or os.getenv("ANTHROPIC_API_KEY", "")
    model = await get_setting(db, oid, "anthropic_model") or os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
    return api_key, model


async def _claude(prompt: str, max_tokens: int, api_key: str, model: str) -> str:
    try:
        import httpx
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": model,
                    "max_tokens": max_tokens,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
        data = resp.json()
        return data["content"][0]["text"]
    except Exception as e:
        return f"[Coaching generation failed: {e}]"


async def _get_rep_context(db: Any, org_id: str, user_id: str) -> dict:
    from sqlalchemy import select, func
    from app.models.opportunity import Opportunity
    from app.models.activity import Activity
    from app.models.commission import QuotaAllocation
    from app.models.deal_intelligence import DealSignal

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    thirty_days_ago = now - timedelta(days=30)

    uid = UUID(user_id)
    oid = UUID(org_id)

    # Open deals
    q_open = await db.execute(
        select(Opportunity).where(
            Opportunity.org_id == oid,
            Opportunity.owner_id == uid,
            Opportunity.won_at.is_(None),
            Opportunity.lost_at.is_(None),
        ).order_by(Opportunity.arr.desc())
    )
    open_deals = q_open.scalars().all()

    # Closed won this month
    q_won = await db.execute(
        select(func.sum(Opportunity.arr), func.count(Opportunity.id)).where(
            Opportunity.org_id == oid,
            Opportunity.owner_id == uid,
            Opportunity.won_at >= month_start,
        )
    )
    won_row = q_won.one()

    # Activity count last 30 days
    q_acts = await db.execute(
        select(func.count(Activity.id)).where(
            Activity.org_id == oid,
            Activity.owner_id == uid,
            Activity.occurred_at >= thirty_days_ago,
        )
    )
    activity_count = q_acts.scalar() or 0

    # Quota
    q_quota = await db.execute(
        select(QuotaAllocation).where(
            QuotaAllocation.org_id == oid,
            QuotaAllocation.user_id == uid,
            QuotaAllocation.period_year == now.year,
            QuotaAllocation.period_month == now.month,
        )
    )
    quota_alloc = q_quota.scalar_one_or_none()
    quota = float(quota_alloc.quota_amount) if quota_alloc else 0.0

    won_arr = float(won_row[0] or 0)
    attainment_pct = (won_arr / quota * 100) if quota > 0 else 0

    # Deal signals for open deals
    open_deal_ids = [d.id for d in open_deals[:10]]
    signals = []
    if open_deal_ids:
        q_sig = await db.execute(
            select(DealSignal).where(
                DealSignal.org_id == oid,
                DealSignal.opportunity_id.in_(open_deal_ids),
                DealSignal.severity.in_(["high", "critical"]),
            ).limit(10)
        )
        signals = q_sig.scalars().all()

    return {
        "user_id": user_id,
        "period": f"{now.year}-{now.month:02d}",
        "quota": quota,
        "won_arr_mtd": won_arr,
        "attainment_pct": round(attainment_pct, 1),
        "open_deals": [
            {
                "name": d.name,
                "arr": float(d.arr or 0),
                "health_score": d.health_score or 0,
                "close_date": d.close_date.isoformat() if d.close_date else None,
            }
            for d in open_deals[:8]
        ],
        "activity_count_30d": activity_count,
        "risk_signals": [
            {"deal_id": str(s.opportunity_id), "type": s.signal_type, "severity": s.severity, "title": s.title}
            for s in signals
        ],
    }


async def generate_coaching_insights(org_id: str, user_id: str, db: Any) -> dict:
    """Generate AI coaching insights for a specific rep."""
    api_key, model = await _load_anthropic_config(db, org_id)
    ctx = await _get_rep_context(db, org_id, user_id)

    prompt = f"""You are a world-class sales coach. Analyze this rep's data and provide specific, actionable coaching.

Rep Performance ({ctx['period']}):
- Quota: ${ctx['quota']:,.0f} | Attainment: {ctx['attainment_pct']}%
- Closed Won MTD: ${ctx['won_arr_mtd']:,.0f}
- Open Pipeline: {len(ctx['open_deals'])} deals
- Activities (last 30 days): {ctx['activity_count_30d']}

Open Deals:
{chr(10).join(f"  • {d['name']} — ${d['arr']:,.0f} ARR, health={d['health_score']}, close={d['close_date'] or 'TBD'}" for d in ctx['open_deals']) if ctx['open_deals'] else "  • None"}

Risk Signals:
{chr(10).join(f"  • [{s['severity'].upper()}] {s['title']}" for s in ctx['risk_signals']) if ctx['risk_signals'] else "  • None"}

Generate a JSON coaching response with this exact structure:
{{
  "summary": "2-sentence performance summary",
  "strengths": ["strength 1", "strength 2"],
  "focus_areas": ["area 1", "area 2", "area 3"],
  "deal_coaching": [{{"deal": "deal name", "action": "specific next step"}}],
  "weekly_goal": "one specific measurable goal for this week",
  "motivation_score": <1-10 estimate of rep morale/momentum>
}}

Return ONLY valid JSON, no markdown."""

    raw = await _claude(prompt, max_tokens=1500, api_key=api_key, model=model)

    try:
        # Strip any markdown fences
        clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        insights = json.loads(clean)
    except Exception:
        insights = {
            "summary": raw[:200],
            "strengths": [],
            "focus_areas": ["Review open pipeline", "Increase activity cadence"],
            "deal_coaching": [],
            "weekly_goal": "Close one deal from top pipeline",
            "motivation_score": 5,
        }

    return {**insights, "context": ctx, "generated_at": datetime.now(timezone.utc).isoformat()}


async def cache_coaching_insights(org_id: str, user_id: str, insights: dict) -> None:
    """Cache coaching insights in Redis for 24 hours."""
    from app.core.redis_client import get_redis
    await get_redis().setex(f"coaching:{org_id}:{user_id}", 86_400, json.dumps(insights))


async def get_cached_coaching(org_id: str, user_id: str) -> dict | None:
    """Retrieve cached coaching insights from Redis."""
    from app.core.redis_client import get_redis
    raw = await get_redis().get(f"coaching:{org_id}:{user_id}")
    if raw:
        try:
            return json.loads(raw)
        except Exception:
            return None
    return None


async def run_coaching_loop() -> None:
    """Background loop — refresh coaching insights every 6 hours for active reps."""
    from app.db.engine import AsyncSessionLocal
    from sqlalchemy import text

    await asyncio.sleep(120)  # startup delay

    while True:
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(text(
                    "SELECT DISTINCT om.org_id, om.user_id FROM lanara.org_memberships om "
                    "JOIN lanara.sessions s ON s.user_id = om.user_id "
                    "WHERE s.expires_at > NOW() LIMIT 100"
                ))
                active_pairs = [(str(r[0]), str(r[1])) for r in result.fetchall()]

            for org_id, user_id in active_pairs:
                try:
                    async with AsyncSessionLocal() as db:
                        insights = await generate_coaching_insights(org_id, user_id, db)
                        await cache_coaching_insights(org_id, user_id, insights)
                except Exception:
                    pass

        except Exception:
            pass

        await asyncio.sleep(6 * 3600)  # every 6 hours
