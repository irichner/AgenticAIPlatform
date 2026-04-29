"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, type AgentSchedule } from "@/lib/api";
import { cn } from "@/lib/cn";

const inputCls =
  "w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-violet";
const selectCls =
  "w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-1 outline-none focus:border-violet";
const labelCls = "text-xs font-medium text-text-3 uppercase tracking-widest";

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

interface ScheduleFormState {
  name: string;
  schedule_type: "cron" | "interval" | "once";
  cron_expression: string;
  interval_value: string;
  interval_unit: "minutes" | "hours" | "days";
  run_at: string;
  timezone: string;
  input_message: string;
  max_retries: string;
  enabled: boolean;
}

const defaultForm = (): ScheduleFormState => ({
  name: "",
  schedule_type: "cron",
  cron_expression: "0 8 * * 1-5",
  interval_value: "1",
  interval_unit: "hours",
  run_at: "",
  timezone: "UTC",
  input_message: "",
  max_retries: "0",
  enabled: true,
});

function intervalToSeconds(value: string, unit: string): number {
  const n = parseInt(value, 10) || 1;
  if (unit === "minutes") return n * 60;
  if (unit === "days") return n * 86400;
  return n * 3600; // hours
}

interface Props {
  agentId: string;
}

export function AgentSchedulesTab({ agentId }: Props) {
  const { data: schedules = [], mutate, isLoading } = useSWR(
    ["schedules", agentId],
    () => api.schedules.list(agentId),
  );

  const [creating, setCreating] = useState(false);
  const [form, setForm]         = useState<ScheduleFormState>(defaultForm());
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [triggered, setTriggered] = useState<string | null>(null);

  const set = <K extends keyof ScheduleFormState>(k: K, v: ScheduleFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload: Parameters<typeof api.schedules.create>[0] = {
        agent_id: agentId,
        name: form.name.trim(),
        schedule_type: form.schedule_type,
        timezone: form.timezone.trim() || "UTC",
        enabled: form.enabled,
        max_retries: parseInt(form.max_retries, 10) || 0,
        input_override: form.input_message.trim()
          ? { message: form.input_message.trim() }
          : undefined,
      };
      if (form.schedule_type === "cron")
        payload.cron_expression = form.cron_expression.trim();
      if (form.schedule_type === "interval")
        payload.interval_seconds = intervalToSeconds(form.interval_value, form.interval_unit);
      if (form.schedule_type === "once")
        payload.run_at = new Date(form.run_at).toISOString();

      await api.schedules.create(payload);
      await mutate();
      setCreating(false);
      setForm(defaultForm());
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-3">
          {schedules.length === 0 ? "No schedules yet." : `${schedules.length} schedule${schedules.length !== 1 ? "s" : ""}`}
        </p>
        <button
          onClick={() => { setCreating((v) => !v); setForm(defaultForm()); setError(null); }}
          className="text-xs text-violet hover:text-violet/80 transition-colors"
        >
          {creating ? "Cancel" : "+ New Schedule"}
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-xl border border-border bg-surface-2/50 p-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Name *</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Daily briefing" className={inputCls} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Type</label>
            <select value={form.schedule_type} onChange={(e) => set("schedule_type", e.target.value as ScheduleFormState["schedule_type"])} className={selectCls}>
              <option value="cron">Cron expression</option>
              <option value="interval">Interval (every N)</option>
              <option value="once">One-time</option>
            </select>
          </div>

          {form.schedule_type === "cron" && (
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Cron Expression</label>
              <input value={form.cron_expression} onChange={(e) => set("cron_expression", e.target.value)} placeholder="0 8 * * 1-5" className={inputCls} />
              <p className="text-[10px] text-text-3">Standard 5-field cron (minute hour dom month dow)</p>
            </div>
          )}

          {form.schedule_type === "interval" && (
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Every</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  value={form.interval_value}
                  onChange={(e) => set("interval_value", e.target.value)}
                  className={cn(inputCls, "w-20")}
                />
                <select value={form.interval_unit} onChange={(e) => set("interval_unit", e.target.value as ScheduleFormState["interval_unit"])} className={selectCls}>
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
              </div>
            </div>
          )}

          {form.schedule_type === "once" && (
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Run At</label>
              <input
                type="datetime-local"
                value={form.run_at}
                onChange={(e) => set("run_at", e.target.value)}
                className={inputCls}
              />
            </div>
          )}

          <div className="flex gap-2">
            <div className="flex flex-col gap-1.5 flex-1">
              <label className={labelCls}>Timezone</label>
              <input value={form.timezone} onChange={(e) => set("timezone", e.target.value)} placeholder="UTC" className={inputCls} />
            </div>
            <div className="flex flex-col gap-1.5 w-20">
              <label className={labelCls}>Retries</label>
              <select value={form.max_retries} onChange={(e) => set("max_retries", e.target.value)} className={selectCls}>
                {[0, 1, 2, 3, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Input message (optional)</label>
            <input
              value={form.input_message}
              onChange={(e) => set("input_message", e.target.value)}
              placeholder="Message to pass to the agent…"
              className={inputCls}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} className="accent-violet" />
            <span className="text-xs text-text-2">Enabled</span>
          </label>

          {error && <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>}

          <button
            onClick={handleCreate}
            disabled={saving || !form.name.trim()}
            className="w-full py-2 rounded-xl bg-violet/20 hover:bg-violet/35 disabled:opacity-40 text-violet text-sm font-medium transition-colors"
          >
            {saving ? "Creating…" : "Create Schedule"}
          </button>
        </div>
      )}

      {/* Schedule list */}
      {isLoading ? (
        <p className="text-xs text-text-3 text-center py-4">Loading…</p>
      ) : schedules.length === 0 && !creating ? (
        <div className="text-center py-8">
          <p className="text-sm text-text-3">No schedules yet.</p>
          <p className="text-xs text-text-3 mt-1">Create one to run this agent automatically.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {schedules.map((s: AgentSchedule) => (
            <ScheduleCard
              key={s.id}
              schedule={s}
              onToggle={() => handleToggle(s.id)}
              onDelete={() => handleDelete(s.id)}
              onTrigger={() => handleTrigger(s.id)}
              justTriggered={triggered === s.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleCard({
  schedule,
  onToggle,
  onDelete,
  onTrigger,
  justTriggered,
}: {
  schedule: AgentSchedule;
  onToggle: () => void;
  onDelete: () => void;
  onTrigger: () => void;
  justTriggered: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const typeLabel =
    schedule.schedule_type === "cron"
      ? schedule.cron_expression ?? "cron"
      : schedule.schedule_type === "interval"
      ? `every ${schedule.interval_seconds}s`
      : `once at ${fmtDate(schedule.run_at)}`;

  return (
    <div className={cn(
      "rounded-xl border p-3 flex flex-col gap-2 transition-colors",
      schedule.enabled ? "border-border bg-surface-2/30" : "border-border/40 bg-surface-2/10 opacity-60",
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-1 truncate">{schedule.name}</p>
          <p className="text-[10px] text-text-3 truncate mt-0.5">{typeLabel} · {schedule.timezone}</p>
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

      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <p className="text-[10px] text-text-3">Next run</p>
        <p className="text-[10px] text-text-2">{fmtDate(schedule.next_run_at)}</p>
        <p className="text-[10px] text-text-3">Last run</p>
        <p className="text-[10px] text-text-2">{fmtDate(schedule.last_run_at)}</p>
        <p className="text-[10px] text-text-3">Runs / failures</p>
        <p className="text-[10px] text-text-2">{schedule.run_count} / {schedule.failure_count}</p>
      </div>

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
