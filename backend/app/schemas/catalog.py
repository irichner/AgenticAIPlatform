from __future__ import annotations
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class CatalogSourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: str
    display_name: str
    base_url: str
    requires_auth: bool
    default_enabled: bool
    sync_interval_seconds: int
    # Effective global settings resolved at query time
    enabled: bool
    last_sync_at: datetime | None
    last_sync_status: str | None


class CatalogSourcePatch(BaseModel):
    enabled: bool | None = None


class CatalogItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    source_id: str
    external_id: str
    kind: str
    payload: dict
    fetched_at: datetime


class SourceItemCount(BaseModel):
    source_id: str
    count: int
