"""Dynamic MCP runtime — serves the MCP JSON-RPC 2.0 protocol for registry-backed servers.

Agents point to  POST /api/mcp/dynamic/{slug}
The runtime looks up the server + tools from Postgres, makes HTTP calls against
the registered base_url, and returns MCP-formatted results.
"""
from __future__ import annotations
import json
import re
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies import get_db
from app.models.mcp_server import McpServer
from app.models.mcp_tool import McpTool

router = APIRouter(prefix="/mcp/dynamic", tags=["mcp-dynamic"])

MCP_VERSION = "2024-11-05"


def _jsonrpc_error(req_id: Any, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}


def _jsonrpc_result(req_id: Any, result: Any) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


async def _load_server(slug: str, db: AsyncSession) -> McpServer | None:
    result = await db.execute(
        select(McpServer)
        .options(selectinload(McpServer.tools))
        .where(McpServer.slug == slug, McpServer.runtime_mode == "dynamic", McpServer.enabled.is_(True))
    )
    return result.scalar_one_or_none()


def _build_auth_headers(auth_config: dict | None) -> dict[str, str]:
    if not auth_config:
        return {}
    auth_type = auth_config.get("type", "")
    if auth_type == "bearer":
        return {"Authorization": f"Bearer {auth_config.get('token', '')}"}
    if auth_type == "api_key":
        header_name = auth_config.get("header", "X-API-Key")
        return {header_name: auth_config.get("value", "")}
    return {}


def _substitute_path(path: str, args: dict) -> tuple[str, dict]:
    """Replace {param} placeholders in path; return remaining args."""
    remaining = dict(args)
    path_params = re.findall(r"\{(\w+)\}", path)
    for param in path_params:
        value = remaining.pop(param, None)
        if value is not None:
            path = path.replace(f"{{{param}}}", str(value))
    return path, remaining


async def _execute_tool(server: McpServer, tool: McpTool, args: dict) -> str:
    resolved_path, remaining_args = _substitute_path(tool.path, args)
    url = (server.base_url or "").rstrip("/") + resolved_path
    method = tool.http_method.upper()
    headers = _build_auth_headers(server.auth_config)

    if method in ("GET", "DELETE", "HEAD"):
        query_params = remaining_args
        body = None
    else:
        query_params = {}
        body = remaining_args or None

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        response = await client.request(
            method, url, params=query_params, json=body, headers=headers
        )
        response.raise_for_status()
        try:
            return json.dumps(response.json(), indent=2)
        except Exception:
            return response.text


# ── MCP endpoint ──────────────────────────────────────────────────────────────

@router.post("/{slug}")
async def mcp_endpoint(slug: str, request: Request, db: AsyncSession = Depends(get_db)):
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            _jsonrpc_error(None, -32700, "Parse error: invalid JSON"), status_code=200
        )

    req_id = body.get("id")
    method = body.get("method", "")
    params = body.get("params", {}) or {}

    server = await _load_server(slug, db)
    if server is None:
        return JSONResponse(
            _jsonrpc_error(req_id, -32601, f"Dynamic server '{slug}' not found or disabled"),
            status_code=404,
        )

    # ── initialize ────────────────────────────────────────────────────────
    if method == "initialize":
        return JSONResponse(_jsonrpc_result(req_id, {
            "protocolVersion": MCP_VERSION,
            "capabilities": {"tools": {}},
            "serverInfo": {"name": server.name, "version": "1.0.0"},
        }))

    # ── notifications/initialized (no response required) ──────────────────
    if method == "notifications/initialized":
        return JSONResponse(status_code=204, content=None)

    # ── tools/list ────────────────────────────────────────────────────────
    if method == "tools/list":
        tools = [t for t in server.tools if t.enabled]
        return JSONResponse(_jsonrpc_result(req_id, {
            "tools": [
                {
                    "name": t.name,
                    "description": t.description or "",
                    "inputSchema": t.input_schema,
                }
                for t in tools
            ]
        }))

    # ── tools/call ────────────────────────────────────────────────────────
    if method == "tools/call":
        tool_name = params.get("name")
        args = params.get("arguments", {}) or {}

        tool = next((t for t in server.tools if t.name == tool_name and t.enabled), None)
        if tool is None:
            return JSONResponse(
                _jsonrpc_result(req_id, {
                    "content": [{"type": "text", "text": f"Tool '{tool_name}' not found or disabled"}],
                    "isError": True,
                })
            )

        try:
            text_result = await _execute_tool(server, tool, args)
        except httpx.HTTPStatusError as exc:
            text_result = f"HTTP {exc.response.status_code}: {exc.response.text[:500]}"
        except Exception as exc:
            text_result = f"Error calling tool: {exc}"

        return JSONResponse(_jsonrpc_result(req_id, {
            "content": [{"type": "text", "text": text_result}]
        }))

    return JSONResponse(
        _jsonrpc_error(req_id, -32601, f"Method not found: {method}"), status_code=200
    )


# ── GET endpoint for capability discovery (some MCP clients use GET first) ───

@router.get("/{slug}")
async def mcp_info(slug: str, db: AsyncSession = Depends(get_db)):
    server = await _load_server(slug, db)
    if server is None:
        return JSONResponse({"error": "Server not found"}, status_code=404)
    tool_count = sum(1 for t in server.tools if t.enabled)
    return JSONResponse({
        "name": server.name,
        "slug": slug,
        "protocolVersion": MCP_VERSION,
        "transport": "streamable_http",
        "tools": tool_count,
    })
