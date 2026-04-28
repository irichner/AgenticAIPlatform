from __future__ import annotations
import os


class MCPGatewaySettings:
    manifest_cache_ttl_seconds: int = int(os.getenv("MCP_MANIFEST_CACHE_TTL", "600"))
    default_max_tool_calls_per_run: int = int(os.getenv("MCP_MAX_TOOL_CALLS", "30"))
    default_max_wall_time_seconds: int = int(os.getenv("MCP_MAX_WALL_TIME", "180"))
    idempotency_ttl_hours: int = int(os.getenv("MCP_IDEMPOTENCY_TTL_HOURS", "24"))
    idempotency_orphan_threshold_seconds: int = int(os.getenv("MCP_ORPHAN_THRESHOLD_SECONDS", "300"))
    idempotency_orphan_ttl_hours: int = int(os.getenv("MCP_ORPHAN_TTL_HOURS", "1"))
    sanitizer_max_result_bytes: int = int(os.getenv("MCP_SANITIZER_MAX_BYTES", str(64 * 1024)))
    sanitizer_max_recursion_depth: int = int(os.getenv("MCP_SANITIZER_MAX_DEPTH", "16"))
    health_check_interval_seconds: int = int(os.getenv("MCP_HEALTH_CHECK_INTERVAL", "60"))
    circuit_breaker_threshold: int = int(os.getenv("MCP_CB_THRESHOLD", "5"))
    circuit_breaker_reset_seconds: int = int(os.getenv("MCP_CB_RESET_SECONDS", "30"))


settings = MCPGatewaySettings()
