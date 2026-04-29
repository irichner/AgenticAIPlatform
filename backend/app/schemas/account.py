from __future__ import annotations
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from decimal import Decimal


class AccountBase(BaseModel):
    name: str
    domain: str | None = None
    industry: str | None = None
    employee_count: int | None = None
    annual_revenue: Decimal | None = None
    website: str | None = None
    description: str | None = None
    owner_id: UUID | None = None


class AccountCreate(AccountBase):
    pass


class AccountUpdate(BaseModel):
    name: str | None = None
    domain: str | None = None
    industry: str | None = None
    employee_count: int | None = None
    annual_revenue: Decimal | None = None
    website: str | None = None
    description: str | None = None
    owner_id: UUID | None = None
    health_score: int | None = None


class AccountOut(AccountBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    org_id: UUID
    health_score: int | None = None
    created_at: datetime
    updated_at: datetime
