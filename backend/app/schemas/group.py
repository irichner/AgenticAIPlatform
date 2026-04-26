from __future__ import annotations
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime


class AgentGroupCreate(BaseModel):
    name: str
    description: str | None = None
    business_unit_id: UUID


class AgentGroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    business_unit_id: UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
