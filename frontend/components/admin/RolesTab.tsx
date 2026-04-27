"use client";

import { useState } from "react";
import useSWR from "swr";
import { Plus, Save, Loader2, Shield, Lock } from "lucide-react";
import { api, type RoleOut, type PermissionOut } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/cn";

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
      next.has(permId) ? next.delete(permId) : next.add(permId);
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

  // Group permissions by resource
  const permsByResource = (allPerms ?? []).reduce<Record<string, PermissionOut[]>>((acc, p) => {
    const key = `${p.scope}/${p.resource}`;
    (acc[key] ??= []).push(p);
    return acc;
  }, {});

  const visiblePerms = selected
    ? Object.entries(permsByResource).filter(([key]) => key.startsWith(selected.scope + "/"))
    : [];

  const isDirty =
    selected &&
    !selected.is_system &&
    JSON.stringify([...pendingPerms].sort()) !==
      JSON.stringify([...selected.permissions].sort());

  if (!orgId) return <p className="text-sm text-text-3 p-4">No org selected.</p>;

  return (
    <div className="flex gap-4 p-6 h-full min-h-0">
      {/* Left: role list */}
      <div className="w-56 shrink-0 space-y-1">
        <p className="text-xs font-semibold text-text-3 uppercase tracking-wide mb-2">Roles</p>
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
              {r.is_system ? <Lock size={12} className="shrink-0 text-text-3" /> : <Shield size={12} className="shrink-0" />}
              <span className="truncate">{r.name}</span>
            </button>
          ))
        )}

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

      {/* Right: permission editor */}
      <div className="flex-1 min-w-0 bg-surface-1 rounded-lg border border-border overflow-auto">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-sm text-text-3">
            Select a role to view its permissions
          </div>
        ) : (
          <div className="p-4">
            <div className="flex items-start justify-between mb-4">
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
                </p>
              </div>
              {isDirty && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg bg-violet px-3 py-1.5 text-sm
                             font-semibold text-white hover:opacity-90 disabled:opacity-50 sticky top-0"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save
                </button>
              )}
            </div>

            <div className="space-y-4">
              {visiblePerms.map(([groupKey, perms]) => {
                const [, resource] = groupKey.split("/");
                return (
                  <div key={groupKey}>
                    <p className="text-xs font-semibold text-text-3 uppercase tracking-wide mb-2">
                      {resource}
                    </p>
                    <div className="space-y-1">
                      {perms.map((p) => (
                        <label
                          key={p.id}
                          className={cn(
                            "flex items-center gap-3 rounded px-3 py-2 cursor-pointer",
                            selected.is_system ? "opacity-60 cursor-not-allowed" : "hover:bg-surface-2",
                          )}
                        >
                          <input
                            type="checkbox"
                            disabled={selected.is_system || p.system_only}
                            checked={pendingPerms.has(p.id)}
                            onChange={() => togglePerm(p.id)}
                            className="accent-violet"
                          />
                          <span className="flex-1 text-sm text-text-1">{p.description}</span>
                          <span className="text-xs text-text-3 font-mono">{p.id}</span>
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
