"""google_token_poll_interval

Revision ID: 0039
Revises: 0038
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0039"
down_revision = "0038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "google_oauth_tokens",
        sa.Column("poll_interval_minutes", sa.Integer(), nullable=True),
        schema="lanara",
    )


def downgrade() -> None:
    op.drop_column("google_oauth_tokens", "poll_interval_minutes", schema="lanara")
