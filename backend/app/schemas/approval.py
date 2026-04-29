from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime


class ApprovalRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    org_id: UUID
    run_id: UUID
    agent_id: UUID | None
    thread_id: str
    tool_name: str | None
    tool_args: dict | None
    status: str
    decision: str | None
    decided_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ApprovalDecision(BaseModel):
    decision: Literal["approve", "reject"]
