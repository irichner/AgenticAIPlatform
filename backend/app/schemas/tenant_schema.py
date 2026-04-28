from __future__ import annotations
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class TenantCreate(BaseModel):
    name: str
    slug: str


class TenantUpdate(BaseModel):
    name: str | None = None


class TenantOut(BaseModel):
    id: UUID
    org_id: UUID
    name: str
    slug: str
    created_at: datetime

    model_config = {"from_attributes": True}
