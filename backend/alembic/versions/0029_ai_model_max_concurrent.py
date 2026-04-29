"""ai_model max_concurrent

Revision ID: 0029
Revises: 0028
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ai_models",
        sa.Column("max_concurrent", sa.Integer(), nullable=True, server_default="1"),
    )


def downgrade() -> None:
    op.drop_column("ai_models", "max_concurrent")
