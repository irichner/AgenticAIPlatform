"""Drop catalog_sources, catalog_source_settings, catalog_items tables

Revision ID: 0023
Revises: 0022
Create Date: 2026-04-28
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0023"
down_revision: Union[str, None] = "0022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS catalog_items CASCADE")
    op.execute("DROP TABLE IF EXISTS catalog_source_settings CASCADE")
    op.execute("DROP TABLE IF EXISTS catalog_sources CASCADE")


def downgrade() -> None:
    op.execute("""
        CREATE TABLE catalog_sources (
            id                    TEXT PRIMARY KEY,
            kind                  TEXT NOT NULL CHECK (kind IN ('models', 'mcp_servers')),
            display_name          TEXT NOT NULL,
            base_url              TEXT NOT NULL,
            requires_auth         BOOLEAN NOT NULL DEFAULT FALSE,
            auth_scheme           TEXT,
            default_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
            sync_interval_seconds INTEGER NOT NULL DEFAULT 21600,
            created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE TABLE catalog_source_settings (
            id               BIGSERIAL PRIMARY KEY,
            source_id        TEXT NOT NULL REFERENCES catalog_sources(id) ON DELETE CASCADE,
            tenant_id        UUID,
            enabled          BOOLEAN NOT NULL,
            credential_ref   TEXT,
            config           JSONB NOT NULL DEFAULT '{}',
            last_sync_at     TIMESTAMPTZ,
            last_sync_status TEXT,
            last_sync_error  TEXT,
            CONSTRAINT catalog_source_settings_source_tenant_uniq
                UNIQUE NULLS NOT DISTINCT (source_id, tenant_id)
        )
    """)
    op.execute("""
        CREATE TABLE catalog_items (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            source_id   TEXT NOT NULL REFERENCES catalog_sources(id) ON DELETE CASCADE,
            external_id TEXT NOT NULL,
            kind        TEXT NOT NULL,
            payload     JSONB NOT NULL,
            fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (source_id, external_id)
        )
    """)
    op.execute("CREATE INDEX ON catalog_items (source_id, kind)")
