from __future__ import annotations
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class OrgCreate(BaseModel):
    name: str
    slug: str
    logo_url: str | None = None
    first_tenant_name: str = "Default"


class OrgUpdate(BaseModel):
    name: str | None = None
    logo_url: str | None = None
    sso_enforced: bool | None = None
    agent_runs_per_minute: int | None = None
    agent_runs_per_hour: int | None = None


class OrgOut(BaseModel):
    id: UUID
    name: str
    slug: str
    logo_url: str | None = None
    sso_enforced: bool
    agent_runs_per_minute: int | None = None
    agent_runs_per_hour: int | None = None
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
