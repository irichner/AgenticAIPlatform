from __future__ import annotations
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from typing import Any


class ActivityBase(BaseModel):
    type: str
    subject: str | None = None
    body: str | None = None
    direction: str | None = None
    occurred_at: datetime
    duration_seconds: int | None = None
    opportunity_id: UUID | None = None
    account_id: UUID | None = None
    contact_id: UUID | None = None
    owner_id: UUID | None = None


class ActivityCreate(ActivityBase):
    source: str = "manual"
    external_id: str | None = None


class ActivityUpdate(BaseModel):
    subject: str | None = None
    body: str | None = None
    direction: str | None = None
    occurred_at: datetime | None = None
    duration_seconds: int | None = None
    ai_summary: str | None = None
    action_items: list[Any] | None = None
    opportunity_id: UUID | None = None
    account_id: UUID | None = None
    contact_id: UUID | None = None


class ActivityOut(ActivityBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    org_id: UUID
    source: str
    external_id: str | None = None
    ai_summary: str | None = None
    action_items: list[Any] | None = None
    created_at: datetime
    updated_at: datetime

    # AI enrichment fields
    sentiment: str | None = None
    urgency: str | None = None
    buying_signals: list[Any] | None = None
    objections: list[Any] | None = None
    next_steps: str | None = None
    enriched_at: datetime | None = None
