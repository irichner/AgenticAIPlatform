from __future__ import annotations
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from typing import Any
from app.schemas.mcp_server import McpServerOut


class AgentBase(BaseModel):
    name: str
    description: str | None = None
    business_unit_id: UUID


class AgentCreate(AgentBase):
    prompt: str | None = None
    status: str | None = None
    group_id: UUID | None = None
    model_id: UUID | None = None
    mcp_server_ids: list[UUID] | None = None


class AgentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    group_id: UUID | None = None
    business_unit_id: UUID | None = None
    prompt: str | None = None
    model_id: UUID | None = None
    mcp_server_ids: list[UUID] | None = None


class AgentOut(AgentBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    group_id: UUID | None
    model_id: UUID | None
    status: str
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime
    mcp_servers: list[McpServerOut] = []


class AgentVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    agent_id: UUID
    version_number: int
    graph_definition: dict[str, Any] | None
    prompt: str | None
    tools: list[str] | None
    published_at: str | None
    created_by: UUID | None
    created_at: datetime
