from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class AgentToolAllowlist(Base, TimestampMixin):
    """No rows = all MCP tools allowed for this agent.
    Rows present = only listed tools are allowed."""

    __tablename__ = "agent_tool_allowlist"
    __table_args__ = (
        UniqueConstraint("agent_id", "mcp_tool_id", name="uq_agent_tool_allowlist"),
        {"schema": "lanara"},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    agent_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("lanara.agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    mcp_server_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("lanara.mcp_servers.id", ondelete="CASCADE"),
        nullable=False,
    )
    mcp_tool_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("lanara.mcp_tools.id", ondelete="CASCADE"),
        nullable=False,
    )
