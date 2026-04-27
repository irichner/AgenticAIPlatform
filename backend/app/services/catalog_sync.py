"""Catalog sync engine.

sync_all_sources  — called by the background scheduler; syncs every enabled
                    source whose last_sync_at is stale.
sync_source       — syncs one source/tenant pair immediately (also called by
                    the force-sync API endpoint).
"""
from __future__ import annotations
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.catalog_adapters import ADAPTERS
from app.models.catalog import CatalogItem, CatalogSource, CatalogSourceSettings


async def sync_source(
    db: AsyncSession,
    source_id: str,
    tenant_id=None,
) -> None:
    adapter = ADAPTERS.get(source_id)
    if not adapter:
        return

    result = await db.execute(
        select(CatalogSourceSettings).where(
            CatalogSourceSettings.source_id == source_id,
            CatalogSourceSettings.tenant_id == tenant_id,
        )
    )
    settings = result.scalar_one_or_none()
    if not settings:
        return

    try:
        items = await adapter.fetch()
    except Exception as exc:
        settings.last_sync_at = datetime.now(timezone.utc)
        settings.last_sync_status = "error"
        settings.last_sync_error = str(exc)[:500]
        await db.commit()
        return

    now = datetime.now(timezone.utc)
    for item in items:
        stmt = (
            pg_insert(CatalogItem)
            .values(
                source_id=source_id,
                external_id=item.external_id,
                kind=item.kind,
                payload=item.payload,
                fetched_at=now,
            )
            .on_conflict_do_update(
                index_elements=["source_id", "external_id"],
                set_={"payload": item.payload, "fetched_at": now},
            )
        )
        await db.execute(stmt)

    settings.last_sync_at = now
    settings.last_sync_status = "ok"
    settings.last_sync_error = None
    await db.commit()


async def sync_all_sources(db: AsyncSession) -> None:
    """Sync all enabled global sources that are past their sync interval."""
    result = await db.execute(
        select(CatalogSourceSettings, CatalogSource)
        .join(CatalogSource, CatalogSource.id == CatalogSourceSettings.source_id)
        .where(
            CatalogSourceSettings.tenant_id.is_(None),
            CatalogSourceSettings.enabled.is_(True),
        )
    )
    now = datetime.now(timezone.utc)
    for settings, source in result.all():
        due = settings.last_sync_at is None or (
            (now - settings.last_sync_at).total_seconds() >= source.sync_interval_seconds
        )
        if due:
            await sync_source(db, source.id, tenant_id=None)
