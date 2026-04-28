"""
RBACChecker — gate tool access by role, user ID, or org-tenant membership.

filter_tools: removes tools the caller cannot see.
assert_allowed: raises 403 if the caller cannot call the specific tool.
"""
from __future__ import annotations

import uuid
import logging
from typing import Any

from fastapi import HTTPException, status

from app.mcp_gateway.models import McpToolPermission

logger = logging.getLogger(__name__)


class RBACChecker:
    def __init__(
        self,
        user_id: uuid.UUID | None,
        user_roles: list[str],
        org_tenant_ids: list[uuid.UUID] | None = None,
    ) -> None:
        self._user_id = user_id
        self._user_roles = set(user_roles)
        self._org_tenant_ids = set(org_tenant_ids or [])

    def filter_tools(
        self,
        tools: list[dict[str, Any]],
        permissions: list[McpToolPermission],
    ) -> list[dict[str, Any]]:
        perm_map = {p.tool_name: p for p in permissions}
        allowed: list[dict[str, Any]] = []
        for tool in tools:
            perm = perm_map.get(tool["name"])
            if perm is None or self._check(perm):
                allowed.append(tool)
        return allowed

    def assert_allowed(
        self,
        tool_name: str,
        permissions: list[McpToolPermission],
    ) -> McpToolPermission | None:
        perm_map = {p.tool_name: p for p in permissions}
        perm = perm_map.get(tool_name)
        if perm is None:
            # No explicit permission row → default allow
            return None
        if not self._check(perm):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Tool '{tool_name}' is not permitted for your role",
            )
        return perm

    def _check(self, perm: McpToolPermission) -> bool:
        # No restrictions on this perm → allow all
        no_role_restriction = not perm.allowed_roles
        no_user_restriction = not perm.allowed_user_ids
        no_tenant_restriction = not perm.allowed_org_tenant_ids
        if no_role_restriction and no_user_restriction and no_tenant_restriction:
            return True

        if perm.allowed_roles and self._user_roles & set(perm.allowed_roles):
            return True
        if perm.allowed_user_ids and self._user_id in perm.allowed_user_ids:
            return True
        if perm.allowed_org_tenant_ids and self._org_tenant_ids & set(perm.allowed_org_tenant_ids):
            return True
        return False
