"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { Search } from "lucide-react";
import { api, type AgentSchedule, type Agent } from "@/lib/api";
import { cn } from "@/lib/cn";

const STATUS_COLORS: Record<string, string> = {
  success: "text-emerald bg-emerald/10",
  failed:  "text-rose-400 bg-rose-400/10",
  running: "text-violet bg-violet/10",
  skipped: "text-text-3 bg-surface-2",
};

const TYPE_COLORS: Record<string, string> = {
  cron:     "text-cyan bg-cyan/10",
  interval: "text-amber bg-amber/10",
  once:     "text-violet bg-violet/10",
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function typeLabel(s: AgentSchedule): string {
  if (s.schedule_type === "cron")     return s.cron_expression ?? "cron";
  if (s.schedule_type === "interval") return `every ${s.interval_seconds}s`;
  return `once at ${fmtDate(s.run_at)}`;
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ schedules }: { schedules: AgentSchedule[] }) {
  const enabled  = schedules.filter((s) => s.enabled).length;
  const disabled = schedules.length - enabled;
  const failing  = schedules.filter((s) => s.last_run_status === "failed").length;

  return (
    <div className="flex gap-3 px-4 py-3 border-b border-border shrink-0">
      <Stat label="Total"    value={schedules.length} />
      <Stat label="Enabled"  value={enabled}  color="text-emerald" />
      <Stat label="Disabled" value={disabled} color="text-text-3" />
      {failing > 0 && <Stat label="Failing" value={failing} color="text-rose-400" />}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 flex-1">
      <span className={cn("text-base font-semibold tabular-nums", color ?? "text-text-1")}>{value}</span>
      <span className="text-[10px] text-text-3 uppercase tracking-widest">{label}</span>
    </div>
  );
}

// ── Schedule row ──────────────────────────────────────────────────────────────

function ScheduleRow({
  schedule,
  agentName,
  onToggle,
  onDelete,
  onTrigger,
  justTriggered,
}: {
  schedule: AgentSchedule;
  agentName: string;
  onToggle: () => void;
  onDelete: () => void;
  onTrigger: () => void;
  justTriggered: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className={cn(
      "rounded-xl border p-3 flex flex-col gap-2 transition-colors",
      schedule.enabled ? "border-border bg-surface-2/30" : "border-border/40 bg-surface-2/10 opacity-60",
    )}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-1 truncate">{schedule.name}</p>
          <p className="text-[10px] text-text-3 truncate mt-0.5">
            {agentName} · {typeLabel(schedule)} · {schedule.timezone}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide", TYPE_COLORS[schedule.schedule_type] ?? "text-text-3 bg-surface-2")}>
            {schedule.schedule_type}
          </span>
          {schedule.last_run_status && (
            <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide", STATUS_COLORS[schedule.last_run_status] ?? "")}>
              {schedule.last_run_status}
            </span>
          )}
        </div>
      </div>

      {/* Run stats */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <p className="text-[10px] text-text-3">Next run</p>
        <p className="text-[10px] text-text-2">{fmtDate(schedule.next_run_at)}</p>
        <p className="text-[10px] text-text-3">Last run</p>
        <p className="text-[10px] text-text-2">{fmtDate(schedule.last_run_at)}</p>
        <p className="text-[10px] text-text-3">Runs / failures</p>
        <p className="text-[10px] text-text-2">{schedule.run_count} / {schedule.failure_count}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 pt-1 border-t border-border/40">
        <button
          onClick={onToggle}
          className={cn(
            "px-2 py-1 rounded-lg text-[10px] font-medium transition-colors",
            schedule.enabled
              ? "bg-surface-2 text-text-3 hover:text-rose-400"
              : "bg-violet/10 text-violet hover:bg-violet/20",
          )}
        >
          {schedule.enabled ? "Disable" : "Enable"}
        </button>
        <button
          onClick={onTrigger}
          disabled={justTriggered}
          className="px-2 py-1 rounded-lg text-[10px] font-medium bg-emerald/10 text-emerald hover:bg-emerald/20 disabled:opacity-40 transition-colors"
        >
          {justTriggered ? "Triggered ✓" : "Run now"}
        </button>
        <div className="flex-1" />
        {confirmDelete ? (
          <>
            <button onClick={() => setConfirmDelete(false)} className="px-2 py-1 rounded-lg text-[10px] text-text-3 hover:text-text-2 transition-colors">Cancel</button>
            <button onClick={onDelete} className="px-2 py-1 rounded-lg text-[10px] font-medium bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors">Confirm</button>
          </>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="px-2 py-1 rounded-lg text-[10px] text-text-3 hover:text-rose-400 transition-colors">Delete</button>
        )}
      </div>
    </div>
  );
}

// ── AllSchedulesView ──────────────────────────────────────────────────────────

type Filter = "all" | "enabled" | "disabled" | "cron" | "interval" | "once";

interface AllSchedulesViewProps {
  agents: Agent[];
  orgKey: string | null;
}

export function AllSchedulesView({ agents, orgKey }: AllSchedulesViewProps) {
  const { data: schedules = [], mutate, isLoading } = useSWR(
    orgKey ? ["all-schedules", orgKey] : null,
    () => api.schedules.list(),
  );

  const [search,    setSearch]    = useState("");
  const [filter,    setFilter]    = useState<Filter>("all");
  const [triggered, setTriggered] = useState<string | null>(null);

  const agentMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of agents) m[a.id] = a.name;
    return m;
  }, [agents]);

  const filtered = useMemo(() => {
    let list = schedules as AgentSchedule[];
    if (filter === "enabled")  list = list.filter((s) => s.enabled);
    if (filter === "disabled") list = list.filter((s) => !s.enabled);
    if (filter === "cron")     list = list.filter((s) => s.schedule_type === "cron");
    if (filter === "interval") list = list.filter((s) => s.schedule_type === "interval");
    if (filter === "once")     list = list.filter((s) => s.schedule_type === "once");
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        (agentMap[s.agent_id] ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [schedules, filter, search, agentMap]);

  const handleToggle = async (id: string) => {
    try { await api.schedules.toggle(id); await mutate(); } catch { /* ignore */ }
  };

  const handleDelete = async (id: string) => {
    try { await api.schedules.delete(id); await mutate(); } catch { /* ignore */ }
  };

  const handleTrigger = async (id: string) => {
    try {
      await api.schedules.trigger(id);
      setTriggered(id);
      setTimeout(() => setTriggered(null), 3000);
    } catch { /* ignore */ }
  };

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all",      label: "All" },
    { key: "enabled",  label: "Enabled" },
    { key: "disabled", label: "Disabled" },
    { key: "cron",     label: "Cron" },
    { key: "interval", label: "Interval" },
    { key: "once",     label: "Once" },
  ];

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* Summary */}
      {(schedules as AgentSchedule[]).length > 0 && (
        <SummaryBar schedules={schedules as AgentSchedule[]} />
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-2 px-4 py-3 border-b border-border shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-3 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search schedules or agents…"
            className="w-full bg-surface-2 border border-border rounded-xl pl-8 pr-3 py-1.5 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-violet"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                filter === key
                  ? "bg-violet/15 text-violet"
                  : "bg-surface-2 text-text-3 hover:text-text-2",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
        {isLoading ? (
          <p className="text-xs text-text-3 text-center py-8">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            {(schedules as AgentSchedule[]).length === 0 ? (
              <>
                <p className="text-sm text-text-2">No schedules yet.</p>
                <p className="text-xs text-text-3">Open an agent and create a schedule from its Schedules tab.</p>
              </>
            ) : (
              <p className="text-sm text-text-3">No schedules match your filter.</p>
            )}
          </div>
        ) : (
          filtered.map((s) => (
            <ScheduleRow
              key={s.id}
              schedule={s}
              agentName={agentMap[s.agent_id] ?? "Unknown agent"}
              onToggle={() => handleToggle(s.id)}
              onDelete={() => handleDelete(s.id)}
              onTrigger={() => handleTrigger(s.id)}
              justTriggered={triggered === s.id}
            />
          ))
        )}
      </div>
    </div>
  );
}
