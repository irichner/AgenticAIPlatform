from __future__ import annotations
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class RoleCreate(BaseModel):
    scope: str
    key: str
    name: str
    description: str | None = None
    permission_ids: list[str] = []


class RoleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    permission_ids: list[str] | None = None


class PermissionOut(BaseModel):
    id: str
    scope: str
    resource: str
    description: str
    system_only: bool

    model_config = {"from_attributes": True}


class RoleOut(BaseModel):
    id: UUID
    org_id: UUID | None
    scope: str
    key: str
    name: str
    description: str | None
    is_system: bool
    is_default: bool
    created_at: datetime
    permissions: list[str]

    model_config = {"from_attributes": True}
