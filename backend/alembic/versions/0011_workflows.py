"""Add workflows + workflow_versions tables

Revision ID: 0011
Revises: 0010
Create Date: 2026-04-26
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE workflows (
            id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            name        TEXT        NOT NULL DEFAULT 'Untitled Workflow',
            graph       JSONB       NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
            bpmn_xml    TEXT,
            version     INTEGER     NOT NULL DEFAULT 1,
            created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    op.execute("CREATE INDEX idx_workflows_updated_at ON workflows(updated_at DESC)")

    op.execute("""
        CREATE TABLE workflow_versions (
            id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            workflow_id UUID        NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
            version     INTEGER     NOT NULL,
            name        TEXT        NOT NULL,
            graph       JSONB       NOT NULL,
            bpmn_xml    TEXT,
            note        TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(workflow_id, version)
        )
    """)

    op.execute("CREATE INDEX idx_workflow_versions_wf_id ON workflow_versions(workflow_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS workflow_versions")
    op.execute("DROP TABLE IF EXISTS workflows")
