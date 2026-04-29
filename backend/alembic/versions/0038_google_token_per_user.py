"""google_token_per_user

Revision ID: 0038
Revises: 0037
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PGUUID

revision = "0038"
down_revision = "0037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add user_id column (nullable — existing rows have no user)
    op.add_column(
        "google_oauth_tokens",
        sa.Column("user_id", PGUUID(as_uuid=True), sa.ForeignKey("lanara.users.id", ondelete="CASCADE"), nullable=True),
        schema="lanara",
    )
    op.create_index(
        "ix_google_oauth_tokens_user_id",
        "google_oauth_tokens",
        ["user_id"],
        schema="lanara",
    )

    # Drop any legacy rows that have no org (orphaned during previous per-org era)
    op.execute("DELETE FROM lanara.google_oauth_tokens WHERE org_id IS NULL")

    # Add unique constraint — one token per (org, user) pair
    op.create_unique_constraint(
        "uq_google_oauth_tokens_org_user",
        "google_oauth_tokens",
        ["org_id", "user_id"],
        schema="lanara",
    )


def downgrade() -> None:
    op.drop_constraint("uq_google_oauth_tokens_org_user", "google_oauth_tokens", schema="lanara")
    op.drop_index("ix_google_oauth_tokens_user_id", "google_oauth_tokens", schema="lanara")
    op.drop_column("google_oauth_tokens", "user_id", schema="lanara")
