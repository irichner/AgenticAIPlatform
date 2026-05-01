from __future__ import annotations
from dataclasses import dataclass
from typing import Literal
from uuid import UUID
from app.models.user import User


@dataclass
class AuthContext:
    user: User
    scope: Literal["org", "tenant"]
    scope_id: UUID
    permissions: set[str]
    last_permission: str | None = None
    ip: str | None = None
    user_agent: str | None = None

    @property
    def org_id(self) -> UUID | None:
        return self.scope_id if self.scope == "org" else None

    @property
    def tenant_id(self) -> UUID | None:
        return self.scope_id if self.scope == "tenant" else None
