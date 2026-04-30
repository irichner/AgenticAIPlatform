"use client";

import { useState } from "react";
import useSWR from "swr";
import { Eye, EyeOff, Loader2, Save, CheckCircle2 } from "lucide-react";
import { api, type PlatformSettingGroupOut, type PlatformSettingOut } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/cn";
import { removeOrgItem } from "@/lib/org-storage";

// ── Secret field with show/hide toggle ───────────────────────────────────────

function SecretInput({
  value,
  isSet,
  onChange,
  placeholder,
}: {
  value: string;
  isSet: boolean;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative flex items-center">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isSet && value === "" ? "••••••••  (saved)" : (placeholder ?? "")}
        className="w-full rounded-lg border border-border bg-surface-0 px-3 py-1.5 pr-9 text-sm
                   text-text-1 focus:outline-none focus:ring-2 focus:ring-violet/50 font-mono"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2.5 text-text-3 hover:text-text-2"
        tabIndex={-1}
      >
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

// ── Single setting row ────────────────────────────────────────────────────────

function SettingRow({
  setting,
  draft,
  onChange,
}: {
  setting: PlatformSettingOut;
  draft: string;
  onChange: (key: string, value: string) => void;
}) {
  const displayValue = setting.is_secret ? draft : (draft !== "" ? draft : (setting.value ?? ""));

  return (
    <div className="flex items-start gap-4 py-3 px-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-text-1">{setting.label}</span>
          {setting.is_set && (
            <span className="flex items-center gap-0.5 text-[10px] font-medium text-emerald-400">
              <CheckCircle2 size={10} />
              Set
            </span>
          )}
        </div>
        <p className="text-[11px] text-text-3 mb-1.5">{setting.description}</p>
        {setting.is_secret ? (
          <SecretInput
            value={draft}
            isSet={setting.is_set}
            onChange={(v) => onChange(setting.key, v)}
            placeholder={setting.label}
          />
        ) : (
          <input
            type="text"
            value={displayValue}
            onChange={(e) => onChange(setting.key, e.target.value)}
            placeholder={setting.label}
            className="w-full rounded-lg border border-border bg-surface-0 px-3 py-1.5 text-sm
                       text-text-1 focus:outline-none focus:ring-2 focus:ring-violet/50"
          />
        )}
      </div>
    </div>
  );
}

// ── Group card ────────────────────────────────────────────────────────────────

function SettingsGroup({
  group,
  drafts,
  onChange,
  onSave,
  saving,
  saved,
}: {
  group: PlatformSettingGroupOut;
  drafts: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onSave: (groupKey: string) => void;
  saving: boolean;
  saved: boolean;
}) {
  const isDirty = group.settings.some((s) => drafts[s.key] !== "");

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-1">{group.group_label}</h3>
        <button
          type="button"
          onClick={() => onSave(group.group)}
          disabled={saving || !isDirty}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
            isDirty
              ? "bg-violet text-white hover:opacity-90"
              : "bg-surface-2 text-text-3 cursor-not-allowed",
            saving && "opacity-50",
          )}
        >
          {saving ? (
            <Loader2 size={12} className="animate-spin" />
          ) : saved ? (
            <CheckCircle2 size={12} />
          ) : (
            <Save size={12} />
          )}
          {saved ? "Saved" : "Save"}
        </button>
      </div>

      <div className="glass rounded-2xl divide-y divide-border overflow-hidden">
        {group.settings.map((s) => (
          <SettingRow
            key={s.key}
            setting={s}
            draft={drafts[s.key] ?? ""}
            onChange={onChange}
          />
        ))}
      </div>
    </section>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function PlatformSettingsTab() {
  const { currentOrg } = useAuth();
  const orgId = currentOrg?.id ?? "";

  const { data: groups = [], mutate, isLoading } = useSWR(
    orgId ? ["platform-settings", orgId] : null,
    () => api.orgs.platformSettings.list(orgId),
  );

  // Track per-key draft values (empty string = no change)
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingGroup, setSavingGroup] = useState<string | null>(null);
  const [savedGroup, setSavedGroup] = useState<string | null>(null);

  function handleChange(key: string, value: string) {
    setDrafts((prev) => ({ ...prev, [key]: value }));
    setSavedGroup(null);
  }

  async function handleSave(groupKey: string) {
    if (!orgId) return;

    const group = groups.find((g) => g.group === groupKey);
    if (!group) return;

    // Only send keys that have been changed (draft !== "")
    const updates = group.settings
      .filter((s) => (drafts[s.key] ?? "") !== "")
      .map((s) => ({ key: s.key, value: drafts[s.key] }));

    if (updates.length === 0) return;

    setSavingGroup(groupKey);
    try {
      await api.orgs.platformSettings.update(orgId, updates);
      await mutate();
      // Clear drafts for this group's keys
      setDrafts((prev) => {
        const next = { ...prev };
        group.settings.forEach((s) => delete next[s.key]);
        return next;
      });
      setSavedGroup(groupKey);
      setTimeout(() => setSavedGroup(null), 2000);
    } finally {
      setSavingGroup(null);
    }
  }

  if (!orgId) return <p className="text-sm text-text-3 p-4">No org selected.</p>;

  return (
    <div className="max-w-2xl space-y-8">
      {/* Editable settings groups */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-text-3">
          <Loader2 size={14} className="animate-spin" /> Loading settings…
        </div>
      ) : (
        groups.map((group) => (
          <SettingsGroup
            key={group.group}
            group={group}
            drafts={drafts}
            onChange={handleChange}
            onSave={handleSave}
            saving={savingGroup === group.group}
            saved={savedGroup === group.group}
          />
        ))
      )}

      {/* Static platform info */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-text-1">Platform Info</h3>
          <p className="text-xs text-text-3 mt-0.5">Read-only system information.</p>
        </div>
        <div className="glass rounded-2xl divide-y divide-border">
          {[
            { label: "API base",   value: "/api" },
            { label: "Version",    value: "0.2.0" },
            { label: "Transport",  value: "streamable_http" },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-text-3">{label}</span>
              <span className="text-xs text-text-2 font-mono">{value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Danger zone */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-rose-400">Danger Zone</h3>
          <p className="text-xs text-text-3 mt-0.5">Irreversible actions — proceed carefully.</p>
        </div>
        <div className="glass rounded-2xl px-4 py-3 border border-rose-400/20 flex items-center justify-between">
          <div>
            <p className="text-sm text-text-1 font-medium">Clear chat history</p>
            <p className="text-xs text-text-3 mt-0.5">Removes all threads stored in this browser.</p>
          </div>
          <button
            onClick={() => { if (currentOrg) removeOrgItem(currentOrg.id, "threads"); window.location.reload(); }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 border border-rose-400/30 hover:bg-rose-400/10 transition-colors"
          >
            Clear
          </button>
        </div>
      </section>
    </div>
  );
}
