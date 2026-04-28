"""
MCP Gateway — tenant-aware proxy for external MCP servers.
Import MCPGateway from app.mcp_gateway.gateway at call sites to avoid
importing the mcp SDK at module load time.
"""
