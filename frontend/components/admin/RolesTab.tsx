"use client";

import { useState } from "react";
import useSWR from "swr";
import { Plus, Save, Loader2, Shield, Lock } from "lucide-react";
import { api, type RoleOut, type PermissionOut } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/cn";

// Human-readable labels for resource groups
const RESOURCE_LABELS: Record<string, string> = {
  "agent":        "Agents",
  "workflow":     "Workflows",
  "approval":     "Approvals",
  "settings":     "Settings",
  "members":      "Members",
  "roles":        "Roles",
  "sso":          "SSO",
  "billing":      "Billing",
  "audit_log":    "Audit Log",
  "tenants":      "Workspaces",
  "items":        "Catalog Items",
  "source":       "Catalog Sources",
  "project":      "MCP Projects",
  "invocations":  "MCP Invocations",
  "schedule":     "Agent Schedules",
  "db_policy":    "DB Access Policies",
};

// Display label for individual permission actions
function actionLabel(permId: string): string {
  const action = permId.split(".").pop() ?? permId;
  const map: Record<string, string> = {
    read: "Read", write: "Write", create: "Create", update: "Update",
    delete: "Delete", invite: "Invite", remove: "Remove", manage: "Manage",
    configure: "Configure", toggle: "Toggle", sync_now: "Sync",
    publish: "Publish", trigger: "Trigger",
  };
  return map[action] ?? action.charAt(0).toUpperCase() + action.slice(1);
}

// Preferred action ordering within a resource card
const ACTION_ORDER = ["read", "create", "update", "write", "delete", "invite", "remove", "manage", "configure", "toggle", "sync_now", "publish", "trigger"];

function sortPerms(perms: PermissionOut[]): PermissionOut[] {
  return [...perms].sort((a, b) => {
    const ai = ACTION_ORDER.indexOf(a.id.split(".").pop() ?? "");
    const bi = ACTION_ORDER.indexOf(b.id.split(".").pop() ?? "");
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

export function RolesTab() {
  const { currentOrg } = useAuth();
  const orgId = currentOrg?.id ?? "";

  const { data: roles, mutate: mutateRoles, isLoading } = useSWR(
    orgId ? `/orgs/${orgId}/roles` : null,
    () => api.orgs.roles.list(orgId),
  );
  const { data: allPerms } = useSWR(
    orgId ? `/orgs/${orgId}/permissions` : null,
    () => api.orgs.roles.permissions(orgId),
  );

  const [selected, setSelected] = useState<RoleOut | null>(null);
  const [pendingPerms, setPendingPerms] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newRole, setNewRole] = useState({ scope: "org", key: "", name: "" });

  function selectRole(role: RoleOut) {
    setSelected(role);
    setPendingPerms(new Set(role.permissions));
  }

  function togglePerm(permId: string) {
    setPendingPerms((prev) => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId); else next.add(permId);
      return next;
    });
  }

  async function handleSave() {
    if (!selected || selected.is_system || !orgId) return;
    setSaving(true);
    try {
      const updated = await api.orgs.roles.update(orgId, selected.id, {
        permission_ids: Array.from(pendingPerms),
      });
      setSelected(updated);
      mutateRoles();
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setCreating(true);
    try {
      const created = await api.orgs.roles.create(orgId, {
        scope: newRole.scope,
        key: newRole.key,
        name: newRole.name,
        permission_ids: [],
      });
      mutateRoles();
      setNewRole({ scope: "org", key: "", name: "" });
      selectRole(created);
    } finally {
      setCreating(false);
    }
  }

  // Group permissions by resource, filtered to the selected role's scope
  const permsByResource = (allPerms ?? [])
    .filter((p) => !selected || p.scope === selected.scope)
    .reduce<Record<string, PermissionOut[]>>((acc, p) => {
      (acc[p.resource] ??= []).push(p);
      return acc;
    }, {});

  const isDirty =
    selected &&
    !selected.is_system &&
    JSON.stringify([...pendingPerms].sort()) !==
      JSON.stringify([...selected.permissions].sort());

  if (!orgId) return <p className="text-sm text-text-3 p-4">No org selected.</p>;

  return (
    <div className="flex gap-4 p-6 h-full min-h-0">
      {/* Left: role list */}
      <div className="w-56 shrink-0 flex flex-col gap-0">
        <p className="text-xs font-semibold text-text-3 uppercase tracking-wide mb-2">Roles</p>
        <div className="space-y-1 flex-1">
          {isLoading ? (
            <Loader2 className="animate-spin text-text-3" size={16} />
          ) : (
            (roles ?? []).map((r) => (
              <button
                key={r.id}
                onClick={() => selectRole(r)}
                className={cn(
                  "w-full text-left rounded-lg px-3 py-2 text-sm transition flex items-center gap-2",
                  selected?.id === r.id
                    ? "bg-violet/10 text-violet"
                    : "text-text-2 hover:bg-surface-2",
                )}
              >
                {r.is_system
                  ? <Lock size={12} className="shrink-0 text-text-3" />
                  : <Shield size={12} className="shrink-0" />}
                <span className="truncate">{r.name}</span>
              </button>
            ))
          )}
        </div>

        {/* Create new role */}
        <form onSubmit={handleCreate} className="mt-4 space-y-2 border-t border-border pt-3">
          <p className="text-xs font-semibold text-text-3">New custom role</p>
          <select
            value={newRole.scope}
            onChange={(e) => setNewRole((p) => ({ ...p, scope: e.target.value }))}
            className="w-full rounded border border-border bg-surface-0 px-2 py-1 text-xs text-text-2"
          >
            <option value="org">Org scope</option>
            <option value="tenant">Tenant scope</option>
          </select>
          <input
            required
            value={newRole.key}
            onChange={(e) => setNewRole((p) => ({ ...p, key: e.target.value }))}
            placeholder="e.g. org.analyst"
            className="w-full rounded border border-border bg-surface-0 px-2 py-1 text-xs text-text-1 placeholder-text-3"
          />
          <input
            required
            value={newRole.name}
            onChange={(e) => setNewRole((p) => ({ ...p, name: e.target.value }))}
            placeholder="Display name"
            className="w-full rounded border border-border bg-surface-0 px-2 py-1 text-xs text-text-1 placeholder-text-3"
          />
          <button
            type="submit"
            disabled={creating}
            className="w-full flex items-center justify-center gap-1.5 rounded bg-violet/10
                       text-violet text-xs font-medium py-1.5 hover:bg-violet/20 disabled:opacity-50"
          >
            {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            Create
          </button>
        </form>
      </div>

      {/* Right: permission grid */}
      <div className="flex-1 min-w-0 bg-surface-1 rounded-lg border border-border overflow-auto">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-sm text-text-3">
            Select a role to view its permissions
          </div>
        ) : (
          <div className="p-5">
            {/* Header */}
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="font-semibold text-text-1 flex items-center gap-2">
                  {selected.name}
                  {selected.is_system && (
                    <span className="text-xs bg-surface-2 text-text-3 px-1.5 py-0.5 rounded">
                      system
                    </span>
                  )}
                </h3>
                <p className="text-xs text-text-3 mt-0.5">
                  {selected.scope}-scoped · {selected.key}
                  {selected.is_system && " · read-only"}
                </p>
              </div>
              {isDirty && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg bg-violet px-3 py-1.5 text-sm
                             font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save changes
                </button>
              )}
            </div>

            {/* Permission card grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {Object.entries(permsByResource).map(([resource, perms]) => {
                const sorted = sortPerms(perms);
                const allGranted = sorted.every((p) => pendingPerms.has(p.id));
                const someGranted = sorted.some((p) => pendingPerms.has(p.id));

                return (
                  <div
                    key={resource}
                    className="rounded-lg border border-border bg-surface-0 p-3 flex flex-col gap-2"
                  >
                    {/* Card header with "select all" toggle */}
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-text-2 uppercase tracking-wide">
                        {RESOURCE_LABELS[resource] ?? resource}
                      </p>
                      {!selected.is_system && (
                        <button
                          onClick={() => {
                            setPendingPerms((prev) => {
                              const next = new Set(prev);
                              if (allGranted) {
                                sorted.forEach((p) => next.delete(p.id));
                              } else {
                                sorted.forEach((p) => next.add(p.id));
                              }
                              return next;
                            });
                          }}
                          className="text-[10px] text-text-3 hover:text-violet transition-colors"
                        >
                          {allGranted ? "Remove all" : someGranted ? "Grant all" : "Grant all"}
                        </button>
                      )}
                    </div>

                    {/* Permission checkboxes */}
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                      {sorted.map((p) => (
                        <label
                          key={p.id}
                          className={cn(
                            "flex items-center gap-1.5 cursor-pointer select-none",
                            (selected.is_system || p.system_only) && "opacity-50 cursor-not-allowed",
                          )}
                        >
                          <input
                            type="checkbox"
                            disabled={selected.is_system || p.system_only}
                            checked={pendingPerms.has(p.id)}
                            onChange={() => togglePerm(p.id)}
                            className="accent-violet shrink-0"
                          />
                          <span className="text-xs text-text-1 leading-tight">
                            {actionLabel(p.id)}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
