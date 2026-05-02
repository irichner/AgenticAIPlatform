"""Unit tier — schema drift surfacer.

This test DOES NOT FAIL CI. It loads schema_diff.json (if present) and
prints its contents to the test log so that PR reviewers see any upstream
spec drift in the test output without having to check the file manually.

The test is warn-only by design: a genuine drift in upstream specs should
trigger a fixture refresh + baseline update, not an automated test failure.
Only the baseline-backed tests in test_parsing.py enforce correctness.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
BASELINES_DIR = REPO_ROOT / "tests" / "fixtures" / "baselines"


def test_surface_schema_drift_to_log(capfd: pytest.CaptureFixture) -> None:
    """Warn-only: print schema_diff.json to test log for PR reviewer visibility.

    This test always passes. It exists solely to make drift visible in CI output
    so reviewers do not have to manually inspect the baselines directory.
    If you see drift here, re-run scripts/refresh_fixtures.py, review the
    drift_report.md, update baselines with provenance comments, and re-commit.
    """
    diff_path = BASELINES_DIR / "schema_diff.json"
    drift_path = BASELINES_DIR / "drift_report.md"

    if not diff_path.exists():
        print(
            "\n[schema_drift] No schema_diff.json found. "
            "Run scripts/refresh_fixtures.py at least twice to generate a drift report."
        )
        return

    with diff_path.open() as f:
        diff = json.load(f)

    print("\n" + "=" * 60)
    print("[schema_drift] Drift detected since last baseline run:")
    print("=" * 60)

    if isinstance(diff, dict) and diff.get("warning"):
        print(f"WARNING: {diff['warning']}")
    else:
        print(json.dumps(diff, indent=2)[:4000])  # cap at 4 000 chars to avoid log spam

    if drift_path.exists():
        print("\n--- Human-readable drift report (drift_report.md) ---")
        print(drift_path.read_text()[:3000])

    print("=" * 60)
    print(
        "[schema_drift] To resolve: run scripts/refresh_fixtures.py, "
        "review drift_report.md, update baselines with provenance, re-commit."
    )
