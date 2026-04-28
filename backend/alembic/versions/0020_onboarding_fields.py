"""Add onboarding fields to users and orgs.

Revision ID: 0020
Revises: 0019
Create Date: 2026-04-28
"""
from alembic import op
import sqlalchemy as sa


revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("onboarding_completed", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("users", sa.Column("job_title", sa.String(255), nullable=True))
    op.add_column("orgs", sa.Column("logo_url", sa.String(512), nullable=True))
    # Existing users already have orgs via bootstrap — mark them complete
    op.execute("UPDATE users SET onboarding_completed = true")


def downgrade() -> None:
    op.drop_column("users", "onboarding_completed")
    op.drop_column("users", "job_title")
    op.drop_column("orgs", "logo_url")
