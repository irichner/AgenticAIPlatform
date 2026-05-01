from __future__ import annotations
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator


class _RedactedConfig(BaseModel):
    """Wrapper that never serializes raw secret values from auth_config."""

    raw: dict[str, Any]

    def redacted(self) -> dict[str, Any]:
        out = dict(self.raw)
        for k in ("value", "secret", "password", "token", "key"):
            if k in out:
                out[k] = "***"
        return out

    model_config = {"arbitrary_types_allowed": True}


# ── Registration schemas ──────────────────────────────────────────────────────

class RegistrationCreate(BaseModel):
    name: str
    mcp_url: str
    transport: str = "streamable_http"
    auth_type: str = "none"
    auth_config: dict[str, Any] | None = None
    sampling_policy: str = "deny"
    max_tool_calls_per_run: int = 30
    max_wall_time_seconds: int = 180
    guardrail_prompt_additions: str | None = None
    multi_tenant_claim: bool = False

    @field_validator("auth_type")
    @classmethod
    def _valid_auth_type(cls, v: str) -> str:
        allowed = {"none", "api_key", "oauth2", "mtls"}
        if v not in allowed:
            raise ValueError(f"auth_type must be one of {allowed}")
        return v

    @field_validator("sampling_policy")
    @classmethod
    def _valid_sampling(cls, v: str) -> str:
        if v not in {"deny", "allow"}:
            raise ValueError("sampling_policy must be 'deny' or 'allow'")
        return v


class RegistrationUpdate(BaseModel):
    name: str | None = None
    mcp_url: str | None = None
    transport: str | None = None
    auth_type: str | None = None
    auth_config: dict[str, Any] | None = None
    sampling_policy: str | None = None
    max_tool_calls_per_run: int | None = None
    max_wall_time_seconds: int | None = None
    guardrail_prompt_additions: str | None = None
    multi_tenant_claim: bool | None = None
    enabled: bool | None = None


class RegistrationOut(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    mcp_url: str
    transport: str
    auth_type: str
    auth_config: dict[str, Any] | None  # redacted before return
    credential_hash: str | None
    sampling_policy: str
    max_tool_calls_per_run: int
    max_wall_time_seconds: int
    guardrail_prompt_additions: str | None
    multi_tenant_claim: bool
    health_status: str
    enabled: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Tool permission schemas ───────────────────────────────────────────────────

class ToolPermissionCreate(BaseModel):
    tool_name: str
    allowed_roles: list[str] | None = None
    allowed_user_ids: list[uuid.UUID] | None = None
    allowed_org_tenant_ids: list[uuid.UUID] | None = None
    requires_idempotency_key: bool = False
    max_calls_per_hour: int | None = None


class ToolPermissionOut(BaseModel):
    id: uuid.UUID
    registration_id: uuid.UUID
    tool_name: str
    allowed_roles: list[str] | None
    allowed_user_ids: list[uuid.UUID] | None
    allowed_org_tenant_ids: list[uuid.UUID] | None
    requires_idempotency_key: bool
    max_calls_per_hour: int | None

    model_config = {"from_attributes": True}


# ── Call schemas ──────────────────────────────────────────────────────────────

class ToolCallRequest(BaseModel):
    registration_id: uuid.UUID
    tool_name: str
    tool_args: dict[str, Any] = {}
    run_id: str | None = None
    idempotency_key: str | None = None


class ToolCallResult(BaseModel):
    tool_name: str
    result: Any
    cached: bool = False
    budget_remaining: int | None = None


# ── Tool info ─────────────────────────────────────────────────────────────────

class ToolInfo(BaseModel):
    name: str
    description: str | None = None
    input_schema: dict[str, Any] = {}
    registration_id: uuid.UUID
