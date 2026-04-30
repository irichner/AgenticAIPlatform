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

MCP_EMAIL_URL = os.getenv("MCP_EMAIL_URL", "http://mcp-email:8025")
MCP_SLACK_URL = os.getenv("MCP_SLACK_URL", "http://mcp-slack:8026")
BRIEFING_CHANNEL = os.getenv("BRIEFING_SLACK_CHANNEL", "#manager-briefings")

async def _load_anthropic_config(db, org_id: str) -> tuple[str, str]:
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
        return f"[Briefing generation failed: {e}]"


async def _gather_team_context(db: Any, org_id: str) -> dict:
    """Gather pipeline + attainment data for the org."""
    from sqlalchemy import select, func
    from app.models.opportunity import Opportunity, OpportunityStage
    from app.models.user import User
    from app.models.commission import QuotaAllocation, AttainmentSnapshot
    from uuid import UUID

    now = datetime.now(timezone.utc)
    current_month = now.month
    current_year = now.year
    thirty_days_ago = now - timedelta(days=30)

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


async def generate_briefing(org_id: str, db: Any) -> str:
    """Generate a manager intelligence briefing for the org."""
    api_key, model = await _load_anthropic_config(db, org_id)
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

    return await _claude(prompt, max_tokens=1000, api_key=api_key, model=model)


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


async def run_briefing_for_org(org_id: str, db: Any) -> str:
    briefing = await generate_briefing(org_id, db)
    header = f"*📊 Manager Briefing — {date.today().strftime('%B %d, %Y')}*\n\n"
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
                from sqlalchemy import select as sa_select, text
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
