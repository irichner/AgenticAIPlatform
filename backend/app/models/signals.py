from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, ForeignKey, DateTime, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
from app.models.base import Base, TimestampMixin


class Signal(Base, TimestampMixin):
    """Raw inbound signals from connected integrations (Gmail, Slack, calendar, etc.).

    Staging table: signals arrive here as pending, get enriched into
    the activities table by the activity logger agent, then marked processed.
    Agents can query this table to see unprocessed or recent integration events.
    """
    __tablename__ = "signals"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lanara.orgs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source: Mapped[str] = mapped_column(String(50), nullable=False)   # gmail, slack, zoom, calendar, linkedin
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)  # email_received, meeting_ended, etc.
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="'{}'")
    status: Mapped[str] = mapped_column(String(30), nullable=False, server_default="'pending'")
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
