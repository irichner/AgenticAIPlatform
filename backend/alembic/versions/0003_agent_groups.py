"""Agent groups: department-level grouping of agents

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-23
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE agent_groups (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            business_unit_id UUID NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
            name        VARCHAR(255) NOT NULL,
            description TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ix_agent_groups_tenant_id ON agent_groups(tenant_id)")
    op.execute("CREATE INDEX ix_agent_groups_business_unit_id ON agent_groups(business_unit_id)")

    op.execute("ALTER TABLE agent_groups ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY tenant_isolation ON agent_groups
            USING (tenant_id = current_setting('app.current_tenant_id')::UUID)
    """)

    op.execute("""
        ALTER TABLE agents
        ADD COLUMN group_id UUID REFERENCES agent_groups(id) ON DELETE SET NULL
    """)
    op.execute("CREATE INDEX ix_agents_group_id ON agents(group_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_agents_group_id")
    op.execute("ALTER TABLE agents DROP COLUMN IF EXISTS group_id")
    op.execute("DROP TABLE IF EXISTS agent_groups")
