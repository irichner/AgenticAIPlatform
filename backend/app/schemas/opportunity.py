from __future__ import annotations
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import date, datetime
from decimal import Decimal


class OpportunityStageBase(BaseModel):
    name: str
    order: int = 0
    probability: int = 0
    is_won: bool = False
    is_lost: bool = False


class OpportunityStageCreate(OpportunityStageBase):
    pass


class OpportunityStageUpdate(BaseModel):
    name: str | None = None
    order: int | None = None
    probability: int | None = None
    is_won: bool | None = None
    is_lost: bool | None = None


class OpportunityStageOut(OpportunityStageBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    org_id: UUID
    created_at: datetime
    updated_at: datetime


class OpportunityBase(BaseModel):
    name: str
    account_id: UUID | None = None
    stage_id: UUID | None = None
    owner_id: UUID | None = None
    arr: Decimal | None = None
    close_date: date | None = None
    confidence: int | None = None
    deal_type: str | None = None
    description: str | None = None


class OpportunityCreate(OpportunityBase):
    pass


class OpportunityUpdate(BaseModel):
    name: str | None = None
    account_id: UUID | None = None
    stage_id: UUID | None = None
    owner_id: UUID | None = None
    arr: Decimal | None = None
    close_date: date | None = None
    confidence: int | None = None
    deal_type: str | None = None
    description: str | None = None
    health_score: int | None = None
    lost_reason: str | None = None


class OpportunityOut(OpportunityBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    org_id: UUID
    health_score: int | None = None
    won_at: datetime | None = None
    lost_at: datetime | None = None
    lost_reason: str | None = None
    created_at: datetime
    updated_at: datetime
