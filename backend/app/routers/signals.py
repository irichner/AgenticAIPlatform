"""Signal ingestion and management endpoints.

POST /api/signals/ingest     — internal endpoint for MCP servers to push signal events
GET  /api/signals            — list signal events (for debugging/monitoring)
GET  /api/signals/stats      — counts by status
"""
from __future__ import annotations
import os
import secrets
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID
from datetime import datetime, timezone

from app.dependencies import get_db
from app.auth.dependencies import resolve_org
from app.models.signals import Signal
from app.models.integration_config import IntegrationConfig
from pydantic import BaseModel
from typing import Any

router = APIRouter(prefix="/signals", tags=["signals"])

# Shared secret required by all internal callers of /ingest.
# Set MCP_INGEST_SECRET in env (same value must be passed as Bearer token).
_INGEST_SECRET = os.getenv("MCP_INGEST_SECRET", "")


def _verify_ingest_auth(request: Request) -> None:
    """Raise 401 if the caller doesn't present the correct ingest secret."""
    if not _INGEST_SECRET:
        # Dev mode: secret not configured → allow (same behaviour as before)
        return
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing ingest authorization")
    token = auth.removeprefix("Bearer ").strip()
    if not secrets.compare_digest(token, _INGEST_SECRET):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid ingest secret")


class SignalIngestPayload(BaseModel):
    source: str
    event_type: str
    payload: dict[str, Any] = {}


class IntegrationConfigOut(BaseModel):
    id: UUID
    org_id: UUID
    user_id: UUID
    provider: str
    enabled: bool
    sync_cursor: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


@router.post("/ingest", status_code=status.HTTP_202_ACCEPTED)
async def ingest_signal(
    payload: SignalIngestPayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Internal endpoint for MCP servers to push raw signal events.

    Requires:
      Authorization: Bearer <MCP_INGEST_SECRET>   (server-to-server)
      X-Org-Id: <uuid>                             (org context)
    """
    _verify_ingest_auth(request)
    org_id_str = request.headers.get("x-org-id")
    if not org_id_str:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "X-Org-Id header required")
    try:
        org_id = UUID(org_id_str)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid X-Org-Id")

    event = Signal(
        org_id=org_id,
        source=payload.source,
        event_type=payload.event_type,
        payload=payload.payload,
        status="pending",
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return {"accepted": True, "signal_id": str(event.id)}


@router.get("", response_model=list[dict])
async def list_signals(
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
):
    result = await db.execute(
        select(Signal)
        .where(Signal.org_id == org_id)
        .order_by(Signal.created_at.desc())
        .limit(limit)
    )
    events = result.scalars().all()
    return [
        {
            "id": str(e.id),
            "source": e.source,
            "event_type": e.event_type,
            "status": e.status,
            "error": e.error,
            "processed_at": e.processed_at.isoformat() if e.processed_at else None,
            "created_at": e.created_at.isoformat(),
        }
        for e in events
    ]


@router.get("/stats")
async def signal_stats(
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Signal.status, func.count(Signal.id).label("count"))
        .where(Signal.org_id == org_id)
        .group_by(Signal.status)
    )
    rows = result.all()
    return {row.status: row.count for row in rows}


# ── Integration Config CRUD ────────────────────────────────────────────────────

integrations_router = APIRouter(prefix="/integration-configs", tags=["integrations"])


@integrations_router.get("", response_model=list[IntegrationConfigOut])
async def list_integration_configs(
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(IntegrationConfig).where(IntegrationConfig.org_id == org_id)
    )
    return result.scalars().all()


@integrations_router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_integration_config(
    config_id: UUID,
    org_id: UUID = Depends(resolve_org),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(IntegrationConfig).where(
            IntegrationConfig.id == config_id,
            IntegrationConfig.org_id == org_id,
        )
    )
    cfg = result.scalar_one_or_none()
    if cfg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Integration config not found")
    await db.delete(cfg)
    await db.commit()
