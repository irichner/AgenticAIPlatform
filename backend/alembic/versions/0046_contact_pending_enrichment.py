"""Add pending_enrichment flag to contacts

Revision ID: 0046
Revises: 0045
Create Date: 2026-05-01
"""
from alembic import op
import sqlalchemy as sa

revision = "0046"
down_revision = "0045"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "contacts",
        sa.Column("pending_enrichment", sa.Boolean, nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("contacts", "pending_enrichment")
