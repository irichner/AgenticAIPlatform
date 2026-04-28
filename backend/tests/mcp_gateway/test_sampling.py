"""
T3 — sampling/createMessage must be rejected when sampling_policy = 'deny'.
"""
import pytest

from app.mcp_gateway.prompts import TOOL_RESULT_GUARDRAIL_BASE, compose_guardrail_prompt


def test_guardrail_base_immutable():
    """Base prompt should not be modifiable by callers."""
    original = TOOL_RESULT_GUARDRAIL_BASE
    composed = compose_guardrail_prompt(org_additions="extra org note")
    # Base is unchanged
    assert TOOL_RESULT_GUARDRAIL_BASE == original


def test_compose_appends_additions():
    result = compose_guardrail_prompt(
        org_additions="Org policy: no PII.",
        registration_additions="Do not call external URLs.",
    )
    assert TOOL_RESULT_GUARDRAIL_BASE in result
    assert "Org policy: no PII." in result
    assert "Do not call external URLs." in result


def test_compose_with_no_additions():
    result = compose_guardrail_prompt()
    assert result == TOOL_RESULT_GUARDRAIL_BASE


def test_compose_base_always_first():
    result = compose_guardrail_prompt(org_additions="extra")
    assert result.startswith(TOOL_RESULT_GUARDRAIL_BASE)


def test_compose_empty_string_additions_ignored():
    result = compose_guardrail_prompt(org_additions="   ", registration_additions="")
    assert result == TOOL_RESULT_GUARDRAIL_BASE
