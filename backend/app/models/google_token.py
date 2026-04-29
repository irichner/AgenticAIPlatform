from __future__ import annotations
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, DateTime, Integer, ForeignKey, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
import uuid
from app.models.base import Base, TimestampMixin
from app.db.encrypted_type import EncryptedText


class GoogleOAuthToken(Base, TimestampMixin):
    __tablename__ = "google_oauth_tokens"
    __table_args__ = (
        UniqueConstraint("org_id", "user_id", name="uq_google_oauth_tokens_org_user"),
        {"schema": "lanara"},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lanara.orgs.id", ondelete="CASCADE"), nullable=True, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lanara.users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    access_token: Mapped[str | None] = mapped_column(EncryptedText, nullable=True)
    refresh_token: Mapped[str | None] = mapped_column(EncryptedText, nullable=True)
    token_expiry: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    user_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    scopes: Mapped[str | None] = mapped_column(Text, nullable=True)
    oauth_state: Mapped[str | None] = mapped_column(Text, nullable=True)
    poll_interval_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
