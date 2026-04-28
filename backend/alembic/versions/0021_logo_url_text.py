"""Change logo_url from varchar(512) to text.

Revision ID: 0021
Revises: 0020
Create Date: 2026-04-28
"""
from alembic import op
import sqlalchemy as sa


revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("orgs", "logo_url", type_=sa.Text(), existing_nullable=True)


def downgrade() -> None:
    op.alter_column("orgs", "logo_url", type_=sa.String(512), existing_nullable=True)
