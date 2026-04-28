"""Shared fixtures for MCP gateway tests."""
from __future__ import annotations

import uuid
from types import SimpleNamespace
from typing import Any


def make_reg(
    org_id: uuid.UUID | None = None,
    auth_type: str = "api_key",
    auth_config: dict | None = None,
    sampling_policy: str = "deny",
    mcp_url: str = "https://mcp.example.com/mcp",
    credential_hash: str | None = "abc123",
    max_tool_calls_per_run: int = 30,
    max_wall_time_seconds: int = 180,
    enabled: bool = True,
) -> Any:
    return SimpleNamespace(
        id=uuid.uuid4(),
        org_id=org_id or uuid.uuid4(),
        name="test-reg",
        mcp_url=mcp_url,
        transport="streamable_http",
        auth_type=auth_type,
        auth_config=auth_config if auth_config is not None else {"header": "X-API-Key", "value": "sk-secret"},
        credential_hash=credential_hash,
        sampling_policy=sampling_policy,
        max_tool_calls_per_run=max_tool_calls_per_run,
        max_wall_time_seconds=max_wall_time_seconds,
        guardrail_prompt_additions=None,
        multi_tenant_claim=False,
        health_status="unknown",
        enabled=enabled,
        tool_permissions=[],
    )


def make_perm(
    registration_id: uuid.UUID | None = None,
    tool_name: str = "do_thing",
    allowed_roles: list[str] | None = None,
    requires_idempotency_key: bool = False,
) -> Any:
    return SimpleNamespace(
        id=uuid.uuid4(),
        registration_id=registration_id or uuid.uuid4(),
        tool_name=tool_name,
        allowed_roles=allowed_roles,
        allowed_user_ids=None,
        allowed_org_tenant_ids=None,
        requires_idempotency_key=requires_idempotency_key,
        max_calls_per_hour=None,
    )
