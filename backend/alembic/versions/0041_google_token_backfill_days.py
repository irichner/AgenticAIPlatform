"""google_token_backfill_days

Revision ID: 0041
Revises: 0040
Create Date: 2026-04-30
"""
from alembic import op
import sqlalchemy as sa

revision = "0041"
down_revision = "0040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "google_oauth_tokens",
        sa.Column("initial_backfill_days", sa.Integer(), nullable=True),
        schema="lanara",
    )


def downgrade() -> None:
    op.drop_column("google_oauth_tokens", "initial_backfill_days", schema="lanara")
