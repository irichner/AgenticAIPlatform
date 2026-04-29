"""Add per-user and per-org agent execution rate limit columns.

Revision ID: 0037
Revises: 0036
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0037"
down_revision = "0036"
branch_labels = None
depends_on = None


def upgrade():
    # Org-wide defaults (NULL = fall back to env var)
    op.add_column("orgs", sa.Column("agent_runs_per_minute", sa.Integer(), nullable=True), schema="lanara")
    op.add_column("orgs", sa.Column("agent_runs_per_hour", sa.Integer(), nullable=True), schema="lanara")

    # Per-user overrides (NULL = inherit org/env default)
    op.add_column("org_memberships", sa.Column("agent_runs_per_minute", sa.Integer(), nullable=True), schema="lanara")
    op.add_column("org_memberships", sa.Column("agent_runs_per_hour", sa.Integer(), nullable=True), schema="lanara")


def downgrade():
    op.drop_column("org_memberships", "agent_runs_per_hour", schema="lanara")
    op.drop_column("org_memberships", "agent_runs_per_minute", schema="lanara")
    op.drop_column("orgs", "agent_runs_per_hour", schema="lanara")
    op.drop_column("orgs", "agent_runs_per_minute", schema="lanara")
