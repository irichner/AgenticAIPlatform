from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, Float, ForeignKey, DateTime, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
from app.models.base import Base, TimestampMixin


class Contact(Base, TimestampMixin):
    __tablename__ = "contacts"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lanara.orgs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    account_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lanara.users.id", ondelete="SET NULL"), nullable=True
    )
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    seniority: Mapped[str | None] = mapped_column(String(50), nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_contacted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Profile enrichment
    department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    buying_role: Mapped[str | None] = mapped_column(String(100), nullable=True)
    lead_source: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # LLM-derived signal aggregates (updated by signal_enricher)
    sentiment_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    engagement_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_reply_sentiment: Mapped[str | None] = mapped_column(String(20), nullable=True)
    buying_signals: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    objections: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    competitor_mentions: Mapped[list | None] = mapped_column(JSONB, nullable=True)
