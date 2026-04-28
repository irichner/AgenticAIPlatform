"""
Observability seam — structured log every MCP tool call.

All call records go through emit_call_record(). Raw args and results are
never logged; only SHA-256 hashes are emitted so secrets don't appear in logs.

This single function is designed to be swapped out for OTel spans with minimal
changes to callers.
"""
from __future__ import annotations

import hashlib
import json
import logging
import time
from typing import Any

logger = logging.getLogger("mcp_gateway.calls")


def _hash(obj: Any) -> str:
    try:
        raw = json.dumps(obj, sort_keys=True, default=str).encode()
    except Exception:
        raw = str(obj).encode()
    return hashlib.sha256(raw).hexdigest()[:16]


def emit_call_record(
    *,
    org_id: str,
    run_id: str | None,
    registration_id: str,
    tool_name: str,
    credential_hash: str | None,
    args: Any,
    result: Any = None,
    error: str | None = None,
    latency_ms: float,
    cached: bool = False,
) -> None:
    record = {
        "event": "mcp_tool_call",
        "org_id": org_id,
        "run_id": run_id,
        "registration_id": registration_id,
        "tool_name": tool_name,
        "credential_hash": credential_hash,
        "args_hash": _hash(args),
        "result_hash": _hash(result) if result is not None else None,
        "error": error,
        "latency_ms": round(latency_ms, 2),
        "cached": cached,
    }
    if error:
        logger.error(json.dumps(record))
    else:
        logger.info(json.dumps(record))
