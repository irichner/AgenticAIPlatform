"""Rep Coaching API endpoints.

GET  /api/coaching/{user_id}         — get cached coaching insights (or generate fresh)
POST /api/coaching/{user_id}/refresh — force-refresh coaching insights
POST /api/briefing/generate          — generate manager briefing for current org
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.auth.dependencies import resolve_org, current_user
from app.dependencies import get_db
from app.models.user import User

router = APIRouter(tags=["coaching"])


@router.get("/coaching/{user_id}")
async def get_coaching(
    user_id: UUID,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    from app.agents.prebuilt.rep_coaching import get_cached_coaching, generate_coaching_insights, cache_coaching_insights

    cached = await get_cached_coaching(str(org_id), str(user_id))
    if cached:
        return {**cached, "source": "cache"}

    # Generate fresh if cache miss
    insights = await generate_coaching_insights(str(org_id), str(user_id), db)
    await cache_coaching_insights(str(org_id), str(user_id), insights)
    return {**insights, "source": "generated"}


@router.post("/coaching/{user_id}/refresh")
async def refresh_coaching(
    user_id: UUID,
    background_tasks: BackgroundTasks,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    from app.agents.prebuilt.rep_coaching import generate_coaching_insights, cache_coaching_insights

    async def _do_refresh():
        from app.db.engine import AsyncSessionLocal
        async with AsyncSessionLocal() as fresh_db:
            insights = await generate_coaching_insights(str(org_id), str(user_id), fresh_db)
            await cache_coaching_insights(str(org_id), str(user_id), insights)

    background_tasks.add_task(_do_refresh)
    return {"status": "refresh_queued", "user_id": str(user_id)}


@router.post("/briefing/generate")
async def generate_briefing(
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    from app.agents.prebuilt.manager_briefing import run_briefing_for_org

    briefing = await run_briefing_for_org(str(org_id), db)
    return {"org_id": str(org_id), "briefing": briefing}
