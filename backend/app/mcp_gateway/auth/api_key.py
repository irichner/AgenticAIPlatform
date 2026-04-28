from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.mcp_gateway.models import McpRegistration


class ApiKeyAuth:
    """Injects a single API key as an HTTP header."""

    def headers(self, reg: "McpRegistration") -> dict[str, str]:
        cfg = reg.auth_config or {}
        header = cfg.get("header", "Authorization")
        value = cfg.get("value", "")
        prefix = cfg.get("prefix", "")
        full_value = f"{prefix} {value}".strip() if prefix else value
        return {header: full_value}

    def identity(self, reg: "McpRegistration") -> str:
        return reg.credential_hash or ""

    def redact(self, reg: "McpRegistration") -> dict:
        cfg = dict(reg.auth_config or {})
        if "value" in cfg:
            cfg["value"] = "***"
        return cfg
