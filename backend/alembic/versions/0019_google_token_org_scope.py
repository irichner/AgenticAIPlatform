"""Add org_id to google_oauth_tokens for tenant isolation.

Revision ID: 0019
Revises: 0018
Create Date: 2026-04-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "google_oauth_tokens",
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("orgs.id", ondelete="CASCADE"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("google_oauth_tokens", "org_id")
