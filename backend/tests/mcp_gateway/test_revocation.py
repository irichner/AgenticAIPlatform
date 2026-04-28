"""
T12 — RevocationBus: publish emits to the correct Redis channel.
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest


@pytest.mark.asyncio
async def test_publish_revocation_targets_correct_channel():
    mock_redis = AsyncMock()
    mock_redis.publish = AsyncMock()

    with patch("app.mcp_gateway.revocation.get_redis", return_value=mock_redis):
        from app.mcp_gateway.revocation import publish_revocation

        await publish_revocation("reg-123", reason="credential_rotated")

    mock_redis.publish.assert_called_once()
    call_args = mock_redis.publish.call_args
    channel = call_args[0][0]
    payload = json.loads(call_args[0][1])

    assert channel == "mcp:revocation:reg-123"
    assert payload["registration_id"] == "reg-123"
    assert payload["reason"] == "credential_rotated"


@pytest.mark.asyncio
async def test_publish_revocation_different_regs_different_channels():
    mock_redis = AsyncMock()
    mock_redis.publish = AsyncMock()

    with patch("app.mcp_gateway.revocation.get_redis", return_value=mock_redis):
        from app.mcp_gateway.revocation import publish_revocation

        await publish_revocation("reg-A")
        await publish_revocation("reg-B")

    calls = mock_redis.publish.call_args_list
    channels = [c[0][0] for c in calls]
    assert "mcp:revocation:reg-A" in channels
    assert "mcp:revocation:reg-B" in channels
    assert channels[0] != channels[1]
