from __future__ import annotations
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Integer, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
import uuid
from app.models.base import Base


class OrgMembership(Base):
    __tablename__ = "org_memberships"
    __table_args__ = {"schema": "lanara"}

    org_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("lanara.orgs.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("lanara.users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lanara.roles.id"), nullable=False
    )
    # Per-user execution rate limit overrides (NULL = inherit org/env defaults)
    agent_runs_per_minute: Mapped[int | None] = mapped_column(Integer, nullable=True)
    agent_runs_per_hour: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    org: Mapped["Org"] = relationship("Org", back_populates="memberships")
    user: Mapped["User"] = relationship("User")
    role: Mapped["Role"] = relationship("Role")


class TenantMembership(Base):
    __tablename__ = "tenant_memberships"
    __table_args__ = {"schema": "lanara"}

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("lanara.org_tenants.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("lanara.users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lanara.roles.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tenant: Mapped["OrgTenant"] = relationship("OrgTenant", back_populates="memberships")
    user: Mapped["User"] = relationship("User")
    role: Mapped["Role"] = relationship("Role")
