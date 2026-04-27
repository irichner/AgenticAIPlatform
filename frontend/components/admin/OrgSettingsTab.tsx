"use client";

import { useState } from "react";
import useSWR from "swr";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { MembersTab } from "./MembersTab";

export function OrgSettingsTab() {
  const { currentOrg, refresh } = useAuth();
  const orgId = currentOrg?.id ?? "";

  const { data: org, mutate } = useSWR(
    orgId ? `/orgs/${orgId}` : null,
    () => api.orgs.get(orgId),
  );

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  // sync form when org loads
  if (org && name === "") setName(org.name);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    try {
      await api.orgs.update(orgId, { name });
      mutate();
      refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!orgId) return <p className="text-sm text-text-3 p-4">No org selected.</p>;

  return (
    <div className="p-6 space-y-8 max-w-lg">
      <section>
        <h3 className="text-sm font-semibold text-text-1 mb-4">General</h3>
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-xs text-text-3 mb-1">Organization name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-0 px-3 py-1.5 text-sm
                         text-text-1 focus:outline-none focus:ring-2 focus:ring-violet/50"
            />
          </div>
          <div>
            <label className="block text-xs text-text-3 mb-1">Slug</label>
            <input
              value={org?.slug ?? ""}
              disabled
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm
                         text-text-3 cursor-not-allowed"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-violet px-4 py-2 text-sm
                       font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save
          </button>
        </form>
      </section>
    </div>
  );
}
