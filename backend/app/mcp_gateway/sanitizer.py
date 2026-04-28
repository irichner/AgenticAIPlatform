"""
OutputSanitizer — validate, cap size, cap recursion depth, wrap in delimiter.

Any result exceeding limits is truncated, not rejected, so the agent can
still observe partial results.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from app.mcp_gateway.settings import settings

logger = logging.getLogger(__name__)

_DELIMITER_OPEN = "```tool_result\n"
_DELIMITER_CLOSE = "\n```"
_TRUNCATED_SENTINEL = "\n[TRUNCATED]"


def sanitize(result: Any) -> str:
    """
    Accepts raw MCP tool result, returns a sanitized string wrapped in delimiters.
    """
    capped = _cap_depth(result, 0)
    try:
        serialized = json.dumps(capped, ensure_ascii=False)
    except (TypeError, ValueError):
        serialized = str(capped)

    max_bytes = settings.sanitizer_max_result_bytes
    encoded = serialized.encode("utf-8")
    if len(encoded) > max_bytes:
        truncated = encoded[:max_bytes].decode("utf-8", errors="replace")
        serialized = truncated + _TRUNCATED_SENTINEL

    return _DELIMITER_OPEN + serialized + _DELIMITER_CLOSE


def _cap_depth(obj: Any, depth: int) -> Any:
    max_depth = settings.sanitizer_max_recursion_depth
    if depth >= max_depth:
        return "[MAX_DEPTH_EXCEEDED]"
    if isinstance(obj, dict):
        return {k: _cap_depth(v, depth + 1) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_cap_depth(item, depth + 1) for item in obj]
    return obj
