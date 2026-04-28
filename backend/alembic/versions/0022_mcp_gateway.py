"""MCP Gateway tables and org feature flags.

Revision ID: 0022
Revises: 0021
Create Date: 2026-04-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── org-level flags ──────────────────────────────────────────────────────
    op.add_column("orgs", sa.Column(
        "mcp_gateway_enabled", sa.Boolean(), nullable=False, server_default=sa.text("FALSE")
    ))
    op.add_column("orgs", sa.Column(
        "mcp_guardrail_prompt_additions", sa.Text(), nullable=True
    ))

    # ── mcp_registrations ────────────────────────────────────────────────────
    op.create_table(
        "mcp_registrations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("orgs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("mcp_url", sa.Text(), nullable=False),
        sa.Column("transport", sa.String(50), nullable=False, server_default="streamable_http"),
        sa.Column("auth_type", sa.String(50), nullable=False, server_default="none"),
        sa.Column("auth_config", JSONB(), nullable=True),
        sa.Column("credential_hash", sa.String(64), nullable=True),
        sa.Column("sampling_policy", sa.String(50), nullable=False, server_default="deny"),
        sa.Column("max_tool_calls_per_run", sa.Integer(), nullable=False, server_default=sa.text("30")),
        sa.Column("max_wall_time_seconds", sa.Integer(), nullable=False, server_default=sa.text("180")),
        sa.Column("guardrail_prompt_additions", sa.Text(), nullable=True),
        sa.Column("multi_tenant_claim", sa.Boolean(), nullable=False, server_default=sa.text("FALSE")),
        sa.Column("health_status", sa.String(50), nullable=False, server_default="unknown"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("TRUE")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_mcp_reg_org_enabled", "mcp_registrations", ["org_id", "enabled"])

    # ── mcp_tool_permissions ─────────────────────────────────────────────────
    op.create_table(
        "mcp_tool_permissions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("registration_id", UUID(as_uuid=True), sa.ForeignKey("mcp_registrations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("tool_name", sa.String(255), nullable=False),
        sa.Column("allowed_roles", ARRAY(sa.Text()), nullable=True),
        sa.Column("allowed_user_ids", ARRAY(UUID(as_uuid=True)), nullable=True),
        sa.Column("allowed_org_tenant_ids", ARRAY(UUID(as_uuid=True)), nullable=True),
        sa.Column("requires_idempotency_key", sa.Boolean(), nullable=False, server_default=sa.text("FALSE")),
        sa.Column("max_calls_per_hour", sa.Integer(), nullable=True),
        sa.UniqueConstraint("registration_id", "tool_name", name="uq_mcp_tool_perm"),
    )

    # ── mcp_idempotency_outcomes ─────────────────────────────────────────────
    op.create_table(
        "mcp_idempotency_outcomes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("orgs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("registration_id", UUID(as_uuid=True), sa.ForeignKey("mcp_registrations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tool_name", sa.String(255), nullable=False),
        sa.Column("idempotency_key", sa.String(512), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("result_json", JSONB(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("org_id", "registration_id", "tool_name", "idempotency_key", name="uq_mcp_idempotency"),
    )
    op.create_index(
        "ix_mcp_idem_pending",
        "mcp_idempotency_outcomes",
        ["created_at"],
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.create_index(
        "ix_mcp_idem_expires",
        "mcp_idempotency_outcomes",
        ["expires_at"],
    )

    # ── mcp_run_snapshots ────────────────────────────────────────────────────
    op.create_table(
        "mcp_run_snapshots",
        sa.Column("run_id", UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("orgs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("snapshot_json", JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("mcp_run_snapshots")
    op.drop_index("ix_mcp_idem_expires", "mcp_idempotency_outcomes")
    op.drop_index("ix_mcp_idem_pending", "mcp_idempotency_outcomes")
    op.drop_table("mcp_idempotency_outcomes")
    op.drop_table("mcp_tool_permissions")
    op.drop_index("ix_mcp_reg_org_enabled", "mcp_registrations")
    op.drop_table("mcp_registrations")
    op.drop_column("orgs", "mcp_guardrail_prompt_additions")
    op.drop_column("orgs", "mcp_gateway_enabled")
