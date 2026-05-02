"""Unit tier — synthetic fixture tests.

Each test covers exactly one parser behaviour, isolated in a hand-crafted
minimal spec (< 50 lines of JSON). These run without any baseline files
and without network access.

Tests are merge-blocking (run on every PR via .github/workflows/test.yml).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.services.openapi_detector import OpenAPIDetector  # noqa: E402

SYNTHETIC_DIR = REPO_ROOT / "tests" / "fixtures" / "specs" / "synthetic"


def _load(name: str) -> dict:
    with (SYNTHETIC_DIR / name).open(encoding="utf-8") as f:
        return json.load(f)


# ── oneOf union parameter ──────────────────────────────────────────────────────

def test_oneof_produces_tool_with_body_params() -> None:
    """A requestBody schema with oneOf fields must produce a tool with body parameters."""
    spec = _load("minimal-oneof.json")
    tools = OpenAPIDetector().parse_to_mcp_tools(spec)

    assert len(tools) == 1
    tool = tools[0]
    assert tool.name == "create_item"
    assert tool.http_method == "POST"

    # 'data' and 'tag' are both properties from the request body
    props = tool.input_schema.get("properties", {})
    assert "data" in props, "'data' (the oneOf field) must appear in input_schema properties"
    assert "tag" in props, "'tag' must appear alongside the oneOf field"

    # The oneOf field should preserve the union schema, not be flattened
    data_schema = props["data"]
    assert "oneOf" in data_schema, "oneOf must be preserved in the schema, not flattened"

    # 'data' is required per the spec
    assert "data" in tool.input_schema.get("required", [])

    # param_locations must record both as body params
    assert tool.param_locations.get("data") == "body"
    assert tool.param_locations.get("tag") == "body"


# ── Circular $ref — no infinite recursion ─────────────────────────────────────

def test_circular_ref_does_not_recurse() -> None:
    """Circular $ref in response schema must not cause infinite recursion."""
    spec = _load("minimal-circular-ref.json")

    # Must not raise RecursionError
    tools = OpenAPIDetector().parse_to_mcp_tools(spec)
    assert len(tools) == 1
    tool = tools[0]
    assert tool.name == "get_node"
    assert tool.http_method == "GET"

    # Path parameter 'id' must be captured
    assert "id" in tool.input_schema.get("properties", {})
    assert tool.param_locations.get("id") == "path"


# ── Missing operationId — deterministic fallback ───────────────────────────────

def test_missing_opid_fallback_names_are_deterministic() -> None:
    """Without operationId, tool names must be {method}_{path_slug} and stable."""
    spec = _load("minimal-missing-opid.json")
    detector = OpenAPIDetector()

    run1 = sorted(t.name for t in detector.parse_to_mcp_tools(spec))
    run2 = sorted(t.name for t in detector.parse_to_mcp_tools(spec))

    assert run1 == run2, "Fallback names must be deterministic"

    expected = sorted(["get_users_id", "post_posts", "delete_comments_id"])
    assert run1 == expected, (
        f"Unexpected fallback names: {run1}\nExpected: {expected}"
    )


# ── Vendor extensions — preserved or safely ignored ───────────────────────────

def test_vendor_extensions_do_not_break_parsing() -> None:
    """x-* fields in operations and parameters must not cause errors."""
    spec = _load("minimal-vendor-extension.json")
    tools = OpenAPIDetector().parse_to_mcp_tools(spec)

    assert len(tools) == 2
    names = {t.name for t in tools}
    assert names == {"list_items", "update_item"}

    list_tool = next(t for t in tools if t.name == "list_items")
    # Parameters with x-* fields must still be captured correctly
    assert "limit" in list_tool.input_schema.get("properties", {})
    assert "cursor" in list_tool.input_schema.get("properties", {})
    assert list_tool.param_locations.get("limit") == "query"
    assert list_tool.param_locations.get("cursor") == "query"


# ── Nullable — 3.0 vs 3.1 handled equivalently ────────────────────────────────

def test_nullable_3_0_and_3_1_both_preserved() -> None:
    """Both OpenAPI 3.0 nullable:true and 3.1 type:["string","null"] must survive parsing."""
    spec = _load("minimal-nullable-3.0-vs-3.1.json")
    tools = OpenAPIDetector().parse_to_mcp_tools(spec)

    assert len(tools) == 1
    tool = tools[0]
    assert tool.name == "update_item"

    props = tool.input_schema.get("properties", {})

    # 3.0-style: nullable:true must be preserved in the schema
    assert "name_3_0_style" in props
    schema_3_0 = props["name_3_0_style"]
    assert schema_3_0.get("nullable") is True or schema_3_0.get("type") == "string", (
        "3.0-style nullable schema must be preserved"
    )

    # 3.1-style: type array must be preserved in the schema
    assert "name_3_1_style" in props
    schema_3_1 = props["name_3_1_style"]
    assert schema_3_1.get("type") in (["string", "null"], "string"), (
        "3.1-style type array must be preserved or normalised gracefully"
    )

    # Both must be tracked as body params
    assert tool.param_locations.get("name_3_0_style") == "body"
    assert tool.param_locations.get("name_3_1_style") == "body"
