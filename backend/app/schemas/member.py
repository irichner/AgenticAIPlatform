from __future__ import annotations
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, EmailStr


class InviteRequest(BaseModel):
    email: EmailStr
    role_id: UUID


class MemberOut(BaseModel):
    user_id: UUID
    email: str
    full_name: str | None
    avatar_url: str | None
    role_id: UUID
    role_key: str
    role_name: str
    joined_at: datetime

    model_config = {"from_attributes": True}


class MemberRoleUpdate(BaseModel):
    role_id: UUID


class MemberLimitsUpdate(BaseModel):
    agent_runs_per_minute: int | None = None
    agent_runs_per_hour: int | None = None
