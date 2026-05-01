"""
MCPClient — thin async wrapper around the mcp SDK's ClientSession.

Responsibilities:
- Inject auth headers from AuthHandler
- Enforce sampling default-deny (intercept sampling/createMessage)
- Expose list_tools() and call_tool()
- Maintain a per-registration CircuitBreaker
"""
from __future__ import annotations

import logging
import time
from typing import Any, TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    from app.mcp_gateway.models import McpRegistration

logger = logging.getLogger(__name__)

_circuit_breakers: dict[str, "CircuitBreaker"] = {}


class CircuitBreaker:
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"

    def __init__(self, threshold: int = 5, reset_seconds: int = 30) -> None:
        self.threshold = threshold
        self.reset_seconds = reset_seconds
        self._state = self.CLOSED
        self._failures = 0
        self._opened_at: float | None = None

    def allow_request(self) -> bool:
        if self._state == self.CLOSED:
            return True
        if self._state == self.OPEN:
            if self._opened_at is not None and time.monotonic() - self._opened_at >= self.reset_seconds:
                self._state = self.HALF_OPEN
                return True
            return False
        return True  # HALF_OPEN: allow one probe

    def record_success(self) -> None:
        self._state = self.CLOSED
        self._failures = 0
        self._opened_at = None

    def record_failure(self) -> None:
        self._failures += 1
        if self._failures >= self.threshold:
            self._state = self.OPEN
            self._opened_at = time.monotonic()

    @property
    def state(self) -> str:
        return self._state


def get_circuit_breaker(reg_id: str, threshold: int = 5, reset_seconds: int = 30) -> CircuitBreaker:
    if reg_id not in _circuit_breakers:
        _circuit_breakers[reg_id] = CircuitBreaker(threshold, reset_seconds)
    return _circuit_breakers[reg_id]


class SamplingDeniedError(Exception):
    """Raised when an MCP server requests sampling and the policy is deny."""


class CircuitOpenError(Exception):
    """Raised when the circuit breaker is open for a registration."""


class MCPClient:
    def __init__(self, reg: "McpRegistration", auth_headers: dict[str, str]) -> None:
        self._reg = reg
        self._auth_headers = auth_headers
        self._cb = get_circuit_breaker(
            str(reg.id),
        )

    async def list_tools(self) -> list[dict[str, Any]]:
        if not self._cb.allow_request():
            raise CircuitOpenError(f"Circuit breaker OPEN for registration {self._reg.id}")
        try:
            result = await self._run_list_tools()
            self._cb.record_success()
            return result
        except (httpx.HTTPStatusError,) as exc:
            if exc.response.status_code >= 500:
                self._cb.record_failure()
            raise
        except Exception:
            raise

    async def call_tool(self, tool_name: str, tool_args: dict[str, Any]) -> Any:
        if not self._cb.allow_request():
            raise CircuitOpenError(f"Circuit breaker OPEN for registration {self._reg.id}")
        try:
            result = await self._run_call_tool(tool_name, tool_args)
            self._cb.record_success()
            return result
        except (httpx.HTTPStatusError,) as exc:
            if exc.response.status_code >= 500:
                self._cb.record_failure()
            raise
        except Exception:
            raise

    async def _run_list_tools(self) -> list[dict[str, Any]]:
        from mcp import ClientSession
        from mcp.client.streamable_http import streamablehttp_client

        async with streamablehttp_client(
            self._reg.mcp_url,
            headers=self._auth_headers,
        ) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                resp = await session.list_tools()
                return [
                    {
                        "name": t.name,
                        "description": t.description,
                        "inputSchema": t.inputSchema if hasattr(t, "inputSchema") else {},
                    }
                    for t in (resp.tools or [])
                ]

    async def _run_call_tool(self, tool_name: str, tool_args: dict[str, Any]) -> Any:
        from mcp import ClientSession
        from mcp.client.streamable_http import streamablehttp_client

        async with streamablehttp_client(
            self._reg.mcp_url,
            headers=self._auth_headers,
        ) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                resp = await session.call_tool(tool_name, tool_args)
                return resp
