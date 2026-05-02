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

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function timeRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diffMs = new Date(iso).getTime() - Date.now();
  const abs    = Math.abs(diffMs);
  const future = diffMs > 0;
  const mins   = Math.floor(abs / 60_000);
  const hours  = Math.floor(abs / 3_600_000);
  const days   = Math.floor(abs / 86_400_000);
  if (abs < 30_000) return future ? "any moment" : "just now";
  if (mins  <  60)  return future ? `in ${mins}m`              : `${mins}m ago`;
  if (hours <  24)  return future ? `in ${hours}h ${mins % 60}m` : `${hours}h ago`;
  if (days  <   7)  return future ? `in ${days}d`              : `${days}d ago`;
  return fmtDate(iso);
}

function scheduleHumanLabel(s: AgentSchedule): string {
  if (s.schedule_type === "cron" && s.cron_expression) {
    const simple: Record<string, string> = {
      "*/5 * * * *":  "Every 5 minutes",
      "*/15 * * * *": "Every 15 minutes",
      "*/30 * * * *": "Every 30 minutes",
      "0 * * * *":    "Every hour",
      "0 */2 * * *":  "Every 2 hours",
      "0 */6 * * *":  "Every 6 hours",
      "0 */12 * * *": "Every 12 hours",
    };
    return simple[s.cron_expression] ?? s.cron_expression;
  }
  if (s.schedule_type === "interval" && s.interval_seconds != null) {
    const sec = s.interval_seconds;
    if (sec >= 86400 && sec % 86400 === 0) return `Every ${sec / 86400}d`;
    if (sec >= 3600  && sec % 3600  === 0) return `Every ${sec / 3600}h`;
    if (sec >= 60    && sec % 60    === 0) return `Every ${sec / 60}m`;
    return `Every ${sec}s`;
  }
  if (s.schedule_type === "once") return `Once: ${fmtDate(s.run_at)}`;
  return "—";
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

// ── RunMini — compact next/last run display ────────────────────────────────────

function RunMini({ label, iso, status }: {
  label: string;
  iso: string | null | undefined;
  status?: string | null;
}) {
  const isNextRun = label === "Next run";
  const isPast    = !!iso && new Date(iso).getTime() <= Date.now();
  const valueCls  =
    status === "success" ? "text-emerald" :
    status === "failed"  ? "text-rose-400" :
    "text-text-1";

  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[9px] font-semibold text-text-3 uppercase tracking-widest">{label}</p>
      <p className={cn("text-xs font-semibold tabular-nums", valueCls)}>
        {iso
          ? (isNextRun && isPast ? "Due soon" : timeRelative(iso))
          : (isNextRun ? "Paused" : "Never")}
      </p>
      {iso && !(isNextRun && isPast) && (
        <p className="text-[9px] text-text-3">{fmtDate(iso)}</p>
      )}
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
  const hasFailed = schedule.failure_count > 0;
  const dotCls =
    !schedule.enabled            ? "bg-text-3/40" :
    schedule.last_run_status === "running" ? "bg-violet animate-pulse" :
    schedule.last_run_status === "failed"  ? "bg-rose-400" :
    schedule.last_run_status === "success" ? "bg-emerald" :
    "bg-violet/50";

  return (
    <div className={cn(
      "rounded-xl border flex flex-col gap-0 transition-all",
      schedule.enabled
        ? "border-border bg-surface-2/20 hover:border-border/80"
        : "border-border/40 bg-surface-2/10 opacity-60",
    )}>
      <div className="p-3.5 flex flex-col gap-3">
        {/* Name + agent + status */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <span className={cn("w-1.5 h-1.5 rounded-full mt-[5px] shrink-0", dotCls)} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-1 truncate leading-snug">
                {schedule.name}
              </p>
              <p className="text-[10px] text-text-3 truncate mt-0.5">
                {agentName} · {scheduleHumanLabel(schedule)}
              </p>
            </div>
          </div>
          {schedule.last_run_status && (
            <span className={cn(
              "text-[9px] px-1.5 py-0.5 rounded-md font-semibold uppercase tracking-wide shrink-0 mt-0.5",
              STATUS_COLORS[schedule.last_run_status] ?? "text-text-3 bg-surface-2",
            )}>
              {schedule.last_run_status}
            </span>
          )}
        </div>

        {/* Next / Last run inline */}
        <div className="flex gap-6">
          <RunMini
            label="Next run"
            iso={schedule.enabled ? schedule.next_run_at : null}
          />
          <RunMini
            label="Last run"
            iso={schedule.last_run_at}
            status={schedule.last_run_status}
          />
          <div className="flex flex-col gap-0.5">
            <p className="text-[9px] font-semibold text-text-3 uppercase tracking-widest">Runs</p>
            <p className="text-xs font-semibold text-text-2 tabular-nums">
              {schedule.run_count}
              {hasFailed && (
                <span className="text-rose-400 ml-1">· {schedule.failure_count}f</span>
              )}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 pt-1 border-t border-border/40">
          <button
            onClick={onToggle}
            className={cn(
              "px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors",
              schedule.enabled
                ? "bg-surface-2 text-text-3 hover:bg-rose-500/10 hover:text-rose-400"
                : "bg-violet/10 text-violet hover:bg-violet/20",
            )}
          >
            {schedule.enabled ? "Disable" : "Enable"}
          </button>
          <button
            onClick={onTrigger}
            disabled={justTriggered}
            className={cn(
              "px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors disabled:opacity-60",
              justTriggered ? "bg-emerald/15 text-emerald" : "bg-emerald/8 text-emerald hover:bg-emerald/20",
            )}
          >
            {justTriggered ? "Triggered ✓" : "Run now"}
          </button>
          <div className="flex-1" />
          {confirmDelete ? (
            <>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 rounded-lg text-[10px] text-text-3 hover:text-text-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onDelete}
                className="px-2 py-1 rounded-lg text-[10px] font-medium bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors"
              >
                Confirm delete
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-2 py-1 rounded-lg text-[10px] text-text-3 hover:text-rose-400 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
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
    { key: "cron",     label: "Recurring" },
    { key: "once",     label: "One-time" },
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
