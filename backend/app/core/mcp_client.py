from __future__ import annotations
import logging
from langchain_mcp_adapters.client import MultiServerMCPClient

logger = logging.getLogger(__name__)


async def get_mcp_tools(servers=None) -> list:
    """
    Returns LangChain tools from MCP server DB records.
    Loads each server individually so one unreachable server never silences the rest.
    """
    if not servers:
        return []

    all_tools: list = []
    for s in servers:
        try:
            client = MultiServerMCPClient({s.name: {"url": s.url, "transport": s.transport}})
            tools = await client.get_tools()
            all_tools.extend(tools)
            logger.debug("Loaded %d tools from %s", len(tools), s.name)
        except Exception as exc:
            logger.warning("MCP tool loading failed for %r (%s): %s", s.name, s.url, exc)
    return all_tools
