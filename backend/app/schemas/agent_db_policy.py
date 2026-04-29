from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

DbOperation = Literal["select", "insert", "update", "delete"]


class AgentDbPolicyCreate(BaseModel):
    agent_id: UUID
    name: str = Field(min_length=1, max_length=255)
    table_name: str = Field(min_length=1, max_length=255)
    allowed_operations: list[DbOperation] = Field(default=["select"], min_length=1)
    column_allowlist: list[str] | None = None
    column_blocklist: list[str] | None = None
    row_limit: int = Field(default=100, gt=0, le=5000)
    enabled: bool = True


class AgentDbPolicyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    allowed_operations: list[DbOperation] | None = Field(default=None, min_length=1)
    column_allowlist: list[str] | None = None
    column_blocklist: list[str] | None = None
    row_limit: int | None = Field(default=None, gt=0, le=5000)
    enabled: bool | None = None


class AgentDbPolicyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    org_id: UUID
    agent_id: UUID
    name: str
    table_name: str
    allowed_operations: list[str]
    column_allowlist: list[str] | None
    column_blocklist: list[str] | None
    row_limit: int
    enabled: bool
    created_at: datetime
    updated_at: datetime


class TableInfoOut(BaseModel):
    table_name: str
    columns: list[dict]
    has_org_id: bool
