from __future__ import annotations
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models.catalog import CatalogItem, CatalogSource, CatalogSourceSettings
from app.schemas.catalog import (
    CatalogItemOut,
    CatalogSourceOut,
    CatalogSourcePatch,
    SourceItemCount,
)
from app.services.catalog_sync import sync_source

# Admin endpoints — manage sources and trigger syncs
admin_router = APIRouter(prefix="/catalog/admin/sources", tags=["catalog-admin"])

# Read path — browse catalog items
catalog_router = APIRouter(prefix="/catalog", tags=["catalog"])


def _build_source_out(
    source: CatalogSource,
    settings: CatalogSourceSettings | None,
) -> CatalogSourceOut:
    return CatalogSourceOut(
        id=source.id,
        kind=source.kind,
        display_name=source.display_name,
        base_url=source.base_url,
        requires_auth=source.requires_auth,
        default_enabled=source.default_enabled,
        sync_interval_seconds=source.sync_interval_seconds,
        enabled=settings.enabled if settings is not None else source.default_enabled,
        last_sync_at=settings.last_sync_at if settings is not None else None,
        last_sync_status=settings.last_sync_status if settings is not None else None,
    )


async def _get_global_settings(
    db: AsyncSession, source_id: str
) -> CatalogSourceSettings | None:
    result = await db.execute(
        select(CatalogSourceSettings).where(
            CatalogSourceSettings.source_id == source_id,
            CatalogSourceSettings.tenant_id.is_(None),
        )
    )
    return result.scalar_one_or_none()


# ── Admin ─────────────────────────────────────────────────────────────────────

@admin_router.get("", response_model=list[CatalogSourceOut])
async def list_sources(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CatalogSource).order_by(CatalogSource.display_name)
    )
    sources = result.scalars().all()
    out = []
    for source in sources:
        settings = await _get_global_settings(db, source.id)
        out.append(_build_source_out(source, settings))
    return out


@admin_router.patch("/{source_id}", response_model=CatalogSourceOut)
async def patch_source(
    source_id: str,
    body: CatalogSourcePatch,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CatalogSource).where(CatalogSource.id == source_id)
    )
    source = result.scalar_one_or_none()
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found")

    settings = await _get_global_settings(db, source_id)
    if settings is None:
        settings = CatalogSourceSettings(
            source_id=source_id,
            tenant_id=None,
            enabled=source.default_enabled,
        )
        db.add(settings)

    if body.enabled is not None:
        settings.enabled = body.enabled

    await db.commit()
    await db.refresh(settings)
    return _build_source_out(source, settings)


@admin_router.post("/{source_id}/sync", response_model=CatalogSourceOut)
async def force_sync(source_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CatalogSource).where(CatalogSource.id == source_id)
    )
    source = result.scalar_one_or_none()
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found")

    await sync_source(db, source_id, tenant_id=None)

    settings = await _get_global_settings(db, source_id)
    return _build_source_out(source, settings)


@admin_router.get("/{source_id}/items/count", response_model=SourceItemCount)
async def source_item_count(source_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(func.count()).where(CatalogItem.source_id == source_id)
    )
    count: int = result.scalar() or 0
    return SourceItemCount(source_id=source_id, count=count)


# ── Read path ─────────────────────────────────────────────────────────────────

@catalog_router.get("/items", response_model=list[CatalogItemOut])
async def list_catalog_items(
    kind: Literal["model", "mcp_server"] | None = None,
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
):
    enabled = await db.execute(
        select(CatalogSourceSettings.source_id).where(
            CatalogSourceSettings.tenant_id.is_(None),
            CatalogSourceSettings.enabled.is_(True),
        )
    )
    source_ids = [r[0] for r in enabled.all()]

    stmt = select(CatalogItem).where(CatalogItem.source_id.in_(source_ids))
    if kind:
        stmt = stmt.where(CatalogItem.kind == kind)
    stmt = stmt.limit(limit)

    result = await db.execute(stmt)
    return result.scalars().all()
