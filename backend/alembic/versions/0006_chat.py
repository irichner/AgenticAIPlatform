"""Chat rooms and messages

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-25
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE chat_rooms (
            id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            name       VARCHAR(255) NOT NULL,
            type       VARCHAR(50)  NOT NULL DEFAULT 'group',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ix_chat_rooms_tenant_id ON chat_rooms(tenant_id)")
    op.execute("ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY tenant_isolation ON chat_rooms
            USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    """)

    op.execute("""
        CREATE TABLE chat_messages (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            room_id      UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
            tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            sender_name  VARCHAR(255) NOT NULL,
            content      TEXT NOT NULL,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ix_chat_messages_room_id ON chat_messages(room_id)")
    op.execute("CREATE INDEX ix_chat_messages_tenant_id ON chat_messages(tenant_id)")
    op.execute("ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY tenant_isolation ON chat_messages
            USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS chat_messages")
    op.execute("DROP TABLE IF EXISTS chat_rooms")
