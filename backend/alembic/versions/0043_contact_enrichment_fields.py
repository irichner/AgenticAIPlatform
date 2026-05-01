"""Add enrichment columns to contacts and activities

Revision ID: 0043
Revises: 0042
Create Date: 2026-04-30
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0043"
down_revision: Union[str, None] = "0042"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # contacts — profile enrichment fields
    op.add_column("contacts", sa.Column("department", sa.String(100), nullable=True))
    op.add_column("contacts", sa.Column("location", sa.String(255), nullable=True))
    op.add_column("contacts", sa.Column("buying_role", sa.String(100), nullable=True))
    op.add_column("contacts", sa.Column("lead_source", sa.String(100), nullable=True))
    op.add_column("contacts", sa.Column("notes", sa.Text, nullable=True))
    op.add_column("contacts", sa.Column("timezone", sa.String(100), nullable=True))

    # contacts — LLM-derived signal aggregates
    op.add_column("contacts", sa.Column("sentiment_score", sa.Float, nullable=True))
    op.add_column("contacts", sa.Column("engagement_score", sa.Float, nullable=True))
    op.add_column("contacts", sa.Column("last_reply_sentiment", sa.String(20), nullable=True))
    op.add_column("contacts", sa.Column("buying_signals", JSONB, nullable=True))
    op.add_column("contacts", sa.Column("objections", JSONB, nullable=True))
    op.add_column("contacts", sa.Column("competitor_mentions", JSONB, nullable=True))

    # activities — enrichment state + per-email intelligence
    op.add_column("activities", sa.Column("enriched_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("activities", sa.Column("sentiment", sa.String(20), nullable=True))
    op.add_column("activities", sa.Column("buying_signals", JSONB, nullable=True))
    op.add_column("activities", sa.Column("objections", JSONB, nullable=True))
    op.add_column("activities", sa.Column("urgency", sa.String(20), nullable=True))
    op.add_column("activities", sa.Column("next_steps", sa.Text, nullable=True))
    op.add_column("activities", sa.Column("cc_emails", JSONB, nullable=True))

    op.create_index("ix_activities_enriched_at", "activities", ["enriched_at"])


def downgrade() -> None:
    op.drop_index("ix_activities_enriched_at", table_name="activities")

    for col in ["enriched_at", "sentiment", "buying_signals", "objections",
                "urgency", "next_steps", "cc_emails"]:
        op.drop_column("activities", col)

    for col in ["department", "location", "buying_role", "lead_source", "notes",
                "timezone", "sentiment_score", "engagement_score", "last_reply_sentiment",
                "buying_signals", "objections", "competitor_mentions"]:
        op.drop_column("contacts", col)
