"""Generate a downloadable Python MCP project from a dynamic registry server."""
from __future__ import annotations
import io
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.models.mcp_server import McpServer
from app.models.mcp_tool import McpTool

_TEMPLATES_DIR = Path(__file__).parent.parent / "templates" / "codegen"


def _jinja_env() -> Environment:
    env = Environment(
        loader=FileSystemLoader(str(_TEMPLATES_DIR)),
        autoescape=select_autoescape(enabled_extensions=()),
        keep_trailing_newline=True,
    )
    import json as _json
    env.filters["tojson"] = lambda v: _json.dumps(v)
    return env


# ── Type mapping ──────────────────────────────────────────────────────────────

_OPENAPI_TO_PY: dict[str, str] = {
    "string": "str",
    "integer": "int",
    "number": "float",
    "boolean": "bool",
    "array": "list",
    "object": "dict",
}


def _py_type(schema: dict) -> str:
    return _OPENAPI_TO_PY.get(schema.get("type", "string"), "str")


def _example_value(schema: dict, required: bool) -> str:
    t = schema.get("type", "string")
    if not required:
        return "None"
    if t == "string":
        example = schema.get("example", schema.get("enum", [None])[0])
        return repr(str(example)) if example else '"value"'
    if t == "integer":
        return str(schema.get("example", 1))
    if t == "number":
        return str(schema.get("example", 1.0))
    if t == "boolean":
        return "True"
    return "None"


def _to_pascal(s: str) -> str:
    return "".join(w.capitalize() for w in re.split(r"[^a-zA-Z0-9]+", s) if w)


def _module_name(tool_name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", tool_name.lower()).strip("_")


# ── Tool context builder ──────────────────────────────────────────────────────

def _build_tool_ctx(tool: McpTool) -> dict[str, Any]:
    schema = tool.input_schema or {}
    properties: dict[str, dict] = schema.get("properties", {})
    required_set: set[str] = set(schema.get("required", []))

    params = []
    for pname, pschema in properties.items():
        req = pname in required_set
        params.append({
            "name": pname,
            "py_type": _py_type(pschema),
            "required": req,
            "example": _example_value(pschema, req),
        })

    module = _module_name(tool.name)
    class_name = _to_pascal(tool.name)
    return {
        "name": tool.name,
        "module": module,
        "class_name": class_name,
        "var_name": module,
        "description": tool.description or tool.name,
        "http_method": tool.http_method,
        "path": tool.path,
        "params": params,
    }


# ── Auth context ──────────────────────────────────────────────────────────────

def _auth_ctx(auth_config: dict | None) -> dict[str, str]:
    if not auth_config:
        return {"auth_type": "none", "auth_header": ""}
    t = auth_config.get("type", "none")
    return {
        "auth_type": t,
        "auth_header": auth_config.get("header", "X-API-Key"),
    }


# ── Main generator ────────────────────────────────────────────────────────────

def generate_project_zip(server: McpServer) -> bytes:
    """Render all Jinja2 templates and return a zip archive as bytes."""
    env = _jinja_env()
    enabled_tools = [t for t in server.tools if t.enabled]
    tool_ctxs = [_build_tool_ctx(t) for t in enabled_tools]
    auth = _auth_ctx(server.auth_config)
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    project_dir = f"mcp-{server.slug}"

    global_ctx = {
        "name": server.name,
        "slug": server.slug or "server",
        "description": server.description or "",
        "base_url": server.base_url or "",
        "tools": tool_ctxs,
        "generated_at": generated_at,
        **auth,
    }

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:

        def add(path: str, content: str) -> None:
            zf.writestr(f"{project_dir}/{path}", content.encode("utf-8"))

        # Top-level project files
        add("pyproject.toml", env.get_template("pyproject.toml.j2").render(**global_ctx))
        add(".env.example",   env.get_template("env.example.j2").render(**global_ctx))
        add("Dockerfile",     env.get_template("Dockerfile.j2").render(**global_ctx))
        add("docker-compose.yml", env.get_template("docker_compose.yml.j2").render(**global_ctx))

        # src/__init__.py
        add("src/__init__.py", "")
        add("src/_generated/__init__.py", "")
        add("src/_generated/tools/__init__.py", "")
        add("src/tools/__init__.py", "")
        add("tests/__init__.py", "")

        # src/client.py
        add("src/client.py", env.get_template("client.py.j2").render(**global_ctx))

        # src/server.py
        add("src/server.py", env.get_template("server.py.j2").render(**global_ctx))

        # Generated base tools + user-owned overrides
        tool_tmpl   = env.get_template("tool.py.j2")
        over_tmpl   = env.get_template("tool_override.py.j2")
        for tctx in tool_ctxs:
            add(f"src/_generated/tools/{tctx['module']}.py", tool_tmpl.render(tool=tctx, **global_ctx))
            add(f"src/tools/{tctx['module']}.py",            over_tmpl.render(tool=tctx, **global_ctx))

        # Tests
        add("tests/test_tools.py", env.get_template("test_tools.py.j2").render(**global_ctx))

    buf.seek(0)
    return buf.read()
