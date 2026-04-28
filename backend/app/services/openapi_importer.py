"""Parse an OpenAPI 3.x spec and populate McpServer + McpTool records."""
from __future__ import annotations
import re
import os
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.mcp_server import McpServer
from app.models.mcp_tool import McpTool


# ── Helpers ──────────────────────────────────────────────────────────────────

def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "server"


def to_snake_case(s: str) -> str:
    s = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", s)
    s = re.sub(r"([a-z\d])([A-Z])", r"\1_\2", s)
    s = re.sub(r"[^a-z0-9]+", "_", s.lower())
    return s.strip("_") or "tool"


def operation_tool_name(operation: dict, method: str, path: str) -> str:
    if "operationId" in operation:
        return to_snake_case(operation["operationId"])[:255]
    clean = re.sub(r"[{}]", "", path)
    clean = re.sub(r"[^a-z0-9/]+", "_", clean.lower())
    segments = [s for s in clean.split("/") if s]
    return f"{method.lower()}_{'_'.join(segments)}"[:255] or "tool"


def build_input_schema(operation: dict, path_item: dict) -> dict:
    properties: dict[str, Any] = {}
    required: list[str] = []

    # Parameters from path item level + operation level (operation wins on dup)
    param_map: dict[str, dict] = {}
    for param in path_item.get("parameters", []):
        if "$ref" not in param:
            param_map[param.get("name", "")] = param
    for param in operation.get("parameters", []):
        if "$ref" not in param:
            param_map[param.get("name", "")] = param

    for param in param_map.values():
        pname = param.get("name", "")
        if not pname:
            continue
        pschema: dict = dict(param.get("schema", {"type": "string"}))
        desc = param.get("description", "")
        if desc:
            pschema["description"] = desc
        properties[pname] = pschema
        if param.get("required", False):
            required.append(pname)

    # Request body: merge application/json schema properties
    request_body = operation.get("requestBody", {})
    if request_body:
        content = request_body.get("content", {})
        json_body = content.get("application/json", {})
        body_schema = json_body.get("schema", {})
        if body_schema.get("type") == "object":
            for pname, pschema in body_schema.get("properties", {}).items():
                properties[pname] = pschema
            body_req = body_schema.get("required", [])
            required.extend(body_req)
        elif body_schema:
            properties["body"] = body_schema
            if request_body.get("required", False):
                required.append("body")

    schema: dict[str, Any] = {"type": "object", "properties": properties}
    if required:
        schema["required"] = list(dict.fromkeys(required))  # dedupe, preserve order
    return schema


# ── Spec fetcher ─────────────────────────────────────────────────────────────

async def fetch_spec(spec_url: str) -> dict:
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        resp = await client.get(spec_url, headers={"Accept": "application/json, application/yaml, text/yaml, */*"})
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "")
        text = resp.text
        if "yaml" in content_type or spec_url.endswith((".yaml", ".yml")):
            try:
                import yaml  # type: ignore
                return yaml.safe_load(text)
            except ImportError:
                raise ValueError("YAML spec detected but pyyaml is not installed. Install pyyaml or paste JSON instead.")
        return resp.json()


# ── Main importer ─────────────────────────────────────────────────────────────

SKIP_METHODS = {"head", "options", "trace"}


async def import_openapi(
    *,
    db: AsyncSession,
    name: str,
    base_url: str,
    spec_url: str | None = None,
    spec_json: dict | None = None,
    description: str | None = None,
    auth_config: dict | None = None,
    slug: str | None = None,
    org_id=None,
) -> McpServer:
    if spec_json:
        spec = spec_json
    elif spec_url:
        spec = await fetch_spec(spec_url)
    else:
        raise ValueError("Provide spec_url or spec_json")

    openapi_version = spec.get("openapi", spec.get("swagger", ""))
    if not openapi_version.startswith("3"):
        raise ValueError(f"Only OpenAPI 3.x is supported (got '{openapi_version}'). Convert Swagger 2.x first.")

    # Compute slug — ensure uniqueness
    base_slug = slug or slugify(name)
    candidate = base_slug
    suffix = 0
    while True:
        existing = await db.execute(select(McpServer).where(McpServer.slug == candidate))
        if existing.scalar_one_or_none() is None:
            break
        suffix += 1
        candidate = f"{base_slug}-{suffix}"
    final_slug = candidate

    backend_url = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
    mcp_url = f"{backend_url}/api/mcp/dynamic/{final_slug}"

    server = McpServer(
        org_id=org_id,
        name=name,
        url=mcp_url,
        transport="streamable_http",
        description=description or spec.get("info", {}).get("description"),
        enabled=True,
        runtime_mode="dynamic",
        slug=final_slug,
        base_url=base_url.rstrip("/"),
        openapi_spec=spec,
        auth_config=auth_config,
    )
    db.add(server)
    await db.flush()  # get server.id

    paths: dict = spec.get("paths", {})
    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue
        for method, operation in path_item.items():
            if method.lower() in SKIP_METHODS or not isinstance(operation, dict):
                continue
            tool_name = operation_tool_name(operation, method, path)
            tool_desc = operation.get("summary") or operation.get("description") or f"{method.upper()} {path}"
            input_schema = build_input_schema(operation, path_item)

            tool = McpTool(
                server_id=server.id,
                name=tool_name,
                description=tool_desc,
                input_schema=input_schema,
                http_method=method.upper(),
                path=path,
                enabled=True,
            )
            db.add(tool)

    await db.commit()
    await db.refresh(server)
    # Load tools relationship
    await db.refresh(server, ["tools"])
    return server
