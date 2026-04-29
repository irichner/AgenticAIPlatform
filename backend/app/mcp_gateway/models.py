from __future__ import annotations
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import String, Text, Boolean, Integer, DateTime, ForeignKey, func, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    pass


class McpRegistration(Base):
    __tablename__ = "mcp_registrations"
    __table_args__ = {"schema": "lanara"}

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lanara.orgs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    mcp_url: Mapped[str] = mapped_column(Text, nullable=False)
    transport: Mapped[str] = mapped_column(String(50), nullable=False, server_default="streamable_http")
    auth_type: Mapped[str] = mapped_column(String(50), nullable=False, server_default="none")
    auth_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    credential_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sampling_policy: Mapped[str] = mapped_column(String(50), nullable=False, server_default="deny")
    max_tool_calls_per_run: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("30"))
    max_wall_time_seconds: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("180"))
    guardrail_prompt_additions: Mapped[str | None] = mapped_column(Text, nullable=True)
    multi_tenant_claim: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("FALSE"))
    health_status: Mapped[str] = mapped_column(String(50), nullable=False, server_default="unknown")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("TRUE"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tool_permissions: Mapped[list["McpToolPermission"]] = relationship(
        "McpToolPermission", back_populates="registration", cascade="all, delete-orphan"
    )


class McpToolPermission(Base):
    __tablename__ = "mcp_tool_permissions"
    __table_args__ = {"schema": "lanara"}

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    registration_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lanara.mcp_registrations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tool_name: Mapped[str] = mapped_column(String(255), nullable=False)
    allowed_roles: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    allowed_user_ids: Mapped[list[uuid.UUID] | None] = mapped_column(ARRAY(PGUUID(as_uuid=True)), nullable=True)
    allowed_org_tenant_ids: Mapped[list[uuid.UUID] | None] = mapped_column(ARRAY(PGUUID(as_uuid=True)), nullable=True)
    requires_idempotency_key: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("FALSE"))
    max_calls_per_hour: Mapped[int | None] = mapped_column(Integer, nullable=True)

    registration: Mapped["McpRegistration"] = relationship("McpRegistration", back_populates="tool_permissions")


class McpIdempotencyOutcome(Base):
    __tablename__ = "mcp_idempotency_outcomes"
    __table_args__ = {"schema": "lanara"}

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lanara.orgs.id", ondelete="CASCADE"), nullable=False
    )
    registration_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lanara.mcp_registrations.id", ondelete="CASCADE"), nullable=False
    )
    tool_name: Mapped[str] = mapped_column(String(255), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(512), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, server_default="pending")
    result_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class McpRunSnapshot(Base):
    __tablename__ = "mcp_run_snapshots"
    __table_args__ = {"schema": "lanara"}

    run_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    org_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lanara.orgs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    snapshot_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
