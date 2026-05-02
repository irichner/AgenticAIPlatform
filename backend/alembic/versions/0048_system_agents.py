"""Add is_system flag to agents for admin-only system-seeded agents

Revision ID: 0048
Revises: 0047
Create Date: 2026-05-02
"""
from alembic import op

revision = "0048"
down_revision = "0047"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE lanara.agents
        ADD COLUMN is_system BOOLEAN NOT NULL DEFAULT FALSE
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE lanara.agents DROP COLUMN IF EXISTS is_system")
