"""Add granular agent/workflow/approval permissions and Everyone role

Revision ID: 0042
Revises: 0041
Create Date: 2026-04-30
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0042"
down_revision: Union[str, None] = "0041"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ORG_ADMIN_ID  = "00000000-0000-0000-0000-000000000002"
_ORG_EVERYONE_ID = "00000000-0000-0000-0000-000000000007"

_NEW_PERMISSIONS = [
    # Agent CRUD
    ("agent.create",   "org", "agent",    "Create agents",             False),
    ("agent.read",     "org", "agent",    "View and list agents",      False),
    ("agent.update",   "org", "agent",    "Edit agents (own only for non-admins)", False),
    ("agent.delete",   "org", "agent",    "Delete agents (own only for non-admins)", False),
    # Workflow CRUD
    ("workflow.create", "org", "workflow", "Create workflows",          False),
    ("workflow.read",   "org", "workflow", "View and list workflows",   False),
    ("workflow.update", "org", "workflow", "Edit workflows (own only for non-admins)", False),
    ("workflow.delete", "org", "workflow", "Delete workflows (own only for non-admins)", False),
    # Approvals
    ("approval.read",   "org", "approval", "View approval requests",   False),
    ("approval.update", "org", "approval", "Respond to approval requests", False),
    ("approval.delete", "org", "approval", "Delete approval requests", False),
]

# Permissions granted to the Everyone role
_EVERYONE_PERMS = [
    "agent.create", "agent.read", "agent.update", "agent.delete",
    "workflow.create", "workflow.read", "workflow.update", "workflow.delete",
    "approval.read", "approval.update", "approval.delete",
]

# Additional permissions for org.admin (the new ones it should also have)
_ADMIN_NEW_PERMS = [
    "agent.create", "agent.read", "agent.update", "agent.delete",
    "workflow.create", "workflow.read", "workflow.update", "workflow.delete",
    "approval.read", "approval.update", "approval.delete",
]


def upgrade() -> None:
    # ── Seed new permissions ──────────────────────────────────────────────
    for perm_id, scope, resource, description, system_only in _NEW_PERMISSIONS:
        op.execute(f"""
            INSERT INTO lanara.permissions (id, scope, resource, description, system_only)
            VALUES ('{perm_id}', '{scope}', '{resource}', '{description}', {system_only})
            ON CONFLICT (id) DO NOTHING
        """)

    # ── Create Everyone system role ───────────────────────────────────────
    op.execute(f"""
        INSERT INTO lanara.roles (id, org_id, scope, key, name, description, is_system, is_default)
        VALUES (
            '{_ORG_EVERYONE_ID}',
            NULL,
            'org',
            'org.everyone',
            'Everyone',
            'Standard user — full CRUD on their own agents, workflows, and approvals',
            true,
            false
        )
        ON CONFLICT DO NOTHING
    """)

    # Grant permissions to Everyone role
    for perm_id in _EVERYONE_PERMS:
        op.execute(f"""
            INSERT INTO lanara.role_permissions (role_id, permission_id)
            VALUES ('{_ORG_EVERYONE_ID}', '{perm_id}')
            ON CONFLICT DO NOTHING
        """)

    # ── Grant new permissions to org.admin ────────────────────────────────
    for perm_id in _ADMIN_NEW_PERMS:
        op.execute(f"""
            INSERT INTO lanara.role_permissions (role_id, permission_id)
            VALUES ('{_ORG_ADMIN_ID}', '{perm_id}')
            ON CONFLICT DO NOTHING
        """)

    # ── Assign org.admin role to israel.richner@lanshore.com ─────────────
    op.execute(f"""
        UPDATE lanara.org_memberships
        SET role_id = '{_ORG_ADMIN_ID}'
        WHERE user_id = (
            SELECT id FROM lanara.users
            WHERE lower(email::text) = 'israel.richner@lanshore.com'
            LIMIT 1
        )
    """)


def downgrade() -> None:
    # Remove Everyone role (cascades role_permissions)
    op.execute(f"DELETE FROM lanara.roles WHERE id = '{_ORG_EVERYONE_ID}'")

    # Remove new permissions from org.admin
    for perm_id in _ADMIN_NEW_PERMS:
        op.execute(f"""
            DELETE FROM lanara.role_permissions
            WHERE role_id = '{_ORG_ADMIN_ID}' AND permission_id = '{perm_id}'
        """)

    # Remove new permissions
    for perm_id, *_ in _NEW_PERMISSIONS:
        op.execute(f"DELETE FROM lanara.permissions WHERE id = '{perm_id}'")
