"""
T5 — OutputSanitizer must cap size and depth, and wrap in delimiters.
"""
import json

import pytest

from app.mcp_gateway.sanitizer import sanitize, _cap_depth


def test_sanitize_wraps_in_delimiters():
    result = sanitize({"key": "value"})
    assert result.startswith("```tool_result\n")
    assert result.endswith("\n```")


def test_sanitize_small_result_unchanged():
    obj = {"answer": 42}
    result = sanitize(obj)
    inner = result[len("```tool_result\n"):-len("\n```")]
    parsed = json.loads(inner)
    assert parsed == obj


def test_sanitize_truncates_oversized_result(monkeypatch):
    from app.mcp_gateway import sanitizer as san_mod
    monkeypatch.setattr(san_mod.settings, "sanitizer_max_result_bytes", 20)
    big = "x" * 100
    result = sanitize(big)
    assert "[TRUNCATED]" in result
    assert len(result.encode("utf-8")) < 200  # sanity: not the full original size


def test_cap_depth_stops_at_max(monkeypatch):
    from app.mcp_gateway import sanitizer as san_mod
    monkeypatch.setattr(san_mod.settings, "sanitizer_max_recursion_depth", 3)

    nested = {"a": {"b": {"c": {"d": {"e": "deep"}}}}}
    result = _cap_depth(nested, 0)
    # At depth 3, the value should be the sentinel
    assert result["a"]["b"]["c"] == "[MAX_DEPTH_EXCEEDED]"


def test_sanitize_handles_non_json_serializable():
    class Weird:
        pass

    result = sanitize(Weird())
    assert "```tool_result" in result
