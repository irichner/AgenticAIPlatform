#!/usr/bin/env python3
"""Verify that every ground_truth operationId in linode-labels.json exists in linode-api.json.

Run from repo root after scripts/refresh_fixtures.py has been run:
    python scripts/verify_linode_labels.py

Exits 0 if all labels are valid, 1 otherwise.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
LABELS_PATH = REPO_ROOT / "tests" / "fixtures" / "specs" / "linode-labels.json"
SPEC_PATH = REPO_ROOT / "tests" / "fixtures" / "specs" / "linode-api.json"

PLACEHOLDER = "<verify>"


def extract_operation_ids(spec: dict) -> set[str]:
    """Walk all paths and collect every operationId present in the spec."""
    ids: set[str] = set()
    for path_item in spec.get("paths", {}).values():
        if not isinstance(path_item, dict):
            continue
        for operation in path_item.values():
            if not isinstance(operation, dict):
                continue
            op_id = operation.get("operationId")
            if op_id:
                ids.add(op_id)
    return ids


def main() -> None:
    if not SPEC_PATH.exists():
        print(f"ERROR: {SPEC_PATH} not found.")
        print("Run scripts/refresh_fixtures.py first to download the Linode spec.")
        sys.exit(1)

    if not LABELS_PATH.exists():
        print(f"ERROR: {LABELS_PATH} not found.")
        sys.exit(1)

    with SPEC_PATH.open(encoding="utf-8") as f:
        spec = json.load(f)
    with LABELS_PATH.open(encoding="utf-8") as f:
        labels = json.load(f)

    spec_ids = extract_operation_ids(spec)
    print(f"Linode spec contains {len(spec_ids)} operationIds.")

    queries = labels.get("queries", [])
    errors: list[str] = []
    placeholders: list[str] = []

    for entry in queries:
        gt = entry.get("ground_truth", "")
        query = entry.get("query", "")
        if gt == PLACEHOLDER:
            placeholders.append(query)
        elif gt not in spec_ids:
            errors.append(f"  '{gt}' (for query: '{query}') not found in Linode spec")

    if placeholders:
        print(f"\nFOUND {len(placeholders)} unverified labels (still '{PLACEHOLDER}'):")
        for q in placeholders:
            print(f"  - '{q}'")
        print("\nTo fix: look up each operationId in tests/fixtures/specs/linode-api.json")
        print("and replace the '<verify>' placeholder in tests/fixtures/specs/linode-labels.json.")
        sys.exit(1)

    if errors:
        print(f"\nERROR: {len(errors)} ground_truth operationId(s) not found in Linode spec:")
        for e in errors:
            print(e)
        print(
            "\nCheck tests/fixtures/specs/linode-labels.json against the actual spec "
            "at tests/fixtures/specs/linode-api.json"
        )
        sys.exit(1)

    print(f"\nAll {len(queries)} labels verified successfully.")


if __name__ == "__main__":
    main()
