from __future__ import annotations
from typing import TYPE_CHECKING, Protocol, runtime_checkable

if TYPE_CHECKING:
    from app.mcp_gateway.models import McpRegistration


@runtime_checkable
class AuthHandler(Protocol):
    """Protocol every auth backend must satisfy."""

    def headers(self, reg: "McpRegistration") -> dict[str, str]:
        """Return HTTP headers to inject on every outbound MCP call."""
        ...

    def identity(self, reg: "McpRegistration") -> str:
        """Return a stable opaque string identifying the credential (for cache keys)."""
        ...

    def redact(self, reg: "McpRegistration") -> dict:
        """Return a copy of auth_config with secret values replaced by '***'."""
        ...


def get_auth_handler(auth_type: str) -> AuthHandler:
    from app.mcp_gateway.auth.api_key import ApiKeyAuth
    from app.mcp_gateway.auth.oauth2 import OAuth2Auth
    from app.mcp_gateway.auth.mtls import MTLSAuth

    handlers: dict[str, AuthHandler] = {
        "none": _NoAuth(),
        "api_key": ApiKeyAuth(),
        "oauth2": OAuth2Auth(),
        "mtls": MTLSAuth(),
    }
    if auth_type not in handlers:
        raise ValueError(f"Unknown auth_type: {auth_type!r}")
    return handlers[auth_type]


class _NoAuth:
    def headers(self, reg: "McpRegistration") -> dict[str, str]:
        return {}

    def identity(self, reg: "McpRegistration") -> str:
        return "none"

    def redact(self, reg: "McpRegistration") -> dict:
        return {}
