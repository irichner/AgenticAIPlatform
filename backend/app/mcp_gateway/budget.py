"""
BudgetEnforcer — Redis Lua atomic budget management.

Keys:
  mcp:budget:{run_id}:calls     — remaining tool-call slots
  mcp:budget:{run_id}:wall      — wall-clock start epoch (float)

All mutations go through a single Lua script so reserve + decrement is atomic.
"""
from __future__ import annotations

import time
import logging
from typing import Any

from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

# Lua: atomically check and decrement call counter
# Returns: remaining count after decrement, or -1 if budget exhausted
_RESERVE_SCRIPT = """
local key = KEYS[1]
local current = redis.call('GET', key)
if current == false then
    return -2
end
local n = tonumber(current)
if n <= 0 then
    return -1
end
return redis.call('DECRBY', key, 1)
"""


class BudgetExhaustedError(Exception):
    pass


class BudgetExpiredError(Exception):
    pass


async def init_budget(run_id: str, max_calls: int, max_wall_seconds: int, ttl_seconds: int = 3600) -> None:
    redis = get_redis()
    calls_key = f"mcp:budget:{run_id}:calls"
    wall_key = f"mcp:budget:{run_id}:wall"
    await redis.set(calls_key, max_calls, ex=ttl_seconds)
    await redis.set(wall_key, time.time(), ex=ttl_seconds)


async def reserve_call(run_id: str, max_wall_seconds: int) -> int:
    """
    Atomically consume one call slot.
    Returns remaining slots.
    Raises BudgetExhaustedError or BudgetExpiredError.
    """
    redis = get_redis()
    wall_key = f"mcp:budget:{run_id}:wall"
    start_raw = await redis.get(wall_key)
    if start_raw is not None:
        elapsed = time.time() - float(start_raw)
        if elapsed > max_wall_seconds:
            raise BudgetExpiredError(
                f"Wall-clock budget exceeded ({elapsed:.1f}s > {max_wall_seconds}s) for run {run_id}"
            )

    calls_key = f"mcp:budget:{run_id}:calls"
    result = await redis.eval(_RESERVE_SCRIPT, 1, calls_key)
    remaining = int(result)
    if remaining == -2:
        # Key missing — budget not initialized; treat as exhausted
        raise BudgetExhaustedError(f"Budget not initialized for run {run_id}")
    if remaining < 0:
        raise BudgetExhaustedError(f"Tool-call budget exhausted for run {run_id}")
    return remaining


async def release_budget(run_id: str) -> None:
    redis = get_redis()
    await redis.delete(f"mcp:budget:{run_id}:calls", f"mcp:budget:{run_id}:wall")


async def get_remaining(run_id: str) -> int | None:
    redis = get_redis()
    raw = await redis.get(f"mcp:budget:{run_id}:calls")
    return int(raw) if raw is not None else None
