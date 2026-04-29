from __future__ import annotations
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PGUUID
import uuid
from app.models.base import Base


class OrgSsoConfig(Base):
    __tablename__ = "org_sso_configs"
    __table_args__ = {"schema": "lanara"}

    org_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("lanara.orgs.id", ondelete="CASCADE"),
        primary_key=True,
    )
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    issuer_url: Mapped[str] = mapped_column(String(512), nullable=False)
    client_id: Mapped[str] = mapped_column(String(256), nullable=False)
    client_secret_ref: Mapped[str] = mapped_column(String(512), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    org: Mapped["Org"] = relationship("Org", back_populates="sso_config")


class OrgEmailDomain(Base):
    __tablename__ = "org_email_domains"
    __table_args__ = {"schema": "lanara"}

    domain: Mapped[str] = mapped_column(String(253), primary_key=True)
    org_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("lanara.orgs.id", ondelete="CASCADE"),
        nullable=False,
    )
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    verify_token: Mapped[str | None] = mapped_column(String(128), nullable=True)

    org: Mapped["Org"] = relationship("Org", back_populates="email_domains")
