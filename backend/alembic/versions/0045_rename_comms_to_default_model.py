"""Rename ai_model role comms_model -> default_model

Revision ID: 0045
Revises: 0044
Create Date: 2026-05-01
"""
from alembic import op
from sqlalchemy import text

revision = "0045"
down_revision = "0044"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(text(
        "UPDATE lanara.ai_models SET role = 'default_model' WHERE role = 'comms_model'"
    ))


def downgrade() -> None:
    op.execute(text(
        "UPDATE lanara.ai_models SET role = 'comms_model' WHERE role = 'default_model'"
    ))
