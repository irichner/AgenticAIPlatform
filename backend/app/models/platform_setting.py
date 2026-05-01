from __future__ import annotations
from uuid import UUID, uuid4

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin
from app.db.encrypted_type import EncryptedText


class PlatformSetting(Base, TimestampMixin):
    __tablename__ = "platform_settings"
    __table_args__ = (
        UniqueConstraint("org_id", "key", name="uq_platform_settings_org_key"),
        {"schema": "lanara"},
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    org_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("lanara.orgs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    key: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[str | None] = mapped_column(EncryptedText, nullable=True)
    is_secret: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_by: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("lanara.users.id", ondelete="SET NULL"),
        nullable=True,
    )
