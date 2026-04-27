"""api_providers table + provider_id / metadata on ai_models

Revision ID: 0012
Revises: 0011
Create Date: 2026-04-26
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE api_providers (
            id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name           VARCHAR(100) NOT NULL UNIQUE,
            display_name   VARCHAR(255) NOT NULL,
            api_key        TEXT NOT NULL,
            base_url       TEXT,
            status         VARCHAR(50) NOT NULL DEFAULT 'connected',
            last_synced_at TIMESTAMPTZ,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("""
        ALTER TABLE ai_models
            ADD COLUMN provider_id     UUID REFERENCES api_providers(id) ON DELETE CASCADE,
            ADD COLUMN context_window  INTEGER,
            ADD COLUMN capabilities    TEXT[],
            ADD COLUMN is_auto_managed BOOLEAN NOT NULL DEFAULT FALSE
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE ai_models
            DROP COLUMN IF EXISTS is_auto_managed,
            DROP COLUMN IF EXISTS capabilities,
            DROP COLUMN IF EXISTS context_window,
            DROP COLUMN IF EXISTS provider_id
    """)
    op.execute("DROP TABLE IF EXISTS api_providers")
