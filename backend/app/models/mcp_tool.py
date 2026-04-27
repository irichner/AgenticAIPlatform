from __future__ import annotations
from typing import TYPE_CHECKING
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, Text, Boolean, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
import uuid
from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.mcp_server import McpServer


class McpTool(Base, TimestampMixin):
    __tablename__ = "mcp_tools"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    server_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("mcp_servers.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    input_schema: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    http_method: Mapped[str] = mapped_column(String(16), nullable=False, server_default="GET")
    path: Mapped[str] = mapped_column(Text, nullable=False, server_default="/")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("TRUE"))

    server: Mapped["McpServer"] = relationship("McpServer", back_populates="tools")
