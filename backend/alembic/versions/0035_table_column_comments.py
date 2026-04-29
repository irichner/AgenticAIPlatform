"""Add descriptive comments to all public CRM/SPM tables and key columns.

These comments appear in list_tables and describe_table responses from the
MCP postgres server, helping agents understand what data is available and how
to use it without guessing column meanings.

Revision ID: 0035
Revises: 0034
Create Date: 2026-04-29
"""
from __future__ import annotations
from typing import Union
from alembic import op

revision: str = "0035"
down_revision: Union[str, None] = "0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Table comments ──────────────────────────────────────────────────────────
    op.execute("COMMENT ON TABLE public.accounts IS 'B2B company accounts (organisations you sell to)'")
    op.execute("COMMENT ON TABLE public.contacts IS 'Individual people at accounts — email, phone, title'")
    op.execute("COMMENT ON TABLE public.opportunities IS 'Active and closed sales deals linked to an account'")
    op.execute("COMMENT ON TABLE public.opportunity_stages IS 'Custom pipeline stages for opportunities (name, order, win probability)'")
    op.execute("COMMENT ON TABLE public.activities IS 'Logged interactions: emails, meetings, calls, notes'")
    op.execute("COMMENT ON TABLE public.signals IS 'Raw inbound signals from Gmail, Slack, Zoom, etc. awaiting AI processing'")
    op.execute("COMMENT ON TABLE public.deal_signals IS 'AI-extracted deal intelligence from activities (sentiment, objections, next steps)'")
    op.execute("COMMENT ON TABLE public.buying_group_members IS 'Stakeholders in an opportunity with their role and engagement score'")
    op.execute("COMMENT ON TABLE public.commission_plans IS 'Quota and commission plan definitions per rep or team'")
    op.execute("COMMENT ON TABLE public.quota_allocations IS 'Quota targets assigned to users within a commission plan'")
    op.execute("COMMENT ON TABLE public.attainment_snapshots IS 'Point-in-time commission attainment records for reporting and payroll'")

    # ── accounts columns ────────────────────────────────────────────────────────
    op.execute("COMMENT ON COLUMN public.accounts.name IS 'Company trading name'")
    op.execute("COMMENT ON COLUMN public.accounts.domain IS 'Primary email domain (e.g. acme.com)'")
    op.execute("COMMENT ON COLUMN public.accounts.website IS 'Company website URL'")
    op.execute("COMMENT ON COLUMN public.accounts.industry IS 'Industry vertical'")
    op.execute("COMMENT ON COLUMN public.accounts.employee_count IS 'Headcount estimate'")
    op.execute("COMMENT ON COLUMN public.accounts.annual_revenue IS 'Annual revenue from this account (numeric, currency units)'")
    op.execute("COMMENT ON COLUMN public.accounts.health_score IS 'Account health score 0-100 (higher = healthier relationship)'")

    # ── contacts columns ────────────────────────────────────────────────────────
    op.execute("COMMENT ON COLUMN public.contacts.first_name IS 'Contact given name'")
    op.execute("COMMENT ON COLUMN public.contacts.last_name IS 'Contact family name'")
    op.execute("COMMENT ON COLUMN public.contacts.email IS 'Primary email address (unique per org)'")
    op.execute("COMMENT ON COLUMN public.contacts.title IS 'Job title extracted from email signature or enrichment'")
    op.execute("COMMENT ON COLUMN public.contacts.phone IS 'Phone number from signature or manual entry'")
    op.execute("COMMENT ON COLUMN public.contacts.account_id IS 'Parent account this contact belongs to'")

    # ── opportunities columns ───────────────────────────────────────────────────
    op.execute("COMMENT ON COLUMN public.opportunities.name IS 'Deal name shown in the pipeline'")
    op.execute("COMMENT ON COLUMN public.opportunities.stage_id IS 'Current pipeline stage'")
    op.execute("COMMENT ON COLUMN public.opportunities.arr IS 'Expected annual recurring revenue (numeric, currency units)'")
    op.execute("COMMENT ON COLUMN public.opportunities.confidence IS 'Win probability 0-100 set by the rep'")
    op.execute("COMMENT ON COLUMN public.opportunities.health_score IS 'AI-computed deal health 0-100'")
    op.execute("COMMENT ON COLUMN public.opportunities.close_date IS 'Projected or actual close date'")
    op.execute("COMMENT ON COLUMN public.opportunities.won_at IS 'Timestamp when marked as Won (null if open/lost)'")
    op.execute("COMMENT ON COLUMN public.opportunities.lost_at IS 'Timestamp when marked as Lost (null if open/won)'")
    op.execute("COMMENT ON COLUMN public.opportunities.owner_id IS 'User (sales rep) who owns this deal'")

    # ── activities columns ──────────────────────────────────────────────────────
    op.execute("COMMENT ON COLUMN public.activities.type IS 'email | meeting | call | message | note'")
    op.execute("COMMENT ON COLUMN public.activities.subject IS 'Email subject line or meeting title'")
    op.execute("COMMENT ON COLUMN public.activities.direction IS 'inbound (received) or outbound (sent)'")
    op.execute("COMMENT ON COLUMN public.activities.ai_summary IS 'AI-generated 1-3 sentence summary of the interaction'")
    op.execute("COMMENT ON COLUMN public.activities.action_items IS 'JSON array of follow-up actions extracted by AI'")
    op.execute("COMMENT ON COLUMN public.activities.occurred_at IS 'When the interaction actually happened'")
    op.execute("COMMENT ON COLUMN public.activities.duration_seconds IS 'Meeting or call duration in seconds'")

    # ── signals columns ─────────────────────────────────────────────────────────
    op.execute("COMMENT ON COLUMN public.signals.source IS 'Integration that produced this signal: gmail, slack, zoom, teams, calendar'")
    op.execute("COMMENT ON COLUMN public.signals.event_type IS 'Signal category: email_received, meeting_ended, message_sent, etc.'")
    op.execute("COMMENT ON COLUMN public.signals.status IS 'pending → processing → processed | failed'")
    op.execute("COMMENT ON COLUMN public.signals.payload IS 'Raw JSON payload from the source integration'")

    # ── deal_signals columns ────────────────────────────────────────────────────
    op.execute("COMMENT ON COLUMN public.deal_signals.signal_type IS 'competitor_mention | timeline_pressure | budget_concern | champion_change | next_step'")
    op.execute("COMMENT ON COLUMN public.deal_signals.severity IS 'low | medium | high — impact on the deal'")
    op.execute("COMMENT ON COLUMN public.deal_signals.title IS 'Short title for the deal signal'")
    op.execute("COMMENT ON COLUMN public.deal_signals.description IS 'AI-written full description of the signal'")
    op.execute("COMMENT ON COLUMN public.deal_signals.metadata IS 'Additional structured data extracted by AI (JSON)'")

    # ── commission / quota columns ──────────────────────────────────────────────
    op.execute("COMMENT ON COLUMN public.commission_plans.plan_type IS 'tiered | flat | accelerated — commission structure type'")
    op.execute("COMMENT ON COLUMN public.commission_plans.definition IS 'Full plan configuration as JSON (tiers, rates, accelerators)'")
    op.execute("COMMENT ON COLUMN public.quota_allocations.quota_amount IS 'Quota target amount (numeric currency units) for the period'")
    op.execute("COMMENT ON COLUMN public.quota_allocations.quota_type IS 'arr | revenue | units — what is being measured'")
    op.execute("COMMENT ON COLUMN public.attainment_snapshots.attainment_pct IS 'Achieved amount / quota target × 100'")
    op.execute("COMMENT ON COLUMN public.attainment_snapshots.attainment_amount IS 'Achieved amount in same units as quota_amount'")
    op.execute("COMMENT ON COLUMN public.attainment_snapshots.commission_earned IS 'Earned commission (numeric currency units) at this snapshot'")


def downgrade() -> None:
    tables = [
        "accounts", "contacts", "opportunities", "opportunity_stages",
        "activities", "signals", "deal_signals", "buying_group_members",
        "commission_plans", "quota_allocations", "attainment_snapshots",
    ]
    for t in tables:
        op.execute(f"COMMENT ON TABLE public.{t} IS NULL")
