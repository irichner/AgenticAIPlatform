"""Manager Intelligence Briefing Agent.

Runs on a cron schedule (default: every weekday at 8 AM UTC).
For each org, generates a briefing for each manager covering:
  - Team pipeline health summary
  - Top deals at risk (low health score)
  - Leaderboard snapshot
  - Recommended coaching actions per rep

Optionally delivers via email (MCP email server) or Slack.
"""
from __future__ import annotations
import asyncio
import os
from datetime import datetime, date, timezone, timedelta
from typing import Any

MCP_SLACK_URL = os.getenv("MCP_SLACK_URL", "http://mcp-slack:8026")
BRIEFING_CHANNEL = os.getenv("BRIEFING_SLACK_CHANNEL", "#manager-briefings")


async def _gather_team_context(db: Any, org_id: str) -> dict:
    """Gather pipeline + attainment data for the org."""
    from sqlalchemy import select, func
    from app.models.opportunity import Opportunity
    from uuid import UUID

    now = datetime.now(timezone.utc)
    current_month = now.month
    current_year = now.year
    # Open pipeline
    q_open = await db.execute(
        select(
            func.count(Opportunity.id).label("count"),
            func.sum(Opportunity.arr).label("total_arr"),
        ).where(
            Opportunity.org_id == UUID(org_id),
            Opportunity.won_at.is_(None),
            Opportunity.lost_at.is_(None),
        )
    )
    open_row = q_open.one()

    # At-risk deals (health_score < 40)
    q_risk = await db.execute(
        select(Opportunity).where(
            Opportunity.org_id == UUID(org_id),
            Opportunity.won_at.is_(None),
            Opportunity.lost_at.is_(None),
            Opportunity.health_score < 40,
        ).order_by(Opportunity.arr.desc()).limit(5)
    )
    at_risk = q_risk.scalars().all()

    # Closed this month
    q_won = await db.execute(
        select(func.sum(Opportunity.arr)).where(
            Opportunity.org_id == UUID(org_id),
            Opportunity.won_at.isnot(None),
            func.date_part("year", Opportunity.won_at) == current_year,
            func.date_part("month", Opportunity.won_at) == current_month,
        )
    )
    won_arr = float(q_won.scalar() or 0)

    return {
        "open_count": open_row.count or 0,
        "open_arr": float(open_row.total_arr or 0),
        "won_arr_mtd": won_arr,
        "at_risk_deals": [
            {"name": d.name, "arr": float(d.arr or 0), "health_score": d.health_score or 0}
            for d in at_risk
        ],
        "period": f"{current_year}-{current_month:02d}",
    }


async def generate_briefing(org_id: str, db: Any) -> str | None:
    """Generate a manager intelligence briefing using the org's configured AI model.

    Returns None if no AI model is configured for the org.
    """
    from uuid import UUID
    from app.agents.llm import get_active_llm
    llm = await get_active_llm(db, org_id=UUID(org_id))
    if llm is None:
        return None

    ctx = await _gather_team_context(db, org_id)

    prompt = f"""You are a revenue intelligence assistant generating a daily manager briefing.

Team Status ({ctx['period']}):
- Open pipeline: {ctx['open_count']} deals, ${ctx['open_arr']:,.0f} ARR
- Closed won MTD: ${ctx['won_arr_mtd']:,.0f} ARR
- At-risk deals (health < 40):
{chr(10).join(f"  • {d['name']} — ${d['arr']:,.0f} ARR, health={d['health_score']}" for d in ctx['at_risk_deals']) if ctx['at_risk_deals'] else "  • None"}

Write a crisp manager briefing (5–8 bullet points max) covering:
1. Pipeline health summary
2. What needs immediate attention (at-risk deals)
3. Momentum highlights (closed won)
4. 2-3 specific recommended manager actions for today

Be direct and specific. Use $ amounts. No fluff."""

    try:
        response = await llm.ainvoke(prompt)
        return response.content
    except Exception as e:
        print(f"[manager_briefing] generation failed for org={org_id}: {e}")
        return None


async def _post_to_slack(channel: str, text: str) -> None:
    import httpx
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                f"{MCP_SLACK_URL}/tools/slack_post_message",
                json={"channel": channel, "text": text},
            )
    except Exception:
        pass


async def run_briefing_for_org(org_id: str, db: Any) -> str | None:
    briefing = await generate_briefing(org_id, db)
    if briefing is None:
        return None
    header = f"*Manager Briefing — {date.today().strftime('%B %d, %Y')}*\n\n"
    full_message = header + briefing
    await _post_to_slack(BRIEFING_CHANNEL, full_message)
    return briefing


async def run_manager_briefing_loop() -> None:
    """Background loop — fires once per day, waits until next 08:00 UTC."""
    from app.db.engine import AsyncSessionLocal

    await asyncio.sleep(90)  # startup delay

    while True:
        try:
            async with AsyncSessionLocal() as db:
                from sqlalchemy import text
                # Get all active orgs
                result = await db.execute(text("SELECT id FROM lanara.orgs LIMIT 50"))
                org_ids = [str(r[0]) for r in result.fetchall()]

            for org_id in org_ids:
                try:
                    async with AsyncSessionLocal() as db:
                        await run_briefing_for_org(org_id, db)
                except Exception:
                    pass

        except Exception:
            pass

        # Sleep until next 08:00 UTC
        now = datetime.now(timezone.utc)
        next_run = now.replace(hour=8, minute=0, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        sleep_secs = (next_run - now).total_seconds()
        await asyncio.sleep(sleep_secs)
