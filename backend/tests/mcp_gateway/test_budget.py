"""
T4 — BudgetEnforcer must atomically exhaust and reject calls.
"""
from __future__ import annotations

import time
import uuid
from unittest.mock import AsyncMock, patch, MagicMock

import pytest
import pytest_asyncio

from app.mcp_gateway.budget import (
    BudgetExhaustedError,
    BudgetExpiredError,
    _RESERVE_SCRIPT,
)


@pytest.mark.asyncio
async def test_reserve_call_raises_on_exhausted_budget():
    run_id = str(uuid.uuid4())

    mock_redis = AsyncMock()
    mock_redis.get.return_value = str(time.time())  # wall time OK
    mock_redis.eval = AsyncMock(return_value=-1)  # budget exhausted

    with patch("app.mcp_gateway.budget.get_redis", return_value=mock_redis):
        from app.mcp_gateway.budget import reserve_call

        with pytest.raises(BudgetExhaustedError):
            await reserve_call(run_id, max_wall_seconds=180)


@pytest.mark.asyncio
async def test_reserve_call_raises_on_wall_time_exceeded():
    run_id = str(uuid.uuid4())

    mock_redis = AsyncMock()
    old_time = time.time() - 300  # 5 minutes ago
    mock_redis.get.return_value = str(old_time)

    with patch("app.mcp_gateway.budget.get_redis", return_value=mock_redis):
        from app.mcp_gateway.budget import reserve_call

        with pytest.raises(BudgetExpiredError):
            await reserve_call(run_id, max_wall_seconds=60)


@pytest.mark.asyncio
async def test_reserve_call_returns_remaining_on_success():
    run_id = str(uuid.uuid4())

    mock_redis = AsyncMock()
    mock_redis.get.return_value = str(time.time())
    mock_redis.eval = AsyncMock(return_value=29)  # 29 remaining

    with patch("app.mcp_gateway.budget.get_redis", return_value=mock_redis):
        from app.mcp_gateway.budget import reserve_call

        remaining = await reserve_call(run_id, max_wall_seconds=180)
        assert remaining == 29


@pytest.mark.asyncio
async def test_reserve_call_raises_when_budget_not_initialized():
    run_id = str(uuid.uuid4())

    mock_redis = AsyncMock()
    mock_redis.get.return_value = None  # no wall time
    mock_redis.eval = AsyncMock(return_value=-2)  # key missing

    with patch("app.mcp_gateway.budget.get_redis", return_value=mock_redis):
        from app.mcp_gateway.budget import reserve_call

        with pytest.raises(BudgetExhaustedError):
            await reserve_call(run_id, max_wall_seconds=180)
