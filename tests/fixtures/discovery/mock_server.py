"""FastAPI mock server for OpenAPI discovery integration tests.

Serves controllable responses at well-known OpenAPI discovery paths.
Spin it up with a random port in conftest.py; tests control behaviour
via the `scenario` query parameter or fixture injection.

Usage (from conftest.py):
    import threading, uvicorn
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=0))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, Query, Response
from fastapi.responses import HTMLResponse, JSONResponse

FIXTURES = Path(__file__).resolve().parent.parent
SPECS = FIXTURES / "specs"
NEGATIVE = FIXTURES / "negative"

app = FastAPI(title="Discovery Mock Server")

# ── Scenario registry ─────────────────────────────────────────────────────────
# Each scenario name maps to a handler function (path, method) → Response.
# Tests set scenario via the `X-Mock-Scenario` header or the `scenario` query param.

_DEFAULT_SCENARIO = "petstore-v3"

_SCENARIOS: dict[str, dict[str, bytes | str | None]] = {
    # scenario_name: {path: raw_bytes_or_None}
    # None means 404 for that path.
}

# Populated lazily on first request so the server starts even if fixtures aren't yet present.

def _load_scenarios() -> None:
    petstore_path = SPECS / "petstore-v3.json"
    petstore_bytes = petstore_path.read_bytes() if petstore_path.exists() else b"{}"

    invalid_path = NEGATIVE / "json-with-paths-not-openapi.json"
    invalid_bytes = invalid_path.read_bytes() if invalid_path.exists() else b"{}"

    html_path = NEGATIVE / "html-with-swagger-title.html"
    html_bytes = html_path.read_bytes() if html_path.exists() else b"<html></html>"

    _SCENARIOS.update({
        "petstore-v3": {
            "/openapi.json": petstore_bytes,
            "/swagger.json": None,
            "/api-docs": None,
            "/": None,
        },
        "swagger-json-only": {
            "/openapi.json": None,
            "/swagger.json": petstore_bytes,
            "/api-docs": None,
        },
        "api-docs-only": {
            "/openapi.json": None,
            "/swagger.json": None,
            "/api-docs": petstore_bytes,
        },
        "html-false-positive": {
            "/openapi.json": html_bytes,
            "/swagger.json": None,
        },
        "non-openapi-json": {
            "/openapi.json": invalid_bytes,
            "/swagger.json": None,
        },
        "all-404": {
            "/openapi.json": None,
            "/swagger.json": None,
            "/api-docs": None,
        },
    })


@app.get("/{path:path}")
async def catch_all(
    path: str,
    scenario: Annotated[str, Query()] = _DEFAULT_SCENARIO,
) -> Response:
    if not _SCENARIOS:
        _load_scenarios()

    full_path = f"/{path}"
    scenario_data = _SCENARIOS.get(scenario, _SCENARIOS.get(_DEFAULT_SCENARIO, {}))
    content = scenario_data.get(full_path)

    if content is None:
        return Response(status_code=404, content=b"Not found")

    if isinstance(content, bytes) and content.startswith(b"<"):
        return HTMLResponse(content=content.decode(), status_code=200)

    return Response(
        content=content,
        status_code=200,
        media_type="application/json",
    )


@app.get("/healthz")
async def health() -> dict:
    return {"status": "ok"}
