"""Remove multi-tenancy: drop RLS policies, tenant_id columns, and tenants table

Revision ID: 0007
Revises: 0006
Create Date: 2026-04-25
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Tables that have tenant_id + RLS policy named tenant_isolation
_RLS_TABLES = [
    "chat_messages",
    "chat_rooms",
    "agent_groups",
    "approval_requests",
    "document_chunks",
    "documents",
    "runs",
    "agent_versions",
    "agents",
    "users",
    "business_units",
]


def upgrade() -> None:
    # 1. Drop RLS policies and disable RLS
    for table in _RLS_TABLES:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    # 2. Drop tenant_id indexes
    for table in _RLS_TABLES:
        op.execute(f"DROP INDEX IF EXISTS ix_{table}_tenant_id")

    # 3. Drop users unique constraint that includes tenant_id, add email-only one
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS uq_users_tenant_email")
    op.execute("ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE (email)")

    # 4. Drop tenant_id columns (CASCADE drops FK constraints automatically)
    for table in _RLS_TABLES:
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS tenant_id")

    # 5. Drop tenants table (no FKs remain pointing to it)
    op.execute("DROP TABLE IF EXISTS tenants")


def downgrade() -> None:
    raise NotImplementedError("Downgrade not supported — cannot recover dropped tenant data")
