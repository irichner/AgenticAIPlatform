"""Integration tier — tool invocation shape validation.

Verifies that parameters parsed from the spec are placed in the correct part
of the HTTP request (path interpolation, query string, request body, headers).

Uses the official Petstore Docker container via testcontainers.
All calls are idempotent (GET-only or shape-only assertions on POSTs).

These tests are NOT merge-blocking in the default CI configuration.
See .github/workflows/test.yml for the gating strategy.

Requires: testcontainers, httpx, Docker daemon
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

SPECS_DIR = REPO_ROOT / "tests" / "fixtures" / "specs"

try:
    import httpx
    _HTTPX_AVAILABLE = True
except ImportError:
    _HTTPX_AVAILABLE = False

try:
    import testcontainers  # noqa: F401
    _TC_AVAILABLE = True
except ImportError:
    _TC_AVAILABLE = False

pytestmark = pytest.mark.skipif(
    not (_HTTPX_AVAILABLE and _TC_AVAILABLE),
    reason="httpx or testcontainers not installed — skipping invocation tests",
)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _build_request_from_tool(tool, params: dict) -> dict:
    """Construct a request dict (method, url, query, body, headers) from a ParsedTool."""
    path = tool.path
    query: dict = {}
    body: dict = {}
    headers: dict = {}

    for pname, value in params.items():
        loc = tool.param_locations.get(pname, "query")
        if loc == "path":
            path = path.replace(f"{{{pname}}}", str(value))
        elif loc == "query":
            query[pname] = value
        elif loc == "body":
            body[pname] = value
        elif loc == "header":
            headers[pname] = str(value)

    return {
        "method": tool.http_method,
        "path": path,
        "query": query,
        "body": body,
        "headers": headers,
    }


# ── Path parameter interpolation ───────────────────────────────────────────────

def test_path_params_are_interpolated_correctly(petstore_container: str) -> None:
    """Path parameter 'petId' must be substituted into the URL, not sent as query."""
    from app.services.openapi_detector import OpenAPIDetector  # noqa: PLC0415

    spec_path = SPECS_DIR / "petstore-v3.json"
    if not spec_path.exists():
        pytest.skip("petstore-v3.json not found. Run scripts/refresh_fixtures.py first.")

    with spec_path.open() as f:
        spec = json.load(f)

    tools = OpenAPIDetector().parse_to_mcp_tools(spec)
    get_pet = next(
        (t for t in tools if t.path == "/pet/{petId}" and t.http_method == "GET"),
        None,
    )
    if get_pet is None:
        pytest.skip("GET /pet/{petId} not found in petstore-v3 tools")

    req = _build_request_from_tool(get_pet, {"petId": 1})

    # petId must appear in path, not query string
    assert "{petId}" not in req["path"], "petId must be interpolated into the path"
    assert "1" in req["path"], "interpolated petId value must appear in path"
    assert "petId" not in req["query"], "petId must not appear in query string"

    # Actually hit the container to verify the path resolves
    url = f"{petstore_container}{req['path']}"
    with httpx.Client(timeout=10.0) as client:
        resp = client.request(
            method=req["method"],
            url=url,
            params=req["query"],
            headers={**req["headers"], "Accept": "application/json"},
        )
    # 200 or 404 are both acceptable (pet may not exist); 4xx/5xx from bad path format is not
    assert resp.status_code in (200, 404), (
        f"Unexpected status {resp.status_code} for path {req['path']}. "
        "This suggests path interpolation produced a malformed URL."
    )


def test_query_params_are_sent_as_query_string(petstore_container: str) -> None:
    """Query parameters must be sent as URL query string, not in request body."""
    from app.services.openapi_detector import OpenAPIDetector  # noqa: PLC0415

    spec_path = SPECS_DIR / "petstore-v3.json"
    if not spec_path.exists():
        pytest.skip("petstore-v3.json not found. Run scripts/refresh_fixtures.py first.")

    with spec_path.open() as f:
        spec = json.load(f)

    tools = OpenAPIDetector().parse_to_mcp_tools(spec)
    find_by_status = next(
        (t for t in tools if t.path == "/pet/findByStatus"),
        None,
    )
    if find_by_status is None:
        pytest.skip("GET /pet/findByStatus not found in petstore-v3 tools")

    # 'status' is a query param
    status_loc = find_by_status.param_locations.get("status")
    assert status_loc == "query", (
        f"'status' param in /pet/findByStatus should be 'query', got {status_loc!r}"
    )

    req = _build_request_from_tool(find_by_status, {"status": "available"})
    assert req["query"].get("status") == "available"
    assert not req["body"]  # no body for GET

    url = f"{petstore_container}{req['path']}"
    with httpx.Client(timeout=10.0) as client:
        resp = client.request(
            method=req["method"],
            url=url,
            params=req["query"],
            headers={**req["headers"], "Accept": "application/json"},
        )
    assert resp.status_code in (200, 405), (
        f"Unexpected {resp.status_code} — query params may not be correctly placed"
    )


def test_post_body_params_are_sent_in_body(petstore_container: str) -> None:
    """Body parameters from requestBody must be sent in the request body, not query."""
    from app.services.openapi_detector import OpenAPIDetector  # noqa: PLC0415

    spec_path = SPECS_DIR / "petstore-v3.json"
    if not spec_path.exists():
        pytest.skip("petstore-v3.json not found. Run scripts/refresh_fixtures.py first.")

    with spec_path.open() as f:
        spec = json.load(f)

    tools = OpenAPIDetector().parse_to_mcp_tools(spec)
    add_pet = next(
        (t for t in tools if t.path == "/pet" and t.http_method == "POST"),
        None,
    )
    if add_pet is None:
        pytest.skip("POST /pet not found in petstore-v3 tools")

    # Verify body params are classified correctly
    body_params = {k for k, v in add_pet.param_locations.items() if v == "body"}
    assert len(body_params) > 0, "POST /pet must have body parameters"

    # Construct a minimal request body
    test_payload = {k: "test" for k in list(body_params)[:2]}
    req = _build_request_from_tool(add_pet, test_payload)

    assert req["body"], "Body params must produce a non-empty request body dict"
    assert not req["query"], "Body params must not appear in query string"

    # Hit the container — shape assertion only (201 or 400/422 from validation)
    url = f"{petstore_container}{req['path']}"
    with httpx.Client(timeout=10.0) as client:
        resp = client.request(
            method=req["method"],
            url=url,
            json=req["body"],
            headers={**req["headers"], "Content-Type": "application/json"},
        )
    assert resp.status_code in (200, 201, 400, 405, 415, 422), (
        f"Unexpected {resp.status_code} — body params may be misrouted"
    )
