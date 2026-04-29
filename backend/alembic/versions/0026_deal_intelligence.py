"""Deal intelligence — deal_signals, buying_group_members tables

Revision ID: 0026
Revises: 0025
Create Date: 2026-04-28
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0026"
down_revision: Union[str, None] = "0025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE deal_signals (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id              UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
            opportunity_id      UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
            source_activity_id  UUID REFERENCES activities(id) ON DELETE SET NULL,
            signal_type         VARCHAR(100) NOT NULL,
            severity            VARCHAR(20) NOT NULL DEFAULT 'medium',
            title               VARCHAR(500) NOT NULL,
            description         TEXT,
            metadata            JSONB,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ON deal_signals (org_id)")
    op.execute("CREATE INDEX ON deal_signals (opportunity_id)")

    op.execute("""
        CREATE TABLE buying_group_members (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
            opportunity_id  UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
            contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
            name            TEXT NOT NULL,
            email           TEXT,
            role            VARCHAR(50) NOT NULL DEFAULT 'unknown',
            engagement_level VARCHAR(20) NOT NULL DEFAULT 'unknown',
            discovered_via  VARCHAR(50),
            notes           TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ON buying_group_members (org_id)")
    op.execute("CREATE INDEX ON buying_group_members (opportunity_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS buying_group_members CASCADE")
    op.execute("DROP TABLE IF EXISTS deal_signals CASCADE")
