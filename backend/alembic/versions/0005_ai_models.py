"""AI model configurations

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-25
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE ai_models (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name        VARCHAR(255) NOT NULL,
            type        VARCHAR(50)  NOT NULL DEFAULT 'api',
            provider    VARCHAR(100) NOT NULL,
            model_id    VARCHAR(255) NOT NULL,
            base_url    TEXT,
            api_key     TEXT,
            enabled     BOOLEAN NOT NULL DEFAULT TRUE,
            description TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ai_models")
