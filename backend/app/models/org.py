from __future__ import annotations
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, Boolean, DateTime, Text, func, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
import uuid
from app.models.base import Base


class Org(Base):
    __tablename__ = "orgs"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(63), unique=True, nullable=False)
    logo_url: Mapped[str | None] = mapped_column(Text(), nullable=True)
    sso_enforced: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    mcp_gateway_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("FALSE"))
    mcp_guardrail_prompt_additions: Mapped[str | None] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tenants: Mapped[list["OrgTenant"]] = relationship(
        "OrgTenant", back_populates="org", cascade="all, delete-orphan"
    )
    memberships: Mapped[list["OrgMembership"]] = relationship(
        "OrgMembership", back_populates="org", cascade="all, delete-orphan"
    )
    roles: Mapped[list["Role"]] = relationship(
        "Role", back_populates="org", cascade="all, delete-orphan",
        foreign_keys="Role.org_id",
    )
    sso_config: Mapped["OrgSsoConfig | None"] = relationship(
        "OrgSsoConfig", back_populates="org", uselist=False,
        cascade="all, delete-orphan",
    )
    email_domains: Mapped[list["OrgEmailDomain"]] = relationship(
        "OrgEmailDomain", back_populates="org", cascade="all, delete-orphan"
    )
