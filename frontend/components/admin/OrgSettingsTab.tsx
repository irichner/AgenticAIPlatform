"use client";

import { useState, useRef } from "react";
import useSWR from "swr";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth";

function toSlug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);
}

export function OrgSettingsTab() {
  const { currentOrg, refresh } = useAuth();
  const orgId = currentOrg?.id ?? "";

  const { data: org, mutate } = useSWR(
    orgId ? `/orgs/${orgId}` : null,
    () => api.orgs.get(orgId),
  );

  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sync form when org loads (only on first load)
  if (org && name === "") setName(org.name);
  if (org && logoUrl === null && org.logo_url !== undefined) setLogoUrl(org.logo_url);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    setLogoError("");
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setLogoError("Logo must be under 2 MB."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setLogoUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    try {
      await api.orgs.update(orgId, { name: name.trim(), logo_url: logoUrl });
      await mutate();
      refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!orgId) return <p className="text-sm text-text-3 p-4">No org selected.</p>;

  return (
    <div className="p-6 space-y-8 max-w-lg">
      <form onSubmit={handleSave} className="space-y-5">
        <h3 className="text-sm font-semibold text-text-1">Identity</h3>

        {/* Logo */}
        <div>
          <label className="block text-xs text-text-3 mb-2">Logo</label>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-xl border border-border bg-surface-0 flex items-center justify-center overflow-hidden shrink-0">
              {logoUrl
                ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
                : <div className="w-full h-full bg-gradient-to-br from-violet to-cyan flex items-center justify-center">
                    <span className="text-xl font-black text-white">
                      {name ? name[0].toUpperCase() : "L"}
                    </span>
                  </div>
              }
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="text-xs text-violet hover:underline"
                >
                  {logoUrl ? "Change" : "Upload logo"}
                </button>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={() => setLogoUrl(null)}
                    className="text-xs text-text-3 hover:text-text-2"
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="text-xs text-text-3">PNG, JPG or SVG — max 2 MB</p>
              {logoError && <p className="text-xs text-red-400">{logoError}</p>}
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
        </div>

        {/* Name */}
        <div>
          <label className="block text-xs text-text-3 mb-1">Organization name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-0 px-3 py-1.5 text-sm
                       text-text-1 focus:outline-none focus:ring-2 focus:ring-violet/50"
          />
        </div>

        {/* Slug (read-only) */}
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
    </div>
  );
}
