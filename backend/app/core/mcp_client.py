from __future__ import annotations
import logging
import os
from langchain_mcp_adapters.client import MultiServerMCPClient

logger = logging.getLogger(__name__)

MCP_SPM_URL = os.getenv("MCP_SPM_URL", "http://localhost:8001/mcp")


async def get_mcp_tools(servers=None) -> list:
    """
    Returns LangChain tools from MCP server DB records.
    If servers is None, falls back to the hardcoded SPM server (used by executor/graph).
    Loads each server individually so one unreachable server never silences the rest.
    """
    if servers is None:
        configs = [("spm", MCP_SPM_URL, "streamable_http")]
    else:
        if not servers:
            return []
        configs = [(s.name, s.url, s.transport) for s in servers]

    all_tools: list = []
    for name, url, transport in configs:
        try:
            client = MultiServerMCPClient({name: {"url": url, "transport": transport}})
            tools = await client.get_tools()
            all_tools.extend(tools)
            logger.debug("Loaded %d tools from %s", len(tools), name)
        except Exception as exc:
            logger.warning("MCP tool loading failed for %r (%s): %s", name, url, exc)
    return all_tools
