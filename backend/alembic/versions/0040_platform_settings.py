"""platform_settings

Revision ID: 0040
Revises: 0039
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0040"
down_revision = "0039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_settings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("lanara.orgs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("key", sa.String(100), nullable=False),
        sa.Column("value", sa.Text(), nullable=True),
        sa.Column("is_secret", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("updated_by", UUID(as_uuid=True), sa.ForeignKey("lanara.users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("org_id", "key", name="uq_platform_settings_org_key"),
        schema="lanara",
    )
    op.create_index(
        "ix_platform_settings_org_id",
        "platform_settings",
        ["org_id"],
        schema="lanara",
    )


def downgrade() -> None:
    op.drop_index("ix_platform_settings_org_id", table_name="platform_settings", schema="lanara")
    op.drop_table("platform_settings", schema="lanara")
