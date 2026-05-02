from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AgentToolAllowlistEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    agent_id: uuid.UUID
    mcp_server_id: uuid.UUID
    mcp_tool_id: uuid.UUID
    created_at: datetime


class AgentToolAllowlistSet(BaseModel):
    """Replace the full allowlist for an agent.
    Empty list = allow all tools (removes restriction)."""

    agent_id: uuid.UUID
    mcp_tool_ids: list[uuid.UUID]
