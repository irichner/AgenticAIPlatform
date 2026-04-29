from __future__ import annotations
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime


class ContactBase(BaseModel):
    first_name: str
    last_name: str
    email: str | None = None
    phone: str | None = None
    title: str | None = None
    seniority: str | None = None
    linkedin_url: str | None = None
    account_id: UUID | None = None
    owner_id: UUID | None = None


class ContactCreate(ContactBase):
    pass


class ContactUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    title: str | None = None
    seniority: str | None = None
    linkedin_url: str | None = None
    account_id: UUID | None = None
    owner_id: UUID | None = None
    last_contacted_at: datetime | None = None


class ContactOut(ContactBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    org_id: UUID
    last_contacted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
