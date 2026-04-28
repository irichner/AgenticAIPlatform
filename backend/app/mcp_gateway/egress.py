"""
EgressGuard — enforce that outbound MCP calls only go to registered hostnames.

Extracts the hostname from each registration's mcp_url to build the allowlist.
Any call_tool to a URL not in that set is rejected before the TCP connection opens.
"""
from __future__ import annotations

import logging
from urllib.parse import urlparse

from fastapi import HTTPException, status

from app.mcp_gateway.models import McpRegistration

logger = logging.getLogger(__name__)


class EgressGuard:
    def __init__(self, registrations: list[McpRegistration]) -> None:
        self._allowed_hosts: set[str] = set()
        for reg in registrations:
            try:
                host = urlparse(reg.mcp_url).hostname or ""
                if host:
                    self._allowed_hosts.add(host.lower())
            except Exception:
                pass

    def check(self, url: str) -> None:
        try:
            host = (urlparse(url).hostname or "").lower()
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid URL: {url!r}",
            )
        if host not in self._allowed_hosts:
            logger.warning("EgressGuard blocked outbound call to host %r", host)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Outbound MCP call to host '{host}' is not on the allowlist",
            )
