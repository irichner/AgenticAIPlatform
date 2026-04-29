"""Leaderboard API endpoints.

GET  /api/leaderboard         — top-N reps by closed ARR for a period
GET  /api/leaderboard/stream  — SSE stream of real-time score updates
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from typing import AsyncIterator

from app.auth.dependencies import resolve_org
from app.dependencies import get_db
from app.models.user import User
from app.services.leaderboard import get_top_scores, stream_leaderboard_updates

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])


@router.get("")
async def list_leaderboard(
    year: int = Query(...),
    month: int | None = Query(None),
    top_n: int = Query(25, le=500),
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    scores = await get_top_scores(str(org_id), year, month, top_n)
    if not scores:
        return []

    user_ids = [uid for uid, _ in scores]
    result = await db.execute(
        select(User).where(User.id.in_([UUID(uid) for uid in user_ids]))
    )
    users_by_id = {str(u.id): u for u in result.scalars().all()}

    return [
        {
            "rank": rank,
            "user_id": uid,
            "name": _display_name(users_by_id.get(uid)),
            "email": users_by_id[uid].email if uid in users_by_id else "",
            "attainment_arr": score,
        }
        for rank, (uid, score) in enumerate(scores, start=1)
    ]


def _display_name(user: User | None) -> str:
    if user is None:
        return "Unknown Rep"
    return user.full_name or user.email or "Unknown"


@router.get("/stream")
async def stream_leaderboard(
    org_id: UUID = Depends(resolve_org),
):
    """SSE endpoint — client connects once, receives JSON payloads on each score change."""
    async def event_gen() -> AsyncIterator[bytes]:
        async for chunk in stream_leaderboard_updates(str(org_id)):
            yield chunk.encode()

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
