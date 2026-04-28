"""add org_id to business_units for tenant isolation

Revision ID: 0016
Revises: 0015
Create Date: 2026-04-28
"""
from alembic import op
import sqlalchemy as sa

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "business_units",
        sa.Column("org_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "business_units_org_id_fkey",
        "business_units",
        "orgs",
        ["org_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_business_units_org_id", "business_units", ["org_id"])

    # Assign existing rows to the oldest org so dev data isn't lost
    op.execute("""
        UPDATE business_units
        SET org_id = (SELECT id FROM orgs ORDER BY created_at LIMIT 1)
        WHERE org_id IS NULL
    """)


def downgrade() -> None:
    op.drop_index("ix_business_units_org_id", table_name="business_units")
    op.drop_constraint("business_units_org_id_fkey", "business_units", type_="foreignkey")
    op.drop_column("business_units", "org_id")
