#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Download upstream OpenAPI specs, parse them, and write baseline + drift report.

Run from repo root:
    python scripts/refresh_fixtures.py

Outputs:
    tests/fixtures/specs/{name}                        raw spec (JSON-normalised)
    tests/fixtures/baselines/{name}.baseline.json      per-spec baseline
    tests/fixtures/baselines/previous.json             aggregate used by next drift run
    tests/fixtures/baselines/schema_diff.json          machine-readable diff (if previous exists)
    tests/fixtures/baselines/drift_report.md           human-readable drift report (if previous)
"""
from __future__ import annotations

import io
import json
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path

# Ensure stdout/stderr use UTF-8 on Windows regardless of the console codepage.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import yaml        # pyyaml — already in backend/requirements.txt
import httpx

# ── Path bootstrap ─────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.services.openapi_detector import OpenAPIDetector, compute_param_breakdown  # noqa: E402

# ── Directories ────────────────────────────────────────────────────────────────
SPECS_DIR = REPO_ROOT / "tests" / "fixtures" / "specs"
BASELINES_DIR = REPO_ROOT / "tests" / "fixtures" / "baselines"
SPECS_DIR.mkdir(parents=True, exist_ok=True)
BASELINES_DIR.mkdir(parents=True, exist_ok=True)

# ── Upstream spec URLs ─────────────────────────────────────────────────────────
UPSTREAM: dict[str, str] = {
    "petstore-v2.json": "https://petstore.swagger.io/v2/swagger.json",
    "petstore-v3.json": "https://petstore3.swagger.io/api/v3/openapi.json",
    "github-api.json": "https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json",
    "stripe-api.json": "https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json",
    "linode-api.json": "https://raw.githubusercontent.com/linode/linode-api-docs/v4.111.0/openapi.yaml",
}

TIMEOUT = 30.0


# ── Fetch ──────────────────────────────────────────────────────────────────────

def fetch_spec(url: str) -> dict:
    """Download a spec URL and parse to dict; auto-detects JSON vs YAML."""
    print(f"  Fetching {url} ...", end=" ", flush=True)
    t0 = time.perf_counter()
    with httpx.Client(timeout=TIMEOUT, follow_redirects=True) as client:
        resp = client.get(url, headers={"Accept": "application/json, application/yaml, text/yaml, */*"})
        resp.raise_for_status()
    elapsed = time.perf_counter() - t0
    content_type = resp.headers.get("content-type", "")
    text = resp.text

    if "yaml" in content_type or url.endswith((".yaml", ".yml")):
        spec = yaml.safe_load(text)
    else:
        spec = json.loads(text)

    print(f"done ({elapsed:.1f}s, {len(text) / 1024:.0f} KB)")
    return spec


# ── Baseline ───────────────────────────────────────────────────────────────────

def build_baseline(name: str, spec: dict) -> dict:
    """Parse the spec and return a baseline dict."""
    detector = OpenAPIDetector()
    t0 = time.perf_counter()
    tools = detector.parse_to_mcp_tools(spec)
    parse_time = time.perf_counter() - t0

    breakdown = compute_param_breakdown(tools)

    return {
        "spec": name,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "tool_count": len(tools),
        "operation_ids": sorted(t.name for t in tools),
        "param_breakdown": breakdown,
        "parse_time_sec": round(parse_time, 6),
    }


# ── Drift report ───────────────────────────────────────────────────────────────

def generate_drift_report(previous: dict, current: dict) -> tuple[dict, str]:
    """Return (machine_diff_dict, human_readable_markdown).

    Uses deepdiff if available; falls back to a simple structural diff.
    """
    try:
        from deepdiff import DeepDiff  # type: ignore
        diff = DeepDiff(previous, current, verbose_level=2)
        machine_diff = diff.to_json(default_mapping={})
        if isinstance(machine_diff, str):
            machine_diff = json.loads(machine_diff)
    except ImportError:
        # Minimal fallback: detect added/removed/changed operation_ids per spec
        machine_diff = {"warning": "deepdiff not installed — limited diff"}

    prev_specs: dict = previous.get("specs", {})
    curr_specs: dict = current.get("specs", {})
    all_spec_names = sorted(set(prev_specs) | set(curr_specs))

    sections: list[str] = [
        "# Schema Drift Report",
        f"\nGenerated: {datetime.now(timezone.utc).isoformat()}",
        "\nChanges are grouped by spec and sorted by severity: **removed > changed > added**.\n",
    ]

    any_drift = False
    for spec_name in all_spec_names:
        prev_bl = prev_specs.get(spec_name)
        curr_bl = curr_specs.get(spec_name)

        if prev_bl is None:
            sections.append(f"\n## {spec_name} — NEW SPEC (no previous baseline)")
            any_drift = True
            continue
        if curr_bl is None:
            sections.append(f"\n## {spec_name} — REMOVED from run")
            any_drift = True
            continue

        prev_ids = set(prev_bl.get("operation_ids", []))
        curr_ids = set(curr_bl.get("operation_ids", []))
        removed = sorted(prev_ids - curr_ids)
        added = sorted(curr_ids - prev_ids)
        prev_count = prev_bl.get("tool_count", 0)
        curr_count = curr_bl.get("tool_count", 0)
        prev_bd = prev_bl.get("param_breakdown", {})
        curr_bd = curr_bl.get("param_breakdown", {})
        bd_changes = {k: (prev_bd.get(k, 0), curr_bd.get(k, 0))
                      for k in set(prev_bd) | set(curr_bd)
                      if prev_bd.get(k, 0) != curr_bd.get(k, 0)}

        if not removed and not added and not bd_changes and prev_count == curr_count:
            continue

        any_drift = True
        sections.append(f"\n## {spec_name}")
        sections.append(f"\nTool count: **{prev_count}** → **{curr_count}**")

        if removed:
            sections.append(f"\n### Removed operations ({len(removed)})")
            for op in removed:
                sections.append(f"- `{op}`")

        if bd_changes:
            sections.append("\n### Parameter breakdown changes")
            for loc, (was, now) in sorted(bd_changes.items()):
                sections.append(f"- `{loc}`: {was} → {now}")

        if added:
            sections.append(f"\n### Added operations ({len(added)})")
            for op in added:
                sections.append(f"- `{op}`")

    if not any_drift:
        sections.append("\n_No drift detected — all operation sets and parameter breakdowns are identical._")

    return machine_diff, "\n".join(sections)


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    print("=" * 70)
    print("refresh_fixtures.py — OpenAPI spec downloader + baseline generator")
    print("=" * 70)

    # Load previous aggregate for drift detection (if it exists)
    previous_path = BASELINES_DIR / "previous.json"
    previous_aggregate: dict | None = None
    if previous_path.exists():
        with previous_path.open() as f:
            previous_aggregate = json.load(f)
        print(f"\nFound previous baseline ({previous_path}) — will generate drift report.\n")
    else:
        print("\nNo previous baseline found — skipping drift report.\n")

    current_specs: dict[str, dict] = {}   # spec_name -> baseline dict
    total_parse_time = 0.0
    refreshed = 0
    errors: list[str] = []

    for name, url in UPSTREAM.items():
        print(f"\n[{name}]")
        try:
            spec = fetch_spec(url)
        except Exception as exc:
            print(f"  ERROR fetching: {exc}")
            errors.append(f"{name}: fetch failed — {exc}")
            continue

        # Normalise to JSON and write raw spec.
        # Use a custom encoder: PyYAML parses YAML date/datetime literals as Python
        # objects, which the standard json encoder cannot handle.
        def _json_default(obj):
            if isinstance(obj, (datetime, date)):
                return obj.isoformat()
            raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")

        spec_path = SPECS_DIR / name
        with spec_path.open("w", encoding="utf-8") as f:
            json.dump(spec, f, indent=2, ensure_ascii=False, default=_json_default)
        print(f"  Wrote spec -> {spec_path.relative_to(REPO_ROOT)}")

        # Parse and build baseline
        print(f"  Parsing ...", end=" ", flush=True)
        try:
            baseline = build_baseline(name, spec)
        except NotImplementedError as exc:
            print(f"\n  BLOCKED: {exc}")
            errors.append(f"{name}: {exc}")
            continue
        except Exception as exc:
            print(f"\n  ERROR parsing: {exc}")
            errors.append(f"{name}: parse failed — {exc}")
            continue

        print(
            f"done — {baseline['tool_count']} tools in {baseline['parse_time_sec']:.3f}s"
        )
        total_parse_time += baseline["parse_time_sec"]

        baseline_path = BASELINES_DIR / f"{name}.baseline.json"
        with baseline_path.open("w", encoding="utf-8") as f:
            json.dump(baseline, f, indent=2)
        print(f"  Wrote baseline -> {baseline_path.relative_to(REPO_ROOT)}")

        current_specs[name] = baseline
        refreshed += 1

    # ── Drift detection ───────────────────────────────────────────────────────
    drift_report_path: Path | None = None
    if previous_aggregate is not None and current_specs:
        print("\n─── Generating drift report ────────────────────────────────────────")
        machine_diff, human_report = generate_drift_report(
            previous_aggregate,
            {"generated_at": datetime.now(timezone.utc).isoformat(), "specs": current_specs},
        )
        diff_path = BASELINES_DIR / "schema_diff.json"
        with diff_path.open("w", encoding="utf-8") as f:
            json.dump(machine_diff, f, indent=2)

        drift_report_path = BASELINES_DIR / "drift_report.md"
        with drift_report_path.open("w", encoding="utf-8") as f:
            f.write(human_report)

        print(f"  schema_diff.json -> {diff_path.relative_to(REPO_ROOT)}")
        print(f"  drift_report.md  -> {drift_report_path.relative_to(REPO_ROOT)}")

    # ── Write new aggregate AFTER diff is generated ───────────────────────────
    # IMPORTANT: this write must come AFTER drift generation so the next run
    # diffs against THIS run, not the run before it.
    if current_specs:
        aggregate = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "specs": current_specs,
        }
        with previous_path.open("w", encoding="utf-8") as f:
            json.dump(aggregate, f, indent=2)
        print(f"\nUpdated {previous_path.relative_to(REPO_ROOT)}")

    # ── Summary ───────────────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print(f"Refreshed : {refreshed}/{len(UPSTREAM)} specs")
    print(f"Parse time: {total_parse_time:.3f}s total")
    if drift_report_path:
        print(f"Drift report: {drift_report_path.relative_to(REPO_ROOT)}")
    if errors:
        print(f"\nErrors ({len(errors)}):")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)
    print("=" * 70)


if __name__ == "__main__":
    main()
