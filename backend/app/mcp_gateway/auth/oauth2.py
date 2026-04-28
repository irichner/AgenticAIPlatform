from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.mcp_gateway.models import McpRegistration


class OAuth2Auth:
    def headers(self, reg: "McpRegistration") -> dict[str, str]:
        raise NotImplementedError("OAuth2 auth is not implemented in this release")

    def identity(self, reg: "McpRegistration") -> str:
        raise NotImplementedError("OAuth2 auth is not implemented in this release")

    def redact(self, reg: "McpRegistration") -> dict:
        raise NotImplementedError("OAuth2 auth is not implemented in this release")
