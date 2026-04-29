"""Add org_id to agent_groups and approval_requests for direct tenant isolation.

Revision ID: 0036
Revises: 0035
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PGUUID

revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None


def upgrade():
    # ── agent_groups ──────────────────────────────────────────────────────────
    op.add_column(
        "agent_groups",
        sa.Column("org_id", PGUUID(as_uuid=True), nullable=True),
        schema="lanara",
    )
    # Back-fill from the related business_unit
    op.execute(
        """
        UPDATE lanara.agent_groups ag
        SET org_id = bu.org_id
        FROM lanara.business_units bu
        WHERE bu.id = ag.business_unit_id
        """
    )
    op.alter_column("agent_groups", "org_id", nullable=False, schema="lanara")
    op.create_foreign_key(
        "fk_agent_groups_org_id",
        "agent_groups", "orgs",
        ["org_id"], ["id"],
        source_schema="lanara", referent_schema="lanara",
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_lanara_agent_groups_org_id", "agent_groups", ["org_id"], schema="lanara"
    )

    # ── approval_requests ─────────────────────────────────────────────────────
    op.add_column(
        "approval_requests",
        sa.Column("org_id", PGUUID(as_uuid=True), nullable=True),
        schema="lanara",
    )
    # Pass 1: back-fill via run → business_unit (covers most rows)
    op.execute(
        """
        UPDATE lanara.approval_requests ar
        SET org_id = bu.org_id
        FROM lanara.runs r
        JOIN lanara.business_units bu ON bu.id = r.business_unit_id
        WHERE r.id = ar.run_id
          AND ar.org_id IS NULL
        """
    )
    # Pass 2: fallback via run → agent → business_unit (covers runs with NULL business_unit_id)
    op.execute(
        """
        UPDATE lanara.approval_requests ar
        SET org_id = bu.org_id
        FROM lanara.runs r
        JOIN lanara.agents a ON a.id = r.agent_id
        JOIN lanara.business_units bu ON bu.id = a.business_unit_id
        WHERE r.id = ar.run_id
          AND ar.org_id IS NULL
          AND a.business_unit_id IS NOT NULL
        """
    )
    # Drop any approval_requests that remain unresolvable (orphaned runs with no org context)
    op.execute(
        "DELETE FROM lanara.approval_requests WHERE org_id IS NULL"
    )
    op.alter_column("approval_requests", "org_id", nullable=False, schema="lanara")
    op.create_foreign_key(
        "fk_approval_requests_org_id",
        "approval_requests", "orgs",
        ["org_id"], ["id"],
        source_schema="lanara", referent_schema="lanara",
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_lanara_approval_requests_org_id", "approval_requests", ["org_id"], schema="lanara"
    )


def downgrade():
    op.drop_index("ix_lanara_approval_requests_org_id", table_name="approval_requests", schema="lanara")
    op.drop_constraint("fk_approval_requests_org_id", "approval_requests", schema="lanara", type_="foreignkey")
    op.drop_column("approval_requests", "org_id", schema="lanara")

    op.drop_index("ix_lanara_agent_groups_org_id", table_name="agent_groups", schema="lanara")
    op.drop_constraint("fk_agent_groups_org_id", "agent_groups", schema="lanara", type_="foreignkey")
    op.drop_column("agent_groups", "org_id", schema="lanara")
