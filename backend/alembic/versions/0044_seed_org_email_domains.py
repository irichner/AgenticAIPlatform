"""Seed org_email_domains from existing org owner emails

For every org that has no email domain registered, insert the domain of
the org owner's email address. This is a one-time data backfill so that
email-domain auto-join works for orgs created before the feature landed.

Revision ID: 0044
Revises: 0043
Create Date: 2026-05-01
"""
from alembic import op
from sqlalchemy import text

revision = "0044"
down_revision = "0043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(text("""
        INSERT INTO lanara.org_email_domains (domain, org_id)
        SELECT DISTINCT split_part(u.email, '@', 2) AS domain, o.id AS org_id
        FROM lanara.orgs o
        JOIN lanara.org_memberships m ON m.org_id = o.id
        JOIN lanara.roles r ON r.id = m.role_id AND r.key = 'org.owner'
        JOIN lanara.users u ON u.id = m.user_id
        WHERE NOT EXISTS (
            SELECT 1 FROM lanara.org_email_domains d WHERE d.org_id = o.id
        )
        ON CONFLICT DO NOTHING
    """))


def downgrade() -> None:
    pass
