"""Dynamic registry: extend mcp_servers with runtime fields + create mcp_tools

Revision ID: 0015
Revises: 0014
Create Date: 2026-04-26
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Extend mcp_servers ────────────────────────────────────────────────
    op.add_column("mcp_servers", sa.Column(
        "runtime_mode", sa.String(32), nullable=False, server_default="external"
    ))
    op.add_column("mcp_servers", sa.Column("slug", sa.String(128), nullable=True))
    op.add_column("mcp_servers", sa.Column("base_url", sa.Text(), nullable=True))
    op.add_column("mcp_servers", sa.Column(
        "openapi_spec", postgresql.JSONB(astext_type=sa.Text()), nullable=True
    ))
    op.add_column("mcp_servers", sa.Column(
        "auth_config", postgresql.JSONB(astext_type=sa.Text()), nullable=True
    ))
    # Phase 2 fields (code-gen), added now so model is stable
    op.add_column("mcp_servers", sa.Column("last_generated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("mcp_servers", sa.Column(
        "generation_config", postgresql.JSONB(astext_type=sa.Text()), nullable=True
    ))
    op.add_column("mcp_servers", sa.Column("source_repo", sa.Text(), nullable=True))

    op.create_index("ix_mcp_servers_slug", "mcp_servers", ["slug"], unique=True)

    # ── Create mcp_tools ──────────────────────────────────────────────────
    op.create_table(
        "mcp_tools",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column(
            "server_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("mcp_servers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "input_schema",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("http_method", sa.String(16), nullable=False, server_default="GET"),
        sa.Column("path", sa.Text(), nullable=False, server_default="/"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("TRUE")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_mcp_tools_server_id", "mcp_tools", ["server_id"])


def downgrade() -> None:
    op.drop_index("ix_mcp_tools_server_id", table_name="mcp_tools")
    op.drop_table("mcp_tools")

    op.drop_index("ix_mcp_servers_slug", table_name="mcp_servers")
    op.drop_column("mcp_servers", "source_repo")
    op.drop_column("mcp_servers", "generation_config")
    op.drop_column("mcp_servers", "last_generated_at")
    op.drop_column("mcp_servers", "auth_config")
    op.drop_column("mcp_servers", "openapi_spec")
    op.drop_column("mcp_servers", "base_url")
    op.drop_column("mcp_servers", "slug")
    op.drop_column("mcp_servers", "runtime_mode")
