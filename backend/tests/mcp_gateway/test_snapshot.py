"""
T11 — ManifestSnapshot: assert_tool_in_snapshot rejects post-pin tools.
"""
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.mcp_gateway.snapshot import assert_tool_in_snapshot, get_allowed_tools_from_snapshot


def make_snapshot(reg_id: uuid.UUID, tools: list[str]) -> SimpleNamespace:
    return SimpleNamespace(
        run_id=uuid.uuid4(),
        org_id=uuid.uuid4(),
        user_id=None,
        snapshot_json={
            "registrations": [
                {
                    "id": str(reg_id),
                    "name": "test-reg",
                    "mcp_url": "https://mcp.example.com/mcp",
                    "credential_hash": "abc123",
                    "tools": [{"name": t} for t in tools],
                }
            ]
        },
    )


def test_assert_tool_in_snapshot_allows_pinned_tool():
    reg_id = uuid.uuid4()
    snap = make_snapshot(reg_id, ["search", "read_file"])
    assert_tool_in_snapshot(snap, reg_id, "search")  # no exception


def test_assert_tool_in_snapshot_rejects_unpinned_tool():
    reg_id = uuid.uuid4()
    snap = make_snapshot(reg_id, ["search"])
    with pytest.raises(HTTPException) as exc_info:
        assert_tool_in_snapshot(snap, reg_id, "evil_new_tool")
    assert exc_info.value.status_code == 403


def test_get_allowed_tools_returns_all_pinned():
    reg_id = uuid.uuid4()
    snap = make_snapshot(reg_id, ["a", "b", "c"])
    tools = get_allowed_tools_from_snapshot(snap, reg_id)
    assert set(tools) == {"a", "b", "c"}


def test_get_allowed_tools_unknown_reg_returns_empty():
    reg_id = uuid.uuid4()
    snap = make_snapshot(uuid.uuid4(), ["a"])  # different reg_id
    tools = get_allowed_tools_from_snapshot(snap, reg_id)
    assert tools == []
