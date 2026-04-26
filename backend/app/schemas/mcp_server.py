from __future__ import annotations
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime


class McpServerCreate(BaseModel):
    name: str
    url: str
    transport: str = "streamable_http"
    description: str | None = None
    enabled: bool = True


class McpServerUpdate(BaseModel):
    name: str | None = None
    url: str | None = None
    transport: str | None = None
    description: str | None = None
    enabled: bool | None = None


class McpServerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    url: str
    transport: str
    description: str | None
    enabled: bool
    created_at: datetime
    updated_at: datetime
