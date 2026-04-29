"""CRM core — accounts, contacts, opportunity_stages, opportunities, activities

Revision ID: 0024
Revises: 0023
Create Date: 2026-04-28
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0024"
down_revision: Union[str, None] = "0023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE accounts (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
            owner_id        UUID REFERENCES users(id) ON DELETE SET NULL,
            name            TEXT NOT NULL,
            domain          TEXT,
            industry        VARCHAR(100),
            employee_count  INTEGER,
            annual_revenue  NUMERIC(18,2),
            website         TEXT,
            description     TEXT,
            health_score    INTEGER,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ON accounts (org_id)")
    op.execute("""
        CREATE TABLE contacts (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id              UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
            account_id          UUID REFERENCES accounts(id) ON DELETE SET NULL,
            owner_id            UUID REFERENCES users(id) ON DELETE SET NULL,
            first_name          TEXT NOT NULL,
            last_name           TEXT NOT NULL,
            email               TEXT,
            phone               VARCHAR(50),
            title               TEXT,
            seniority           VARCHAR(50),
            linkedin_url        TEXT,
            last_contacted_at   TIMESTAMPTZ,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ON contacts (org_id)")
    op.execute("CREATE INDEX ON contacts (account_id)")
    op.execute("""
        CREATE TABLE opportunity_stages (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
            name        TEXT NOT NULL,
            "order"     INTEGER NOT NULL DEFAULT 0,
            probability INTEGER NOT NULL DEFAULT 0,
            is_won      BOOLEAN NOT NULL DEFAULT FALSE,
            is_lost     BOOLEAN NOT NULL DEFAULT FALSE,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ON opportunity_stages (org_id)")
    op.execute("""
        CREATE TABLE opportunities (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
            account_id  UUID REFERENCES accounts(id) ON DELETE SET NULL,
            stage_id    UUID REFERENCES opportunity_stages(id) ON DELETE SET NULL,
            owner_id    UUID REFERENCES users(id) ON DELETE SET NULL,
            name        TEXT NOT NULL,
            arr         NUMERIC(18,2),
            close_date  DATE,
            confidence  INTEGER,
            deal_type   VARCHAR(50),
            description TEXT,
            health_score INTEGER,
            won_at      TIMESTAMPTZ,
            lost_at     TIMESTAMPTZ,
            lost_reason TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ON opportunities (org_id)")
    op.execute("CREATE INDEX ON opportunities (account_id)")
    op.execute("""
        CREATE TABLE activities (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id              UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
            opportunity_id      UUID REFERENCES opportunities(id) ON DELETE CASCADE,
            account_id          UUID REFERENCES accounts(id) ON DELETE CASCADE,
            contact_id          UUID REFERENCES contacts(id) ON DELETE SET NULL,
            owner_id            UUID REFERENCES users(id) ON DELETE SET NULL,
            type                VARCHAR(50) NOT NULL,
            subject             VARCHAR(500),
            body                TEXT,
            direction           VARCHAR(20),
            occurred_at         TIMESTAMPTZ NOT NULL,
            duration_seconds    INTEGER,
            ai_summary          TEXT,
            action_items        JSONB,
            source              VARCHAR(50) NOT NULL DEFAULT 'manual',
            external_id         TEXT UNIQUE,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ON activities (org_id)")
    op.execute("CREATE INDEX ON activities (opportunity_id)")
    op.execute("CREATE INDEX ON activities (account_id)")

    # Seed default pipeline stages per org — done at app level; nothing to seed here


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS activities CASCADE")
    op.execute("DROP TABLE IF EXISTS opportunities CASCADE")
    op.execute("DROP TABLE IF EXISTS opportunity_stages CASCADE")
    op.execute("DROP TABLE IF EXISTS contacts CASCADE")
    op.execute("DROP TABLE IF EXISTS accounts CASCADE")
