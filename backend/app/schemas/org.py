from __future__ import annotations
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class OrgCreate(BaseModel):
    name: str
    slug: str


class OrgUpdate(BaseModel):
    name: str | None = None
    sso_enforced: bool | None = None


class OrgOut(BaseModel):
    id: UUID
    name: str
    slug: str
    sso_enforced: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class DomainCreate(BaseModel):
    domain: str


class DomainOut(BaseModel):
    domain: str
    org_id: UUID
    verified: bool
    verified_at: datetime | None
    verify_token: str | None

    model_config = {"from_attributes": True}
