"""Unit tier — baseline-backed parsing tests.

Every test here loads a vendored fixture and a generated baseline and asserts
that the current parser output matches. Run scripts/refresh_fixtures.py first
to generate the baselines; until then, tests that require baselines will skip.

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

# Import conftest helpers without going through the package to avoid circular deps.
sys.path.insert(0, str(REPO_ROOT / "tests"))
from conftest import load_spec, load_baseline  # noqa: E402
from config import PARSING_TOOL_COUNT_TOLERANCE, PARAM_BREAKDOWN_TOLERANCE  # noqa: E402

SPECS_DIR = REPO_ROOT / "tests" / "fixtures" / "specs"
BASELINES_DIR = REPO_ROOT / "tests" / "fixtures" / "baselines"

# Specs for which we have upstream-downloaded + baseline-backed tests.
# Populated once scripts/refresh_fixtures.py has run.
BASELINE_SPECS = [
    "petstore-v2.json",
    "petstore-v3.json",
    "github-api.json",
    "stripe-api.json",
    "linode-api.json",
]


# ── Parametrised baseline tests ───────────────────────────────────────────────

@pytest.mark.parametrize("spec_name", BASELINE_SPECS)
def test_tool_count_within_tolerance(spec_name: str) -> None:
    spec = load_spec(spec_name)
    baseline = load_baseline(spec_name)

    detector = OpenAPIDetector()
    tools = detector.parse_to_mcp_tools(spec)

    expected = baseline["tool_count"]
    actual = len(tools)
    assert abs(actual - expected) <= PARSING_TOOL_COUNT_TOLERANCE, (
        f"{spec_name}: tool count {actual} differs from baseline {expected} "
        f"by more than tolerance {PARSING_TOOL_COUNT_TOLERANCE}. "
        "If the upstream spec changed, re-run scripts/refresh_fixtures.py with provenance."
    )


@pytest.mark.parametrize("spec_name", BASELINE_SPECS)
def test_operation_ids_match_baseline(spec_name: str) -> None:
    spec = load_spec(spec_name)
    baseline = load_baseline(spec_name)

    detector = OpenAPIDetector()
    tools = detector.parse_to_mcp_tools(spec)

    actual_ids = sorted(t.name for t in tools)
    expected_ids: list[str] = baseline["operation_ids"]

    # Allow tolerance: compute symmetric difference and check against count tolerance
    actual_set = set(actual_ids)
    expected_set = set(expected_ids)
    diff = actual_set.symmetric_difference(expected_set)
    assert len(diff) <= PARSING_TOOL_COUNT_TOLERANCE * 2, (
        f"{spec_name}: operation_ids mismatch.\n"
        f"  Added  : {sorted(actual_set - expected_set)}\n"
        f"  Removed: {sorted(expected_set - actual_set)}\n"
        "Re-run scripts/refresh_fixtures.py if the upstream spec changed."
    )


@pytest.mark.parametrize("spec_name", BASELINE_SPECS)
def test_param_breakdown_within_tolerance(spec_name: str) -> None:
    spec = load_spec(spec_name)
    baseline = load_baseline(spec_name)

    from app.services.openapi_detector import compute_param_breakdown  # noqa: PLC0415

    detector = OpenAPIDetector()
    tools = detector.parse_to_mcp_tools(spec)
    actual_bd = compute_param_breakdown(tools)
    expected_bd: dict = baseline.get("param_breakdown", {})

    for loc in ("path", "query", "header", "cookie", "body"):
        actual_val = actual_bd.get(loc, 0)
        expected_val = expected_bd.get(loc, 0)
        tolerance = PARAM_BREAKDOWN_TOLERANCE.get(loc, 0)
        assert abs(actual_val - expected_val) <= tolerance, (
            f"{spec_name}: param_breakdown[{loc!r}] = {actual_val}, "
            f"expected ~{expected_val} (tolerance ±{tolerance}). "
            "Re-run scripts/refresh_fixtures.py if the upstream spec changed."
        )


# ── Missing operationId fallback naming ───────────────────────────────────────

def test_missing_operationid_produces_deterministic_fallback_names() -> None:
    """Parser must produce stable {method}_{path_slug} names when operationId is absent."""
    spec_path = REPO_ROOT / "tests" / "fixtures" / "specs" / "petstore-missing-operationid.json"
    with spec_path.open(encoding="utf-8") as f:
        spec = json.load(f)

    detector = OpenAPIDetector()
    run1 = [t.name for t in detector.parse_to_mcp_tools(spec)]
    run2 = [t.name for t in detector.parse_to_mcp_tools(spec)]

    assert run1 == run2, "Fallback names must be identical across consecutive runs"

    # None of the tools should have an empty name
    assert all(name for name in run1), "Fallback names must not be empty"

    # Verify the fallback pattern: method_path_segments
    expected_names = {
        "get_pets",
        "post_pets",
        "get_pets_petid",
        "delete_pets_petid",
    }
    assert set(run1) == expected_names, (
        f"Unexpected fallback names: {set(run1)}\nExpected: {expected_names}"
    )


def test_missing_operationid_names_are_stable_across_independent_runs() -> None:
    """Second independent parse of the same spec must produce the same names (no RNG)."""
    spec_path = REPO_ROOT / "tests" / "fixtures" / "specs" / "petstore-missing-operationid.json"
    with spec_path.open(encoding="utf-8") as f:
        spec = json.load(f)

    # Two independent detector instances
    names_a = sorted(t.name for t in OpenAPIDetector().parse_to_mcp_tools(spec))
    names_b = sorted(t.name for t in OpenAPIDetector().parse_to_mcp_tools(spec))
    assert names_a == names_b


# ── Circular $ref graceful degradation ────────────────────────────────────────

def test_circular_ref_does_not_crash() -> None:
    """Parser must complete without raising even when $ref forms a cycle."""
    spec_path = REPO_ROOT / "tests" / "fixtures" / "specs" / "petstore-circular-ref.json"
    with spec_path.open(encoding="utf-8") as f:
        spec = json.load(f)

    detector = OpenAPIDetector()
    # Must not raise RecursionError or any other exception
    tools = detector.parse_to_mcp_tools(spec)
    assert len(tools) > 0, "Parser must produce at least one tool even with circular $ref"


# ── Invalid spec rejection ─────────────────────────────────────────────────────

def test_invalid_spec_raises_value_error_not_generic_exception() -> None:
    """Detector must raise ValueError (not bare Exception or KeyError) for non-spec JSON."""
    spec_path = REPO_ROOT / "tests" / "fixtures" / "specs" / "invalid-not-openapi.json"
    with spec_path.open(encoding="utf-8") as f:
        spec = json.load(f)

    detector = OpenAPIDetector()
    with pytest.raises(ValueError, match="Unrecogni"):
        detector.parse_to_mcp_tools(spec)
