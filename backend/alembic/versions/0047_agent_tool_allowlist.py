"""Add agent_tool_allowlist table for per-agent MCP tool guardrails

Revision ID: 0047
Revises: 0046
Create Date: 2026-05-01
"""
from alembic import op

revision = "0047"
down_revision = "0046"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE lanara.agent_tool_allowlist (
            id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
            agent_id      uuid        NOT NULL REFERENCES lanara.agents(id)    ON DELETE CASCADE,
            mcp_server_id uuid        NOT NULL REFERENCES lanara.mcp_servers(id) ON DELETE CASCADE,
            mcp_tool_id   uuid        NOT NULL REFERENCES lanara.mcp_tools(id) ON DELETE CASCADE,
            created_at    timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT uq_agent_tool_allowlist UNIQUE (agent_id, mcp_tool_id)
        )
    """)
    op.execute("CREATE INDEX idx_agent_tool_allowlist_agent ON lanara.agent_tool_allowlist(agent_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS lanara.agent_tool_allowlist;")
