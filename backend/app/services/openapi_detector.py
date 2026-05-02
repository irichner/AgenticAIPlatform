"""Pure in-memory OpenAPI spec parser — no database session required.

Supports Swagger 2.0, OpenAPI 3.0.x, and OpenAPI 3.1.x.
The DB-backed importer (openapi_importer.py) delegates tool-generation logic here.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


# ── Constants ─────────────────────────────────────────────────────────────────

SKIP_METHODS = {"head", "options", "trace"}


# ── Helpers (mirrors openapi_importer.py — kept in sync manually) ─────────────

def _to_snake_case(s: str) -> str:
    s = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", s)
    s = re.sub(r"([a-z\d])([A-Z])", r"\1_\2", s)
    s = re.sub(r"[^a-z0-9]+", "_", s.lower())
    return s.strip("_") or "tool"


def _operation_tool_name(operation: dict, method: str, path: str) -> str:
    if "operationId" in operation:
        return _to_snake_case(operation["operationId"])[:255]
    clean = re.sub(r"[{}]", "", path)
    clean = re.sub(r"[^a-z0-9/]+", "_", clean.lower())
    segments = [s for s in clean.split("/") if s]
    return f"{method.lower()}_{'_'.join(segments)}"[:255] or "tool"


# ── Result type ───────────────────────────────────────────────────────────────

@dataclass
class ParsedTool:
    name: str
    description: str
    http_method: str
    path: str
    input_schema: dict
    # Maps parameter name → location string: "path", "query", "header", "cookie", "body"
    # "formData" (Swagger 2.0) is normalised to "body" on construction.
    param_locations: dict[str, str] = field(default_factory=dict)


# ── Detector ──────────────────────────────────────────────────────────────────

class OpenAPIDetector:
    """Parse an OpenAPI/Swagger spec dict into a list of ParsedTool objects.

    Does not touch the database; suitable for use in scripts and unit tests.
    """

    def parse_to_mcp_tools(self, spec: dict) -> list[ParsedTool]:
        version = spec.get("openapi", spec.get("swagger", ""))
        if not isinstance(version, str):
            version = str(version)

        if version.startswith("2"):
            return self._parse_swagger2(spec)
        if version.startswith("3"):
            return self._parse_openapi3(spec)

        raise ValueError(
            f"Unrecognised spec version: {version!r}. "
            "Expected 'swagger: \"2.x\"' or 'openapi: \"3.x.x\"'."
        )

    # ── OpenAPI 3.x ───────────────────────────────────────────────────────────

    def _parse_openapi3(self, spec: dict) -> list[ParsedTool]:
        tools: list[ParsedTool] = []
        for path, path_item in spec.get("paths", {}).items():
            if not isinstance(path_item, dict):
                continue
            for method, operation in path_item.items():
                if method.lower() in SKIP_METHODS or not isinstance(operation, dict):
                    continue
                schema, locs = self._schema_openapi3(operation, path_item)
                tools.append(ParsedTool(
                    name=_operation_tool_name(operation, method, path),
                    description=(
                        operation.get("summary")
                        or operation.get("description")
                        or f"{method.upper()} {path}"
                    ),
                    http_method=method.upper(),
                    path=path,
                    input_schema=schema,
                    param_locations=locs,
                ))
        return tools

    def _schema_openapi3(
        self, operation: dict, path_item: dict
    ) -> tuple[dict, dict[str, str]]:
        properties: dict[str, Any] = {}
        required: list[str] = []
        locs: dict[str, str] = {}

        param_map: dict[str, dict] = {}
        for p in path_item.get("parameters", []):
            if "$ref" not in p:
                param_map[p.get("name", "")] = p
        for p in operation.get("parameters", []):
            if "$ref" not in p:
                param_map[p.get("name", "")] = p

        for param in param_map.values():
            pname = param.get("name", "")
            if not pname:
                continue
            pschema: dict = dict(param.get("schema", {"type": "string"}))
            desc = param.get("description", "")
            if desc:
                pschema["description"] = desc
            properties[pname] = pschema
            locs[pname] = param.get("in", "query")
            if param.get("required", False):
                required.append(pname)

        request_body = operation.get("requestBody", {})
        if request_body:
            content = request_body.get("content", {})
            json_body = content.get("application/json", {})
            body_schema = json_body.get("schema", {})
            if body_schema.get("type") == "object":
                for bname, bschema in body_schema.get("properties", {}).items():
                    properties[bname] = bschema
                    locs[bname] = "body"
                required.extend(body_schema.get("required", []))
            elif body_schema:
                properties["body"] = body_schema
                locs["body"] = "body"
                if request_body.get("required", False):
                    required.append("body")

        schema: dict[str, Any] = {"type": "object", "properties": properties}
        if required:
            schema["required"] = list(dict.fromkeys(required))
        return schema, locs

    # ── Swagger 2.0 ───────────────────────────────────────────────────────────

    def _parse_swagger2(self, spec: dict) -> list[ParsedTool]:
        tools: list[ParsedTool] = []
        for path, path_item in spec.get("paths", {}).items():
            if not isinstance(path_item, dict):
                continue
            for method, operation in path_item.items():
                if method.lower() in SKIP_METHODS or not isinstance(operation, dict):
                    continue
                schema, locs = self._schema_swagger2(operation, path_item)
                tools.append(ParsedTool(
                    name=_operation_tool_name(operation, method, path),
                    description=(
                        operation.get("summary")
                        or operation.get("description")
                        or f"{method.upper()} {path}"
                    ),
                    http_method=method.upper(),
                    path=path,
                    input_schema=schema,
                    param_locations=locs,
                ))
        return tools

    def _schema_swagger2(
        self, operation: dict, path_item: dict
    ) -> tuple[dict, dict[str, str]]:
        properties: dict[str, Any] = {}
        required: list[str] = []
        locs: dict[str, str] = {}

        param_map: dict[str, dict] = {}
        for p in path_item.get("parameters", []):
            if "$ref" not in p:
                param_map[p.get("name", "")] = p
        for p in operation.get("parameters", []):
            if "$ref" not in p:
                param_map[p.get("name", "")] = p

        for param in param_map.values():
            pname = param.get("name", "")
            if not pname:
                continue
            in_val = param.get("in", "query")

            if in_val == "body":
                body_schema = param.get("schema", {})
                if body_schema.get("type") == "object":
                    for bname, bschema in body_schema.get("properties", {}).items():
                        properties[bname] = bschema
                        locs[bname] = "body"
                    required.extend(body_schema.get("required", []))
                elif body_schema:
                    properties["body"] = body_schema
                    locs["body"] = "body"
                    if param.get("required", False):
                        required.append("body")
            else:
                # path, query, header, formData → normalise formData to "body"
                pschema: dict = {"type": param.get("type", "string")}
                desc = param.get("description", "")
                if desc:
                    pschema["description"] = desc
                properties[pname] = pschema
                locs[pname] = "body" if in_val == "formData" else in_val
                if param.get("required", False):
                    required.append(pname)

        schema: dict[str, Any] = {"type": "object", "properties": properties}
        if required:
            schema["required"] = list(dict.fromkeys(required))
        return schema, locs


# ── Aggregation helper ────────────────────────────────────────────────────────

def compute_param_breakdown(tools: list[ParsedTool]) -> dict[str, int]:
    """Count parameter occurrences by location across all tools."""
    breakdown = {"path": 0, "query": 0, "header": 0, "cookie": 0, "body": 0}
    for tool in tools:
        for loc in tool.param_locations.values():
            if loc in breakdown:
                breakdown[loc] += 1
    return breakdown
