"""
RevocationBus — Redis pub/sub for credential invalidation events.

When a registration's auth_config changes or it is deleted, publish to
  mcp:revocation:{registration_id}

Any subscriber (e.g. a long-running agent session) can listen and abort
its current run rather than continuing with stale credentials.

The ManifestCache is also invalidated on publish so the next list_tools
call fetches fresh data.
"""
from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)


def _channel(registration_id: str) -> str:
    return f"mcp:revocation:{registration_id}"


async def publish_revocation(registration_id: str, reason: str = "credential_rotated") -> None:
    redis = get_redis()
    payload = json.dumps({"registration_id": registration_id, "reason": reason})
    await redis.publish(_channel(registration_id), payload)
    logger.info("Revocation published for registration %s (%s)", registration_id, reason)


async def subscribe_revocation(
    registration_id: str,
) -> AsyncGenerator[dict, None]:
    """Async generator that yields revocation events for a registration."""
    redis = get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe(_channel(registration_id))
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    yield json.loads(message["data"])
                except Exception:
                    pass
    finally:
        await pubsub.unsubscribe(_channel(registration_id))
        await pubsub.aclose()
