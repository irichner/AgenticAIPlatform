from __future__ import annotations
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from typing import Any


class RunCreate(BaseModel):
    agent_id: UUID
    input: dict[str, Any] | None = None


class RunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    agent_id: UUID
    agent_version_id: UUID | None
    business_unit_id: UUID | None
    status: str
    input: dict[str, Any] | None
    output: dict[str, Any] | None
    error: str | None
    triggered_by: UUID | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
