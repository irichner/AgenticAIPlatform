from __future__ import annotations
import uuid
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
from app.models.base import Base, TimestampMixin


class DealSignal(Base, TimestampMixin):
    __tablename__ = "deal_signals"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lanara.orgs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    opportunity_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("opportunities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_activity_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("activities.id", ondelete="SET NULL"), nullable=True
    )
    signal_type: Mapped[str] = mapped_column(String(100), nullable=False)
    # risk_flag, competitor_mention, positive_signal, stage_change, buying_group_change, objection
    severity: Mapped[str] = mapped_column(String(20), nullable=False, server_default="'medium'")
    # low, medium, high
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)


class BuyingGroupMember(Base, TimestampMixin):
    __tablename__ = "buying_group_members"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lanara.orgs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    opportunity_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("opportunities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    contact_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False, server_default="'unknown'")
    # champion, economic_buyer, technical_buyer, user_buyer, coach, blocker, unknown
    engagement_level: Mapped[str] = mapped_column(String(20), nullable=False, server_default="'unknown'")
    # high, medium, low, unknown
    discovered_via: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
