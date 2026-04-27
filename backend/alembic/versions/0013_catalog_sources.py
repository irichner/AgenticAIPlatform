"""catalog_sources, catalog_source_settings, catalog_items

Revision ID: 0013
Revises: 0012
Create Date: 2026-04-26
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

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

    # NULLS NOT DISTINCT requires PostgreSQL 15+; we run PG 16.
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

    # ── Seed Phase-1 sources (all no-auth) ────────────────────────────────
    op.execute("""
        INSERT INTO catalog_sources
            (id, kind, display_name, base_url, requires_auth, default_enabled, sync_interval_seconds)
        VALUES
            ('huggingface',  'models',      'Hugging Face', 'https://huggingface.co/api',                       FALSE, TRUE, 21600),
            ('mcp_registry', 'mcp_servers', 'MCP Registry', 'https://registry.modelcontextprotocol.io',         FALSE, TRUE, 21600),
            ('pulsemcp',     'mcp_servers', 'PulseMCP',     'https://www.pulsemcp.com/api',                     FALSE, TRUE, 21600)
    """)

    # Global default settings (tenant_id = NULL) for all Phase-1 sources
    op.execute("""
        INSERT INTO catalog_source_settings (source_id, tenant_id, enabled)
        VALUES
            ('huggingface',  NULL, TRUE),
            ('mcp_registry', NULL, TRUE),
            ('pulsemcp',     NULL, TRUE)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS catalog_items")
    op.execute("DROP TABLE IF EXISTS catalog_source_settings")
    op.execute("DROP TABLE IF EXISTS catalog_sources")
