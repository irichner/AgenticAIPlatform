"""Update RLS policies: add internal bypass for background workers.

Background workers (activity_logger, gmail_poller) need to do cross-org scans
(e.g. SELECT pending signals across all orgs). They call
`SET LOCAL app.bypass_rls = 'internal'` to get unfiltered access. Everything
else is filtered by org_id = current_org_id().

Revision ID: 0034
Revises: 0033
Create Date: 2026-04-29
"""
from __future__ import annotations
from typing import Union
from alembic import op

revision: str = "0034"
down_revision: Union[str, None] = "0033"
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
    for table in _PUBLIC_TABLES:
        op.execute(f'DROP POLICY IF EXISTS org_isolation ON public."{table}"')
        op.execute(f"""
            CREATE POLICY org_isolation ON public."{table}"
                USING (
                    current_setting('app.bypass_rls', true) = 'internal'
                    OR org_id = current_org_id()
                )
                WITH CHECK (
                    current_setting('app.bypass_rls', true) = 'internal'
                    OR org_id = current_org_id()
                )
        """)


def downgrade() -> None:
    for table in _PUBLIC_TABLES:
        op.execute(f'DROP POLICY IF EXISTS org_isolation ON public."{table}"')
        op.execute(f"""
            CREATE POLICY org_isolation ON public."{table}"
                USING (org_id = current_org_id())
                WITH CHECK (org_id = current_org_id())
        """)
