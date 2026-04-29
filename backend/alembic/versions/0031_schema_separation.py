"""Move all Lanara platform tables to lanara schema; CRM/SPM stay in public

Revision ID: 0031
Revises: 0030
Create Date: 2026-04-29
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0031"
down_revision: Union[str, None] = "0030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# All 39 platform tables to move to lanara schema
PLATFORM_TABLES = [
    "users",
    "orgs",
    "org_tenants",
    "org_memberships",
    "tenant_memberships",
    "roles",
    "role_permissions",
    "permissions",
    "sessions",
    "magic_links",
    "org_sso_configs",
    "org_email_domains",
    "agents",
    "agent_versions",
    "agent_groups",
    "agent_schedules",
    "agent_db_policies",
    "agent_mcp_servers",
    "runs",
    "approval_requests",
    "mcp_servers",
    "mcp_tools",
    "ai_models",
    "api_providers",
    "google_oauth_tokens",
    "signal_events",
    "integration_configs",
    "documents",
    "document_chunks",
    "chat_rooms",
    "chat_messages",
    "audit_log",
    "business_units",
    "workflows",
    "workflow_versions",
    "mcp_registrations",
    "mcp_tool_permissions",
    "mcp_idempotency_outcomes",
    "mcp_run_snapshots",
]


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS lanara")
    for table in PLATFORM_TABLES:
        op.execute(f"ALTER TABLE public.{table} SET SCHEMA lanara")


def downgrade() -> None:
    for table in reversed(PLATFORM_TABLES):
        op.execute(f"ALTER TABLE lanara.{table} SET SCHEMA public")
    op.execute("DROP SCHEMA IF EXISTS lanara")
