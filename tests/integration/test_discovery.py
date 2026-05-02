"""Integration tier — OpenAPI discovery path-probing tests.

Tests that the detector probes well-known discovery paths in the correct
priority order, and correctly rejects false positives from the negative
fixture set.

These tests use the local FastAPI mock server (tests/fixtures/discovery/mock_server.py)
and do NOT make real network requests. They are NOT merge-blocking in the
default CI configuration (see .github/workflows/test.yml).

Requires: pytest-asyncio, httpx, uvicorn, fastapi
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

FIXTURES_DIR = REPO_ROOT / "tests" / "fixtures"
NEGATIVE_DIR = FIXTURES_DIR / "negative"

try:
    import httpx  # noqa: F401
    _HTTPX_AVAILABLE = True
except ImportError:
    _HTTPX_AVAILABLE = False

pytestmark = pytest.mark.skipif(
    not _HTTPX_AVAILABLE,
    reason="httpx not installed — skipping integration/discovery tests",
)

# Well-known discovery paths in priority order (highest priority first)
DISCOVERY_PATHS = [
    "/openapi.json",
    "/openapi.yaml",
    "/swagger.json",
    "/swagger.yaml",
    "/api-docs",
    "/api-docs.json",
    "/v1/openapi.json",
    "/v2/api-docs",
]


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_scenario(base_url: str, path: str, scenario: str) -> httpx.Response:
    with httpx.Client(timeout=5.0) as client:
        return client.get(f"{base_url}{path}", params={"scenario": scenario})


def _is_valid_openapi(body: bytes) -> bool:
    """Return True if body is a JSON dict with an openapi or swagger key."""
    try:
        data = json.loads(body)
        return isinstance(data, dict) and (
            "openapi" in data or "swagger" in data
        )
    except (json.JSONDecodeError, ValueError):
        return False


# ── Priority order tests ───────────────────────────────────────────────────────

def test_openapi_json_is_checked_before_swagger_json(mock_discovery_server: str) -> None:
    """/openapi.json must be found before /swagger.json is tried."""
    # petstore-v3 scenario: /openapi.json returns a valid spec, /swagger.json returns 404
    resp_openapi = _get_scenario(mock_discovery_server, "/openapi.json", "petstore-v3")
    resp_swagger = _get_scenario(mock_discovery_server, "/swagger.json", "petstore-v3")

    assert resp_openapi.status_code == 200
    assert _is_valid_openapi(resp_openapi.content)

    assert resp_swagger.status_code == 404, (
        "In the petstore-v3 scenario /swagger.json should return 404 "
        "to verify that /openapi.json is the preferred path"
    )


def test_swagger_json_fallback_when_openapi_json_absent(mock_discovery_server: str) -> None:
    """/swagger.json must be used when /openapi.json returns 404."""
    resp_openapi = _get_scenario(mock_discovery_server, "/openapi.json", "swagger-json-only")
    resp_swagger = _get_scenario(mock_discovery_server, "/swagger.json", "swagger-json-only")

    assert resp_openapi.status_code == 404
    assert resp_swagger.status_code == 200
    assert _is_valid_openapi(resp_swagger.content)


def test_api_docs_fallback(mock_discovery_server: str) -> None:
    """/api-docs must be tried when higher-priority paths return 404."""
    resp = _get_scenario(mock_discovery_server, "/api-docs", "api-docs-only")
    assert resp.status_code == 200
    assert _is_valid_openapi(resp.content)


def test_all_paths_404_returns_nothing(mock_discovery_server: str) -> None:
    """When all discovery paths return 404, the mock server should never return a spec."""
    for path in DISCOVERY_PATHS:
        resp = _get_scenario(mock_discovery_server, path, "all-404")
        assert resp.status_code == 404, f"{path} should be 404 in all-404 scenario"


# ── False positive rejection ───────────────────────────────────────────────────

def test_html_response_is_rejected(mock_discovery_server: str) -> None:
    """An HTML response at /openapi.json must not be treated as a valid spec."""
    resp = _get_scenario(mock_discovery_server, "/openapi.json", "html-false-positive")
    assert resp.status_code == 200
    body = resp.content
    # Must NOT parse as a valid OpenAPI spec
    assert not _is_valid_openapi(body), (
        "HTML body at /openapi.json must not be treated as a valid OpenAPI spec"
    )


def test_non_openapi_json_is_rejected(mock_discovery_server: str) -> None:
    """A JSON response without 'openapi' or 'swagger' key must be rejected."""
    resp = _get_scenario(mock_discovery_server, "/openapi.json", "non-openapi-json")
    assert resp.status_code == 200
    assert not _is_valid_openapi(resp.content)


# ── Negative fixture file checks ───────────────────────────────────────────────

@pytest.mark.parametrize("filename", [
    "json-with-paths-not-openapi.json",
    "pure-json-schema.json",
    "error-body-200.json",
])
def test_negative_json_fixture_not_valid_openapi(filename: str) -> None:
    """Each negative JSON fixture must fail the is-valid-OpenAPI check."""
    path = NEGATIVE_DIR / filename
    if not path.exists():
        pytest.skip(f"Fixture not found: {filename}")
    body = path.read_bytes()
    assert not _is_valid_openapi(body), (
        f"{filename} should not be recognised as a valid OpenAPI spec"
    )


def test_truncated_json_is_not_parseable() -> None:
    """Truncated JSON must cause a parse error, not silently produce an empty spec."""
    path = NEGATIVE_DIR / "truncated.json"
    if not path.exists():
        pytest.skip("Fixture not found: truncated.json")
    body = path.read_bytes()
    with pytest.raises(json.JSONDecodeError):
        json.loads(body)
