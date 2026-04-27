"""Multi-tenant org/tenant hierarchy, full RBAC, passwordless auth

Revision ID: 0014
Revises: 0013
Create Date: 2026-04-26
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Deterministic UUIDs for the six seeded system roles
_ORG_OWNER_ID  = "00000000-0000-0000-0000-000000000001"
_ORG_ADMIN_ID  = "00000000-0000-0000-0000-000000000002"
_ORG_MEMBER_ID = "00000000-0000-0000-0000-000000000003"
_TN_ADMIN_ID   = "00000000-0000-0000-0000-000000000004"
_TN_EDITOR_ID  = "00000000-0000-0000-0000-000000000005"
_TN_VIEWER_ID  = "00000000-0000-0000-0000-000000000006"


def upgrade() -> None:
    # ── Extensions ────────────────────────────────────────────────────────
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    # ── Augment existing users table ──────────────────────────────────────
    op.execute("ALTER TABLE users ALTER COLUMN email TYPE citext USING email::citext")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz")
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
        "email_verified boolean NOT NULL DEFAULT false"
    )

    # ── Orgs ──────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE orgs (
            id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
            name         text        NOT NULL,
            slug         text        NOT NULL UNIQUE,
            sso_enforced boolean     NOT NULL DEFAULT false,
            created_at   timestamptz NOT NULL DEFAULT now()
        )
    """)

    # ── Tenants (owned by orgs) ───────────────────────────────────────────
    op.execute("""
        CREATE TABLE org_tenants (
            id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id     uuid        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
            name       text        NOT NULL,
            slug       text        NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            UNIQUE (org_id, slug)
        )
    """)

    # ── Permission catalog ────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE permissions (
            id          text    PRIMARY KEY,
            scope       text    NOT NULL CHECK (scope IN ('org','tenant')),
            resource    text    NOT NULL,
            description text    NOT NULL,
            system_only boolean NOT NULL DEFAULT false,
            created_at  timestamptz NOT NULL DEFAULT now()
        )
    """)

    # ── Roles ─────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE roles (
            id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id      uuid        REFERENCES orgs(id) ON DELETE CASCADE,
            scope       text        NOT NULL CHECK (scope IN ('org','tenant')),
            key         text        NOT NULL,
            name        text        NOT NULL,
            description text,
            is_system   boolean     NOT NULL DEFAULT false,
            is_default  boolean     NOT NULL DEFAULT false,
            created_at  timestamptz NOT NULL DEFAULT now(),
            created_by  uuid        REFERENCES users(id),
            UNIQUE NULLS NOT DISTINCT (org_id, scope, key)
        )
    """)
    op.execute("CREATE INDEX ON roles (org_id) WHERE org_id IS NOT NULL")

    # ── Role ↔ Permission ─────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE role_permissions (
            role_id       uuid        NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            permission_id text        NOT NULL REFERENCES permissions(id) ON DELETE RESTRICT,
            granted_at    timestamptz NOT NULL DEFAULT now(),
            granted_by    uuid        REFERENCES users(id),
            PRIMARY KEY (role_id, permission_id)
        )
    """)
    op.execute("CREATE INDEX ON role_permissions (permission_id)")

    # ── Org memberships ───────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE org_memberships (
            org_id     uuid        NOT NULL REFERENCES orgs(id)   ON DELETE CASCADE,
            user_id    uuid        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
            role_id    uuid        NOT NULL REFERENCES roles(id),
            created_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (org_id, user_id)
        )
    """)

    # ── Tenant memberships ────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE tenant_memberships (
            tenant_id  uuid        NOT NULL REFERENCES org_tenants(id) ON DELETE CASCADE,
            user_id    uuid        NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
            role_id    uuid        NOT NULL REFERENCES roles(id),
            created_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (tenant_id, user_id)
        )
    """)

    # ── Sessions ──────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE sessions (
            id           text        PRIMARY KEY,
            user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at   timestamptz NOT NULL DEFAULT now(),
            last_seen_at timestamptz NOT NULL DEFAULT now(),
            expires_at   timestamptz NOT NULL,
            user_agent   text,
            ip           inet
        )
    """)
    op.execute("CREATE INDEX ON sessions (user_id)")
    op.execute("CREATE INDEX ON sessions (expires_at)")

    # ── Magic links ───────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE magic_links (
            token_hash    text        PRIMARY KEY,
            email         citext      NOT NULL,
            purpose       text        NOT NULL CHECK (purpose IN ('login','invite')),
            org_id        uuid        REFERENCES orgs(id),
            role_id       uuid        REFERENCES roles(id),
            expires_at    timestamptz NOT NULL,
            used_at       timestamptz,
            pre_flight_id text
        )
    """)
    op.execute("CREATE INDEX ON magic_links (email, expires_at)")

    # ── SSO configs ───────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE org_sso_configs (
            org_id            uuid    PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
            provider          text    NOT NULL,
            issuer_url        text    NOT NULL,
            client_id         text    NOT NULL,
            client_secret_ref text    NOT NULL,
            enabled           boolean NOT NULL DEFAULT true
        )
    """)

    # ── Email domain routing ──────────────────────────────────────────────
    op.execute("""
        CREATE TABLE org_email_domains (
            domain      citext      PRIMARY KEY,
            org_id      uuid        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
            verified    boolean     NOT NULL DEFAULT false,
            verified_at timestamptz,
            verify_token text
        )
    """)

    # ── Audit log ─────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE audit_log (
            id            bigserial   PRIMARY KEY,
            at            timestamptz NOT NULL DEFAULT now(),
            actor_user_id uuid        REFERENCES users(id),
            org_id        uuid        REFERENCES orgs(id),
            tenant_id     uuid        REFERENCES org_tenants(id),
            permission    text,
            action        text        NOT NULL,
            target_type   text,
            target_id     text,
            payload       jsonb,
            ip            inet,
            user_agent    text
        )
    """)
    op.execute("CREATE INDEX ON audit_log (org_id, at DESC)")
    op.execute("CREATE INDEX ON audit_log (actor_user_id, at DESC)")

    # ── Seed permission catalog ───────────────────────────────────────────
    op.execute("""
        INSERT INTO permissions (id, scope, resource, description, system_only) VALUES
        ('org.settings.read',       'org',    'settings',  'Read org settings',               false),
        ('org.settings.write',      'org',    'settings',  'Modify org settings',              false),
        ('org.members.invite',      'org',    'members',   'Invite members to org',            false),
        ('org.members.remove',      'org',    'members',   'Remove members from org',          false),
        ('org.roles.manage',        'org',    'roles',     'Create/edit/delete custom roles',  false),
        ('org.sso.configure',       'org',    'sso',       'Configure SSO',                    false),
        ('org.billing.read',        'org',    'billing',   'View billing info',                false),
        ('org.billing.write',       'org',    'billing',   'Manage billing',                   false),
        ('org.audit_log.read',      'org',    'audit_log', 'View audit log',                   false),
        ('org.tenants.create',      'org',    'tenants',   'Create tenants within org',        false),
        ('org.tenants.delete',      'org',    'tenants',   'Delete tenants within org',        false),
        ('tenant.settings.read',    'tenant', 'settings',  'Read tenant settings',             false),
        ('tenant.settings.write',   'tenant', 'settings',  'Modify tenant settings',           false),
        ('tenant.members.invite',   'tenant', 'members',   'Invite members to tenant',         false),
        ('tenant.members.remove',   'tenant', 'members',   'Remove members from tenant',       false),
        ('catalog.items.read',      'tenant', 'catalog',   'Read catalog items',               false),
        ('catalog.source.toggle',   'tenant', 'catalog',   'Enable/disable catalog sources',   true),
        ('catalog.source.configure','tenant', 'catalog',   'Configure catalog sources',        true),
        ('catalog.source.sync_now', 'tenant', 'catalog',   'Trigger catalog sync',             true),
        ('mcp.project.read',        'tenant', 'mcp',       'Read MCP projects',                false),
        ('mcp.project.write',       'tenant', 'mcp',       'Create/edit MCP projects',         false),
        ('mcp.project.publish',     'tenant', 'mcp',       'Publish MCP projects',             false),
        ('mcp.project.delete',      'tenant', 'mcp',       'Delete MCP projects',              false),
        ('mcp.invocations.read',    'tenant', 'mcp',       'View MCP invocations',             false)
    """)

    # ── Seed six system roles ─────────────────────────────────────────────
    op.execute(f"""
        INSERT INTO roles (id, org_id, scope, key, name, description, is_system, is_default)
        VALUES
        ('{_ORG_OWNER_ID}',  NULL, 'org',    'org.owner',
         'Owner',         'Full org control; short-circuits all permission checks', true, false),
        ('{_ORG_ADMIN_ID}',  NULL, 'org',    'org.admin',
         'Admin',         'Manage members, roles, SSO, and tenants',                true, false),
        ('{_ORG_MEMBER_ID}', NULL, 'org',    'org.member',
         'Member',        'Default org membership',                                 true, true),
        ('{_TN_ADMIN_ID}',   NULL, 'tenant', 'tenant.admin',
         'Tenant Admin',  'Full tenant control',                                    true, false),
        ('{_TN_EDITOR_ID}',  NULL, 'tenant', 'tenant.editor',
         'Tenant Editor', 'Read/write access to tenant resources',                  true, false),
        ('{_TN_VIEWER_ID}',  NULL, 'tenant', 'tenant.viewer',
         'Tenant Viewer', 'Read-only access to tenant resources',                   true, true)
    """)

    # ── Seed role → permission grants ─────────────────────────────────────
    op.execute(f"""
        INSERT INTO role_permissions (role_id, permission_id) VALUES
        -- org.admin
        ('{_ORG_ADMIN_ID}', 'org.settings.read'),
        ('{_ORG_ADMIN_ID}', 'org.settings.write'),
        ('{_ORG_ADMIN_ID}', 'org.members.invite'),
        ('{_ORG_ADMIN_ID}', 'org.members.remove'),
        ('{_ORG_ADMIN_ID}', 'org.roles.manage'),
        ('{_ORG_ADMIN_ID}', 'org.sso.configure'),
        ('{_ORG_ADMIN_ID}', 'org.billing.read'),
        ('{_ORG_ADMIN_ID}', 'org.audit_log.read'),
        ('{_ORG_ADMIN_ID}', 'org.tenants.create'),
        ('{_ORG_ADMIN_ID}', 'org.tenants.delete'),
        -- org.member (default)
        ('{_ORG_MEMBER_ID}', 'org.settings.read'),
        -- tenant.admin
        ('{_TN_ADMIN_ID}', 'tenant.settings.read'),
        ('{_TN_ADMIN_ID}', 'tenant.settings.write'),
        ('{_TN_ADMIN_ID}', 'tenant.members.invite'),
        ('{_TN_ADMIN_ID}', 'tenant.members.remove'),
        ('{_TN_ADMIN_ID}', 'catalog.items.read'),
        ('{_TN_ADMIN_ID}', 'catalog.source.toggle'),
        ('{_TN_ADMIN_ID}', 'catalog.source.configure'),
        ('{_TN_ADMIN_ID}', 'catalog.source.sync_now'),
        ('{_TN_ADMIN_ID}', 'mcp.project.read'),
        ('{_TN_ADMIN_ID}', 'mcp.project.write'),
        ('{_TN_ADMIN_ID}', 'mcp.project.publish'),
        ('{_TN_ADMIN_ID}', 'mcp.project.delete'),
        ('{_TN_ADMIN_ID}', 'mcp.invocations.read'),
        -- tenant.editor
        ('{_TN_EDITOR_ID}', 'tenant.settings.read'),
        ('{_TN_EDITOR_ID}', 'catalog.items.read'),
        ('{_TN_EDITOR_ID}', 'mcp.project.read'),
        ('{_TN_EDITOR_ID}', 'mcp.project.write'),
        -- tenant.viewer (default)
        ('{_TN_VIEWER_ID}', 'tenant.settings.read'),
        ('{_TN_VIEWER_ID}', 'catalog.items.read'),
        ('{_TN_VIEWER_ID}', 'mcp.project.read'),
        ('{_TN_VIEWER_ID}', 'mcp.invocations.read')
    """)


def downgrade() -> None:
    for tbl in (
        "audit_log", "org_email_domains", "org_sso_configs",
        "magic_links", "sessions", "tenant_memberships",
        "org_memberships", "role_permissions", "roles",
        "permissions", "org_tenants", "orgs",
    ):
        op.execute(f"DROP TABLE IF EXISTS {tbl} CASCADE")

    op.execute(
        "ALTER TABLE users ALTER COLUMN email TYPE varchar(255) USING email::varchar(255)"
    )
    for col in ("avatar_url", "last_login_at", "email_verified"):
        op.execute(f"ALTER TABLE users DROP COLUMN IF EXISTS {col}")
