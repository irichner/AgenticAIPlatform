"""ai_model role column

Revision ID: 0028
Revises: 0027
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ai_models", sa.Column("role", sa.String(100), nullable=True))
    # At most one model per org can hold each role
    op.create_index(
        "uq_ai_models_org_role",
        "ai_models",
        ["org_id", "role"],
        unique=True,
        postgresql_where=sa.text("role IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_ai_models_org_role", table_name="ai_models")
    op.drop_column("ai_models", "role")
