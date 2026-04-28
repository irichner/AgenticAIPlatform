"""Add org_id to api_providers, ai_models, mcp_servers, workflows

Revision ID: 0017
Revises: 0016
Create Date: 2026-04-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PGUUID

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None

_ORG_TABLES = ["api_providers", "ai_models", "mcp_servers", "workflows"]


def upgrade() -> None:
    # ── Add org_id column to each table ──────────────────────────────────────
    for table in _ORG_TABLES:
        op.add_column(table, sa.Column("org_id", PGUUID(as_uuid=True), nullable=True))
        op.create_foreign_key(
            f"{table}_org_id_fkey", table, "orgs", ["org_id"], ["id"], ondelete="CASCADE"
        )
        op.create_index(f"ix_{table}_org_id", table, ["org_id"])

    # ── api_providers: replace global name-unique with per-org unique ─────────
    op.drop_constraint("api_providers_name_key", "api_providers", type_="unique")
    op.create_unique_constraint("uq_api_providers_org_name", "api_providers", ["org_id", "name"])

    # ── Assign all existing rows to the oldest org ────────────────────────────
    op.execute("""
        UPDATE api_providers SET org_id = (SELECT id FROM orgs ORDER BY created_at LIMIT 1)
        WHERE org_id IS NULL
    """)
    op.execute("""
        UPDATE ai_models SET org_id = (
            SELECT p.org_id FROM api_providers p WHERE p.id = ai_models.provider_id
        )
        WHERE provider_id IS NOT NULL AND org_id IS NULL
    """)
    op.execute("""
        UPDATE ai_models SET org_id = (SELECT id FROM orgs ORDER BY created_at LIMIT 1)
        WHERE org_id IS NULL
    """)
    op.execute("""
        UPDATE mcp_servers SET org_id = (SELECT id FROM orgs ORDER BY created_at LIMIT 1)
        WHERE org_id IS NULL
    """)
    op.execute("""
        UPDATE workflows SET org_id = (SELECT id FROM orgs ORDER BY created_at LIMIT 1)
        WHERE org_id IS NULL
    """)


def downgrade() -> None:
    op.create_unique_constraint("api_providers_name_key", "api_providers", ["name"])
    op.drop_constraint("uq_api_providers_org_name", "api_providers", type_="unique")

    for table in reversed(_ORG_TABLES):
        op.drop_index(f"ix_{table}_org_id", table_name=table)
        op.drop_constraint(f"{table}_org_id_fkey", table, type_="foreignkey")
        op.drop_column(table, "org_id")
