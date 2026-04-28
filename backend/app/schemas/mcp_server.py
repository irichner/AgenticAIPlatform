from __future__ import annotations
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime


class McpToolOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    server_id: UUID
    name: str
    description: str | None
    input_schema: dict
    http_method: str
    path: str
    enabled: bool
    created_at: datetime
    updated_at: datetime


class McpToolUpdate(BaseModel):
    description: str | None = None
    enabled: bool | None = None


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
    auth_config: dict | None = None


class McpServerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    url: str
    transport: str
    description: str | None
    enabled: bool
    runtime_mode: str
    slug: str | None
    base_url: str | None
    auth_config: dict | None
    created_at: datetime
    updated_at: datetime
    tools: list[McpToolOut] = []


class ImportOpenApiRequest(BaseModel):
    name: str
    base_url: str
    spec_url: str | None = None
    spec_json: dict | None = None
    description: str | None = None
    auth_config: dict | None = None
    slug: str | None = None
