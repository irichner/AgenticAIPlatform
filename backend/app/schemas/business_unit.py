from __future__ import annotations
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime


class BusinessUnitBase(BaseModel):
    name: str
    description: str | None = None
    parent_id: UUID | None = None


class BusinessUnitCreate(BusinessUnitBase):
    pass


class BusinessUnitUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    parent_id: UUID | None = None


class BusinessUnitOut(BusinessUnitBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime
