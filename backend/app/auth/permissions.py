"""Single source of truth for permission IDs.

Rule: never rename or delete a string after it ships — deprecate and add a new one instead.
"""


class P:
    # ── Org scope ─────────────────────────────────────────────────────────
    ORG_SETTINGS_READ    = "org.settings.read"
    ORG_SETTINGS_WRITE   = "org.settings.write"
    ORG_MEMBERS_INVITE   = "org.members.invite"
    ORG_MEMBERS_REMOVE   = "org.members.remove"
    ORG_ROLES_MANAGE     = "org.roles.manage"
    ORG_SSO_CONFIGURE    = "org.sso.configure"
    ORG_BILLING_READ     = "org.billing.read"
    ORG_BILLING_WRITE    = "org.billing.write"
    ORG_AUDIT_LOG_READ   = "org.audit_log.read"
    ORG_TENANTS_CREATE   = "org.tenants.create"
    ORG_TENANTS_DELETE   = "org.tenants.delete"

    # ── Tenant scope ──────────────────────────────────────────────────────
    TENANT_SETTINGS_READ  = "tenant.settings.read"
    TENANT_SETTINGS_WRITE = "tenant.settings.write"
    TENANT_MEMBERS_INVITE = "tenant.members.invite"
    TENANT_MEMBERS_REMOVE = "tenant.members.remove"

    # ── Catalog ───────────────────────────────────────────────────────────
    CATALOG_ITEMS_READ    = "catalog.items.read"
    CATALOG_SOURCE_TOGGLE = "catalog.source.toggle"
    CATALOG_SOURCE_CONFIG = "catalog.source.configure"
    CATALOG_SOURCE_SYNC   = "catalog.source.sync_now"

    # ── MCP builder ───────────────────────────────────────────────────────
    MCP_PROJECT_READ      = "mcp.project.read"
    MCP_PROJECT_WRITE     = "mcp.project.write"
    MCP_PROJECT_PUBLISH   = "mcp.project.publish"
    MCP_PROJECT_DELETE    = "mcp.project.delete"
    MCP_INVOCATIONS_READ  = "mcp.invocations.read"

    # ── Agent scheduling ──────────────────────────────────────────────────
    AGENT_SCHEDULE_READ    = "agent.schedule.read"
    AGENT_SCHEDULE_WRITE   = "agent.schedule.write"
    AGENT_SCHEDULE_DELETE  = "agent.schedule.delete"
    AGENT_SCHEDULE_TRIGGER = "agent.schedule.trigger"

    # ── Agent DB access policies ──────────────────────────────────────────
    AGENT_DB_POLICY_READ   = "agent.db_policy.read"
    AGENT_DB_POLICY_WRITE  = "agent.db_policy.write"
    AGENT_DB_POLICY_DELETE = "agent.db_policy.delete"
