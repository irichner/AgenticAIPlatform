"""
ManifestCache — Redis-backed cache for MCP tools/list results.

Key format: mcp:manifest:{org_id}:{reg_id}:{credential_hash}
TTL: MCPGatewaySettings.manifest_cache_ttl_seconds (default 600)
"""
from __future__ import annotations

import json
import logging
from typing import Any

from app.core.redis_client import get_redis
from app.mcp_gateway.settings import settings

logger = logging.getLogger(__name__)

_KEY_PREFIX = "mcp:manifest"


def _cache_key(org_id: str, reg_id: str, credential_hash: str) -> str:
    return f"{_KEY_PREFIX}:{org_id}:{reg_id}:{credential_hash}"


async def get_manifest(org_id: str, reg_id: str, credential_hash: str) -> list[dict[str, Any]] | None:
    redis = get_redis()
    key = _cache_key(org_id, reg_id, credential_hash)
    raw = await redis.get(key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except Exception:
        logger.warning("Corrupt manifest cache entry for key %s", key)
        await redis.delete(key)
        return None


async def set_manifest(
    org_id: str,
    reg_id: str,
    credential_hash: str,
    tools: list[dict[str, Any]],
) -> None:
    redis = get_redis()
    key = _cache_key(org_id, reg_id, credential_hash)
    await redis.set(key, json.dumps(tools), ex=settings.manifest_cache_ttl_seconds)


async def invalidate_manifest(org_id: str, reg_id: str, credential_hash: str) -> None:
    redis = get_redis()
    key = _cache_key(org_id, reg_id, credential_hash)
    await redis.delete(key)
