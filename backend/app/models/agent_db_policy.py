from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class AgentDbPolicy(Base, TimestampMixin):
    __tablename__ = "agent_db_policies"
    __table_args__ = (UniqueConstraint("agent_id", "table_name", name="uq_agent_db_policy"), {"schema": "lanara"})

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lanara.orgs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    agent_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lanara.agents.id", ondelete="CASCADE"), nullable=False, index=True
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    table_name: Mapped[str] = mapped_column(String(255), nullable=False)

    # ["select", "insert", "update", "delete"]
    allowed_operations: Mapped[list] = mapped_column(JSONB, nullable=False, server_default='["select"]')

    # null = all columns
    column_allowlist: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    column_blocklist: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    row_limit: Mapped[int] = mapped_column(Integer, nullable=False, server_default="100")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    agent = relationship("Agent", foreign_keys=[agent_id])
