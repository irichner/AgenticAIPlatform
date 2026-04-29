"""Rename signal_events → signals and move from lanara schema to public.

signal_events is user business data (inbound emails, meetings, Slack messages)
not platform infrastructure, so it belongs in the public schema alongside the
other CRM tables that agents can query.

Revision ID: 0032
Revises: 0031
Create Date: 2026-04-29
"""
from __future__ import annotations
from typing import Union
from alembic import op

revision: str = "0032"
down_revision: Union[str, None] = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE lanara.signal_events RENAME TO signals")
    op.execute("ALTER TABLE lanara.signals SET SCHEMA public")
    # Also move integration_configs: stays in lanara (has OAuth secrets) — no-op here
    # Add the error column if it doesn't exist yet (was added in new model)
    op.execute("""
        ALTER TABLE public.signals
            ADD COLUMN IF NOT EXISTS error TEXT
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE public.signals DROP COLUMN IF EXISTS error")
    op.execute("ALTER TABLE public.signals SET SCHEMA lanara")
    op.execute("ALTER TABLE lanara.signals RENAME TO signal_events")
