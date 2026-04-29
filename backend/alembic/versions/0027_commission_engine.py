"""Commission Engine — commission_plans, quota_allocations, attainment_snapshots

Revision ID: 0027
Revises: 0026
Create Date: 2026-04-28
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0027"
down_revision: Union[str, None] = "0026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE commission_plans (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
            name        TEXT NOT NULL,
            description TEXT,
            plan_year   INTEGER NOT NULL,
            plan_type   VARCHAR(50) NOT NULL DEFAULT 'tiered',
            is_active   BOOLEAN NOT NULL DEFAULT TRUE,
            definition  JSONB NOT NULL DEFAULT '{}',
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ON commission_plans (org_id)")

    op.execute("""
        CREATE TABLE quota_allocations (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
            user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            plan_id         UUID REFERENCES commission_plans(id) ON DELETE SET NULL,
            period_year     INTEGER NOT NULL,
            period_month    INTEGER,
            quota_amount    NUMERIC(18,2) NOT NULL,
            quota_type      VARCHAR(50) NOT NULL DEFAULT 'arr',
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (org_id, user_id, period_year, period_month)
        )
    """)
    op.execute("CREATE INDEX ON quota_allocations (org_id)")
    op.execute("CREATE INDEX ON quota_allocations (user_id)")

    op.execute("""
        CREATE TABLE attainment_snapshots (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id              UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
            user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            snapshot_date       DATE NOT NULL,
            period_year         INTEGER NOT NULL,
            period_month        INTEGER NOT NULL,
            attainment_amount   NUMERIC(18,2) NOT NULL,
            attainment_pct      NUMERIC(8,4) NOT NULL,
            commission_earned   NUMERIC(18,2) NOT NULL DEFAULT 0,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (org_id, user_id, snapshot_date, period_year, period_month)
        )
    """)
    op.execute("CREATE INDEX ON attainment_snapshots (org_id)")
    op.execute("CREATE INDEX ON attainment_snapshots (user_id, period_year, period_month)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS attainment_snapshots CASCADE")
    op.execute("DROP TABLE IF EXISTS quota_allocations CASCADE")
    op.execute("DROP TABLE IF EXISTS commission_plans CASCADE")
