"""
T7 — RBACChecker must allow/deny based on role, user_id, and org-tenant membership.
"""
import uuid

import pytest
from fastapi import HTTPException

from app.mcp_gateway.rbac import RBACChecker
from tests.mcp_gateway.conftest import make_perm


def test_rbac_allows_matching_role():
    perm = make_perm(tool_name="read_data", allowed_roles=["analyst"])
    checker = RBACChecker(user_id=None, user_roles=["analyst"])
    checker.assert_allowed("read_data", [perm])  # no exception


def test_rbac_denies_wrong_role():
    perm = make_perm(tool_name="read_data", allowed_roles=["admin"])
    checker = RBACChecker(user_id=None, user_roles=["analyst"])
    with pytest.raises(HTTPException) as exc_info:
        checker.assert_allowed("read_data", [perm])
    assert exc_info.value.status_code == 403


def test_rbac_allows_matching_user_id():
    user_id = uuid.uuid4()
    perm = make_perm(tool_name="do_thing")
    perm.allowed_roles = None
    perm.allowed_user_ids = [user_id]
    checker = RBACChecker(user_id=user_id, user_roles=[])
    checker.assert_allowed("do_thing", [perm])


def test_rbac_allows_no_permission_row():
    """Tool with no ToolPermission row → default allow."""
    checker = RBACChecker(user_id=None, user_roles=[])
    checker.assert_allowed("any_tool", [])  # no exception


def test_rbac_filter_removes_restricted_tools():
    perm = make_perm(tool_name="admin_tool", allowed_roles=["admin"])
    tools = [
        {"name": "admin_tool", "description": ""},
        {"name": "public_tool", "description": ""},
    ]
    checker = RBACChecker(user_id=None, user_roles=["viewer"])
    filtered = checker.filter_tools(tools, [perm])
    names = [t["name"] for t in filtered]
    assert "admin_tool" not in names
    assert "public_tool" in names
