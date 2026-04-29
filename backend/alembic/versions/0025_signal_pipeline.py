"""Signal pipeline — signal_events, integration_configs tables

Revision ID: 0025
Revises: 0024
Create Date: 2026-04-28
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0025"
down_revision: Union[str, None] = "0024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE signal_events (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
            source          VARCHAR(50) NOT NULL,
            event_type      VARCHAR(100) NOT NULL,
            payload         JSONB NOT NULL DEFAULT '{}',
            status          VARCHAR(30) NOT NULL DEFAULT 'pending',
            processed_at    TIMESTAMPTZ,
            error           TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ON signal_events (org_id)")
    op.execute("CREATE INDEX ON signal_events (status) WHERE status = 'pending'")

    op.execute("""
        CREATE TABLE integration_configs (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id              UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
            user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            provider            VARCHAR(50) NOT NULL,
            access_token        TEXT,
            refresh_token       TEXT,
            token_expires_at    TIMESTAMPTZ,
            webhook_secret      TEXT,
            sync_cursor         TEXT,
            enabled             BOOLEAN NOT NULL DEFAULT TRUE,
            scopes              JSONB,
            metadata            JSONB,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (org_id, user_id, provider)
        )
    """)
    op.execute("CREATE INDEX ON integration_configs (org_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS integration_configs CASCADE")
    op.execute("DROP TABLE IF EXISTS signal_events CASCADE")
