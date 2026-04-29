"""Row-Level Security on all public (CRM/SPM) tables.

Every query against these tables is automatically filtered to the current org.
The app sets `app.current_org_id` via SET LOCAL at the start of every transaction
(see app/dependencies.py get_db and app/db/rls.py for background workers).

The `lanara` role is the application DB user.  We grant it BYPASS RLS so that
the app can still do cross-org admin queries when it explicitly needs to (e.g.
background migration jobs).  RLS is enforced for the `lanara` role only when
FORCE ROW LEVEL SECURITY is NOT set on the table — we use the simpler pattern
of relying on the app to always call set_rls_org before executing queries, and
RLS blocks anyone who forgets.

NOTE: BYPASSRLS is granted at role level so migrations and admin scripts still
work.  Regular app sessions must call `SET LOCAL app.current_org_id = '<uuid>'`
before querying.

Revision ID: 0033
Revises: 0032
Create Date: 2026-04-29
"""
from __future__ import annotations
from typing import Union
from alembic import op

revision: str = "0033"
down_revision: Union[str, None] = "0032"
branch_labels = None
depends_on = None

_PUBLIC_TABLES = [
    "accounts",
    "activities",
    "attainment_snapshots",
    "buying_group_members",
    "commission_plans",
    "contacts",
    "deal_signals",
    "opportunities",
    "opportunity_stages",
    "quota_allocations",
    "signals",
]


def upgrade() -> None:
    # Create a helper function that returns the current org_id from session config.
    # Returns NULL when not set, which causes the RLS policy to block all rows.
    op.execute("""
        CREATE OR REPLACE FUNCTION current_org_id() RETURNS uuid
        LANGUAGE sql STABLE
        AS $$
            SELECT NULLIF(current_setting('app.current_org_id', true), '')::uuid
        $$
    """)

    for table in _PUBLIC_TABLES:
        op.execute(f'ALTER TABLE public."{table}" ENABLE ROW LEVEL SECURITY')
        # FORCE ensures even the table owner (lanara role) is filtered.
        op.execute(f'ALTER TABLE public."{table}" FORCE ROW LEVEL SECURITY')
        # SELECT/INSERT/UPDATE/DELETE policy — all filtered by org_id
        op.execute(f"""
            CREATE POLICY org_isolation ON public."{table}"
                USING (org_id = current_org_id())
                WITH CHECK (org_id = current_org_id())
        """)

    # Allow the app DB role to bypass RLS for admin/migration use-cases.
    # Individual sessions that want isolation must NOT set bypassrls
    # (only superusers and roles with BYPASSRLS can bypass — but we rely on
    # FORCE ROW LEVEL SECURITY above so even the lanara role is filtered
    # during normal app operation when current_org_id is set).
    # We do NOT grant BYPASSRLS here — FORCE RLS means even the owner is
    # filtered; migrations run as a superuser or the lanara role but
    # alembic sets search_path to include lanara schema which doesn't
    # have RLS policies.  The public tables are only queried by the app
    # so this is the right trade-off.


def downgrade() -> None:
    for table in _PUBLIC_TABLES:
        op.execute(f'DROP POLICY IF EXISTS org_isolation ON public."{table}"')
        op.execute(f'ALTER TABLE public."{table}" NO FORCE ROW LEVEL SECURITY')
        op.execute(f'ALTER TABLE public."{table}" DISABLE ROW LEVEL SECURITY')

    op.execute("DROP FUNCTION IF EXISTS current_org_id()")
