"""Add agent_mcp_servers join table

Revision ID: 0010
Revises: 0009
Create Date: 2026-04-26
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE agent_mcp_servers (
            agent_id      UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            mcp_server_id UUID NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
            PRIMARY KEY (agent_id, mcp_server_id)
        )
    """)
    op.execute(
        "CREATE INDEX ix_agent_mcp_servers_agent_id ON agent_mcp_servers (agent_id)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS agent_mcp_servers")
