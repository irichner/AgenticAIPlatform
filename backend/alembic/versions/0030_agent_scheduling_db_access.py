"""Agent scheduling + per-agent database access policies

Revision ID: 0030
Revises: 0029
Create Date: 2026-04-29
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0030"
down_revision: Union[str, None] = "0029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── agent_schedules ───────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE agent_schedules (
            id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id              uuid        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
            agent_id            uuid        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            created_by          uuid        REFERENCES users(id) ON DELETE SET NULL,

            name                text        NOT NULL,
            description         text,

            -- Scheduling type: "cron" | "interval" | "once"
            schedule_type       text        NOT NULL CHECK (schedule_type IN ('cron','interval','once')),
            cron_expression     text,
            interval_seconds    integer     CHECK (interval_seconds > 0),
            run_at              timestamptz,
            timezone            text        NOT NULL DEFAULT 'UTC',

            -- What to pass as the run input (overrides agent default)
            input_override      jsonb,

            -- Control
            enabled             boolean     NOT NULL DEFAULT true,
            max_retries         integer     NOT NULL DEFAULT 0 CHECK (max_retries >= 0),
            retry_delay_seconds integer     NOT NULL DEFAULT 60 CHECK (retry_delay_seconds >= 0),
            timeout_seconds     integer     CHECK (timeout_seconds > 0),

            -- Execution tracking
            next_run_at         timestamptz,
            last_run_at         timestamptz,
            last_run_status     text        CHECK (last_run_status IN ('running','success','failed','skipped')),
            last_run_id         uuid        REFERENCES runs(id) ON DELETE SET NULL,
            run_count           integer     NOT NULL DEFAULT 0,
            failure_count       integer     NOT NULL DEFAULT 0,

            created_at          timestamptz NOT NULL DEFAULT now(),
            updated_at          timestamptz NOT NULL DEFAULT now(),

            CONSTRAINT chk_schedule_type_fields CHECK (
                (schedule_type = 'cron'     AND cron_expression IS NOT NULL) OR
                (schedule_type = 'interval' AND interval_seconds IS NOT NULL) OR
                (schedule_type = 'once'     AND run_at IS NOT NULL)
            )
        )
    """)
    op.execute("CREATE INDEX ix_agent_schedules_org_id     ON agent_schedules (org_id)")
    op.execute("CREATE INDEX ix_agent_schedules_agent_id   ON agent_schedules (agent_id)")
    op.execute("CREATE INDEX ix_agent_schedules_next_run   ON agent_schedules (next_run_at) WHERE enabled = true")

    # ── agent_db_policies ─────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE agent_db_policies (
            id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id              uuid        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
            agent_id            uuid        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,

            name                text        NOT NULL,
            table_name          text        NOT NULL,

            -- Which DML operations are allowed
            allowed_operations  jsonb       NOT NULL DEFAULT '["select"]'::jsonb,

            -- Column access control (null = all columns)
            column_allowlist    jsonb,
            column_blocklist    jsonb,

            -- Safety limit on SELECT results
            row_limit           integer     NOT NULL DEFAULT 100 CHECK (row_limit > 0 AND row_limit <= 5000),

            enabled             boolean     NOT NULL DEFAULT true,

            created_at          timestamptz NOT NULL DEFAULT now(),
            updated_at          timestamptz NOT NULL DEFAULT now(),

            UNIQUE (agent_id, table_name)
        )
    """)
    op.execute("CREATE INDEX ix_agent_db_policies_org_id   ON agent_db_policies (org_id)")
    op.execute("CREATE INDEX ix_agent_db_policies_agent_id ON agent_db_policies (agent_id)")

    # ── Seed new permissions ───────────────────────────────────────────────
    op.execute("""
        INSERT INTO permissions (id, scope, resource, description, system_only) VALUES
        ('agent.schedule.read',        'tenant', 'agent_schedules', 'View agent schedules',             false),
        ('agent.schedule.write',       'tenant', 'agent_schedules', 'Create and update agent schedules', false),
        ('agent.schedule.delete',      'tenant', 'agent_schedules', 'Delete agent schedules',            false),
        ('agent.schedule.trigger',     'tenant', 'agent_schedules', 'Manually trigger a scheduled run',  false),
        ('agent.db_policy.read',       'tenant', 'agent_db_policies', 'View agent DB access policies',   false),
        ('agent.db_policy.write',      'tenant', 'agent_db_policies', 'Create and update DB access policies', false),
        ('agent.db_policy.delete',     'tenant', 'agent_db_policies', 'Delete agent DB access policies', false)
        ON CONFLICT (id) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("""
        DELETE FROM permissions WHERE id IN (
            'agent.schedule.read', 'agent.schedule.write', 'agent.schedule.delete', 'agent.schedule.trigger',
            'agent.db_policy.read', 'agent.db_policy.write', 'agent.db_policy.delete'
        )
    """)
    op.execute("DROP TABLE IF EXISTS agent_db_policies")
    op.execute("DROP TABLE IF EXISTS agent_schedules")
