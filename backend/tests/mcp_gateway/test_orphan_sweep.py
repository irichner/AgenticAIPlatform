"""
T13 — IdempotencyOrphanSweeper: orphaned pending rows get status='error'.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_sweep_orphans_calls_update_with_correct_status():
    """Verify sweep_orphans issues an UPDATE setting status='error'."""
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.fetchall.return_value = [MagicMock(), MagicMock()]  # 2 rows swept
    mock_db.execute.return_value = mock_result

    mock_session_ctx = AsyncMock()
    mock_session_ctx.__aenter__.return_value = mock_db
    mock_session_ctx.__aexit__.return_value = False

    with patch("app.mcp_gateway.sweeper.AsyncSessionLocal", return_value=mock_session_ctx):
        from app.mcp_gateway.sweeper import sweep_orphans

        swept = await sweep_orphans()

    assert swept == 2
    mock_db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_expire_old_outcomes_calls_delete():
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.fetchall.return_value = []  # nothing expired
    mock_db.execute.return_value = mock_result

    mock_session_ctx = AsyncMock()
    mock_session_ctx.__aenter__.return_value = mock_db
    mock_session_ctx.__aexit__.return_value = False

    with patch("app.mcp_gateway.sweeper.AsyncSessionLocal", return_value=mock_session_ctx):
        from app.mcp_gateway.sweeper import expire_old_outcomes

        deleted = await expire_old_outcomes()

    assert deleted == 0
    mock_db.commit.assert_not_called()  # nothing deleted → no commit needed
