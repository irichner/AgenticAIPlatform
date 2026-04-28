from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.mcp_gateway.models import McpRegistration


class MTLSAuth:
    def headers(self, reg: "McpRegistration") -> dict[str, str]:
        raise NotImplementedError("mTLS auth is not implemented in this release")

    def identity(self, reg: "McpRegistration") -> str:
        raise NotImplementedError("mTLS auth is not implemented in this release")

    def redact(self, reg: "McpRegistration") -> dict:
        raise NotImplementedError("mTLS auth is not implemented in this release")
