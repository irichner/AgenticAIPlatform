from __future__ import annotations
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, EmailStr


class MagicLinkRequest(BaseModel):
    email: EmailStr


class MagicLinkResponse(BaseModel):
    detail: str = "Magic link sent — check your email"


class MeOrg(BaseModel):
    id: UUID
    name: str
    slug: str
    role_key: str

    model_config = {"from_attributes": True}


class MeOut(BaseModel):
    id: UUID
    email: str
    full_name: str | None
    avatar_url: str | None
    email_verified: bool
    orgs: list[MeOrg]
    # keyed by "org:<uuid>" or "tenant:<uuid>" → list of permission IDs
    permissions: dict[str, list[str]] = {}

    model_config = {"from_attributes": True}


class SessionOut(BaseModel):
    id: str
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    user_agent: str | None
    ip: str | None
    is_current: bool = False

    model_config = {"from_attributes": True}
