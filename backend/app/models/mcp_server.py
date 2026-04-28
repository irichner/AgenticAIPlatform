from __future__ import annotations
from typing import TYPE_CHECKING
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, Text, Boolean, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
import uuid
from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.mcp_tool import McpTool


class McpServer(Base, TimestampMixin):
    __tablename__ = "mcp_servers"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("orgs.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    transport: Mapped[str] = mapped_column(String(50), nullable=False, server_default="streamable_http")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("TRUE"))

    runtime_mode: Mapped[str] = mapped_column(String(32), nullable=False, server_default="external")
    slug: Mapped[str | None] = mapped_column(String(128), nullable=True, unique=True)
    base_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    openapi_spec: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    auth_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    tools: Mapped[list["McpTool"]] = relationship(
        "McpTool", back_populates="server", cascade="all, delete-orphan", lazy="select"
    )
