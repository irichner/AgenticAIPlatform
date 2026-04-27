"use client";

import { useState } from "react";
import useSWR from "swr";
import { Database, RefreshCw, Loader2, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { api, type CatalogSource, type SourceItemCount } from "@/lib/api";
import { cn } from "@/lib/cn";

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatusPill({ status }: { status: CatalogSource["last_sync_status"] }) {
  if (!status) return <span className="text-xs text-text-3">—</span>;
  const styles: Record<string, string> = {
    ok:           "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
    error:        "bg-rose-400/10    text-rose-400    border-rose-400/20",
    auth_failed:  "bg-amber-400/10   text-amber-400   border-amber-400/20",
    rate_limited: "bg-amber-400/10   text-amber-400   border-amber-400/20",
  };
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded-full border", styles[status] ?? styles.error)}>
      {status === "ok" ? "OK" : status.replace(/_/g, " ")}
    </span>
  );
}

function KindPill({ kind }: { kind: CatalogSource["kind"] }) {
  return (
    <span className={cn(
      "text-xs px-2 py-0.5 rounded-full border",
      kind === "models"
        ? "bg-violet/10 text-violet border-violet/20"
        : "bg-sky-400/10 text-sky-400 border-sky-400/20",
    )}>
      {kind === "models" ? "Models" : "MCP Servers"}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent",
        "transition-colors duration-200 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed",
        checked ? "bg-violet" : "bg-surface-3",
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow",
          "transform transition-transform duration-200",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}

function SourceRow({ source, onToggle, onSync }: {
  source: CatalogSource;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onSync: (id: string) => Promise<void>;
}) {
  const [toggling, setToggling] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const { data: countData } = useSWR<SourceItemCount>(
    `catalog-count-${source.id}`,
    () => api.catalog.sources.itemCount(source.id),
    { refreshInterval: 30_000 },
  );

  const handleToggle = async (val: boolean) => {
    setToggling(true);
    try { await onToggle(source.id, val); } finally { setToggling(false); }
  };

  const handleSync = async () => {
    setSyncing(true);
    try { await onSync(source.id); } finally { setSyncing(false); }
  };

  return (
    <div className="flex items-center gap-4 glass rounded-xl px-4 py-3">
      <Database className="w-4 h-4 text-text-3 shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-medium text-text-1">{source.display_name}</p>
          <KindPill kind={source.kind} />
        </div>
        <div className="flex items-center gap-3 text-xs text-text-3">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatRelativeTime(source.last_sync_at)}
          </span>
          {countData && (
            <span>{countData.count.toLocaleString()} items</span>
          )}
        </div>
      </div>

      <StatusPill status={source.last_sync_status} />

      <button
        onClick={handleSync}
        disabled={syncing || !source.enabled}
        title="Sync now"
        className="p-1.5 rounded-lg text-text-3 hover:text-violet hover:bg-violet/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {syncing
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <RefreshCw className="w-3.5 h-3.5" />
        }
      </button>

      <Toggle
        checked={source.enabled}
        onChange={handleToggle}
        disabled={toggling}
      />
    </div>
  );
}

export function CatalogSourcesTab() {
  const { data: sources = [], mutate, isLoading } = useSWR<CatalogSource[]>(
    "catalog-sources",
    () => api.catalog.sources.list(),
    { refreshInterval: 15_000 },
  );

  const handleToggle = async (id: string, enabled: boolean) => {
    // Optimistic update
    mutate(
      sources.map((s) => (s.id === id ? { ...s, enabled } : s)),
      false,
    );
    try {
      const updated = await api.catalog.sources.patch(id, { enabled });
      mutate(sources.map((s) => (s.id === id ? updated : s)), false);
    } catch {
      mutate(); // revert on error
    }
  };

  const handleSync = async (id: string) => {
    const updated = await api.catalog.sources.sync(id);
    mutate(sources.map((s) => (s.id === id ? updated : s)), false);
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-text-2">
          Control which external catalogs are indexed. Disabled sources are hidden from
          the model and MCP server browsers but their cached items are preserved.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-text-3 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading sources…
        </div>
      ) : sources.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-text-3">
          <Database className="w-8 h-8 opacity-40" />
          <p className="text-sm">No catalog sources configured.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-2 uppercase tracking-widest px-1">
            {sources.length} source{sources.length !== 1 ? "s" : ""}
            {" · "}
            {sources.filter((s) => s.enabled).length} enabled
          </p>
          <div className="space-y-2">
            {sources.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                onToggle={handleToggle}
                onSync={handleSync}
              />
            ))}
          </div>
        </div>
      )}

      <div className="glass rounded-2xl p-4 text-xs text-text-3 space-y-1">
        <p className="font-medium text-text-2">How syncing works</p>
        <p>Each source is polled on its own interval (default every 6 hours). Items are upserted — disabling a source hides its items immediately without deleting them, so re-enabling is instant.</p>
      </div>
    </div>
  );
}
