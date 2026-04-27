"""Add model_id to agents

Revision ID: 0009
Revises: 0008
Create Date: 2026-04-26
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE agents
        ADD COLUMN model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE agents DROP COLUMN IF EXISTS model_id")
