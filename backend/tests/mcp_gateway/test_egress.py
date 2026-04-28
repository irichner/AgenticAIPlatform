"""
T6 — EgressGuard must block calls to unregistered hosts.
"""
import uuid

import pytest
from fastapi import HTTPException

from app.mcp_gateway.egress import EgressGuard
from tests.mcp_gateway.conftest import make_reg


def test_egress_allows_registered_host():
    reg = make_reg(mcp_url="https://mcp.example.com/mcp")
    guard = EgressGuard([reg])
    guard.check("https://mcp.example.com/mcp")  # no exception


def test_egress_blocks_unregistered_host():
    reg = make_reg(mcp_url="https://mcp.example.com/mcp")
    guard = EgressGuard([reg])
    with pytest.raises(HTTPException) as exc_info:
        guard.check("https://evil.attacker.com/mcp")
    assert exc_info.value.status_code == 403


def test_egress_allows_multiple_registered_hosts():
    reg1 = make_reg(mcp_url="https://service-a.internal/mcp")
    reg2 = make_reg(mcp_url="https://service-b.internal/mcp")
    guard = EgressGuard([reg1, reg2])
    guard.check("https://service-a.internal/mcp")
    guard.check("https://service-b.internal/mcp")


def test_egress_empty_registrations_blocks_all():
    guard = EgressGuard([])
    with pytest.raises(HTTPException):
        guard.check("https://any.host.com/mcp")


def test_egress_case_insensitive_hostname():
    reg = make_reg(mcp_url="https://MCP.EXAMPLE.COM/mcp")
    guard = EgressGuard([reg])
    guard.check("https://mcp.example.com/mcp")
