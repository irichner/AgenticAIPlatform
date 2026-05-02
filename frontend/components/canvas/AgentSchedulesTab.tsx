"use client";

import { useState } from "react";
import useSWR from "swr";
import { Clock, Calendar, AlarmClock } from "lucide-react";
import { api, type AgentSchedule } from "@/lib/api";
import { cn } from "@/lib/cn";

const inputCls =
  "w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-violet";
const selectCls =
  "bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-1 outline-none focus:border-violet";
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

const TIMEZONES = [
  "UTC","America/New_York","America/Chicago","America/Denver","America/Los_Angeles",
  "America/Anchorage","America/Honolulu","America/Toronto","America/Vancouver",
  "America/Mexico_City","America/Bogota","America/Lima","America/Sao_Paulo",
  "America/Argentina/Buenos_Aires","America/Santiago","Europe/London","Europe/Dublin",
  "Europe/Lisbon","Europe/Paris","Europe/Berlin","Europe/Amsterdam","Europe/Brussels",
  "Europe/Madrid","Europe/Rome","Europe/Zurich","Europe/Stockholm","Europe/Oslo",
  "Europe/Copenhagen","Europe/Helsinki","Europe/Warsaw","Europe/Prague","Europe/Vienna",
  "Europe/Budapest","Europe/Bucharest","Europe/Athens","Europe/Istanbul","Europe/Kiev",
  "Europe/Moscow","Africa/Cairo","Africa/Johannesburg","Africa/Nairobi","Africa/Lagos",
  "Asia/Dubai","Asia/Riyadh","Asia/Karachi","Asia/Kolkata","Asia/Dhaka","Asia/Bangkok",
  "Asia/Singapore","Asia/Kuala_Lumpur","Asia/Jakarta","Asia/Hong_Kong","Asia/Shanghai",
  "Asia/Taipei","Asia/Seoul","Asia/Tokyo","Asia/Vladivostok","Australia/Perth",
  "Australia/Adelaide","Australia/Sydney","Australia/Melbourne","Pacific/Auckland",
  "Pacific/Honolulu","Pacific/Fiji",
];

// ── Frequency builder ──────────────────────────────────────────────────────────

type FreqId =
  | "5min" | "15min" | "30min"
  | "1h" | "2h" | "6h" | "12h"
  | "daily" | "weekdays" | "weekly" | "monthly" | "custom";

interface FreqOption {
  id: FreqId;
  label: string;
  needsTime: boolean;
  needsDays: boolean;
  needsMonthDay: boolean;
  toExpr: (c: CronConfig) => string;
}

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const FREQ_OPTIONS: FreqOption[] = [
  { id: "5min",     label: "Every 5 min",    needsTime: false, needsDays: false, needsMonthDay: false, toExpr: () => "*/5 * * * *" },
  { id: "15min",    label: "Every 15 min",   needsTime: false, needsDays: false, needsMonthDay: false, toExpr: () => "*/15 * * * *" },
  { id: "30min",    label: "Every 30 min",   needsTime: false, needsDays: false, needsMonthDay: false, toExpr: () => "*/30 * * * *" },
  { id: "1h",       label: "Every hour",     needsTime: false, needsDays: false, needsMonthDay: false, toExpr: () => "0 * * * *" },
  { id: "2h",       label: "Every 2 hours",  needsTime: false, needsDays: false, needsMonthDay: false, toExpr: () => "0 */2 * * *" },
  { id: "6h",       label: "Every 6 hours",  needsTime: false, needsDays: false, needsMonthDay: false, toExpr: () => "0 */6 * * *" },
  { id: "12h",      label: "Every 12 hours", needsTime: false, needsDays: false, needsMonthDay: false, toExpr: () => "0 */12 * * *" },
  { id: "daily",    label: "Daily",          needsTime: true,  needsDays: false, needsMonthDay: false, toExpr: (c) => `${c.minute} ${c.hour} * * *` },
  { id: "weekdays", label: "Weekdays",       needsTime: true,  needsDays: false, needsMonthDay: false, toExpr: (c) => `${c.minute} ${c.hour} * * 1-5` },
  { id: "weekly",   label: "Weekly",         needsTime: true,  needsDays: true,  needsMonthDay: false, toExpr: (c) => `${c.minute} ${c.hour} * * ${c.weekdays.length > 0 ? c.weekdays.slice().sort((a,b)=>a-b).join(",") : "1"}` },
  { id: "monthly",  label: "Monthly",        needsTime: true,  needsDays: false, needsMonthDay: true,  toExpr: (c) => `${c.minute} ${c.hour} ${c.monthDay} * *` },
  { id: "custom",   label: "Custom",         needsTime: false, needsDays: false, needsMonthDay: false, toExpr: (c) => c.customExpr || "0 9 * * 1-5" },
];

interface CronConfig {
  freq: FreqId;
  hour: number;
  minute: number;
  weekdays: number[];
  monthDay: number;
  customExpr: string;
}

const defaultCronConfig = (): CronConfig => ({
  freq: "daily",
  hour: 9,
  minute: 0,
  weekdays: [1],
  monthDay: 1,
  customExpr: "0 9 * * 1-5",
});

function buildCronExpr(cfg: CronConfig): string {
  const opt = FREQ_OPTIONS.find((f) => f.id === cfg.freq);
  return opt ? opt.toExpr(cfg) : cfg.customExpr;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function fmt12h(hour: number, minute: number): string {
  const ampm = hour < 12 ? "AM" : "PM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${String(minute).padStart(2, "0")} ${ampm}`;
}

function describeCronConfig(cfg: CronConfig, tz: string): string {
  const opt = FREQ_OPTIONS.find((f) => f.id === cfg.freq);
  if (!opt) return buildCronExpr(cfg);
  const time = opt.needsTime ? ` at ${fmt12h(cfg.hour, cfg.minute)}` : "";
  const tzSuffix = tz === "UTC" ? " UTC" : ` (${tz.split("/").pop()?.replace(/_/g, " ")})`;
  switch (cfg.freq) {
    case "5min":     return `Every 5 minutes${tzSuffix}`;
    case "15min":    return `Every 15 minutes${tzSuffix}`;
    case "30min":    return `Every 30 minutes${tzSuffix}`;
    case "1h":       return `Every hour${tzSuffix}`;
    case "2h":       return `Every 2 hours${tzSuffix}`;
    case "6h":       return `Every 6 hours${tzSuffix}`;
    case "12h":      return `Every 12 hours${tzSuffix}`;
    case "daily":    return `Every day${time}${tzSuffix}`;
    case "weekdays": return `Mon – Fri${time}${tzSuffix}`;
    case "weekly": {
      const days = cfg.weekdays.length > 0
        ? cfg.weekdays.slice().sort((a, b) => a - b).map((d) => DOW_LABELS[d]).join(", ")
        : "Monday";
      return `Every ${days}${time}${tzSuffix}`;
    }
    case "monthly":  return `Monthly on the ${ordinal(cfg.monthDay)}${time}${tzSuffix}`;
    case "custom":   return cfg.customExpr;
  }
}

function describeCronExpr(expr: string, tz: string): string {
  const simple: Record<string, string> = {
    "*/5 * * * *":  "Every 5 minutes",
    "*/15 * * * *": "Every 15 minutes",
    "*/30 * * * *": "Every 30 minutes",
    "0 * * * *":    "Every hour",
    "0 */2 * * *":  "Every 2 hours",
    "0 */6 * * *":  "Every 6 hours",
    "0 */12 * * *": "Every 12 hours",
  };
  if (simple[expr]) return simple[expr];

  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [min, hour, dom, , dow] = parts;
  const tzSuffix = tz === "UTC" ? " UTC" : ` (${tz.split("/").pop()?.replace(/_/g, " ")})`;

  if (!isNaN(Number(hour)) && !isNaN(Number(min))) {
    const timeStr = fmt12h(parseInt(hour), parseInt(min));
    if (dow === "1-5") return `Weekdays at ${timeStr}${tzSuffix}`;
    if (dom !== "*") return `Monthly on the ${ordinal(parseInt(dom))} at ${timeStr}${tzSuffix}`;
    if (dow !== "*") {
      const dayNames = dow.split(",").map((d) => DOW_LABELS[parseInt(d)] ?? d).join(", ");
      return `Every ${dayNames} at ${timeStr}${tzSuffix}`;
    }
    return `Daily at ${timeStr}${tzSuffix}`;
  }
  return `${expr}${tzSuffix}`;
}

function fmtInterval(seconds: number | undefined | null): string {
  const s = seconds ?? 0;
  if (s >= 86400 && s % 86400 === 0) { const d = s / 86400; return `Every ${d} day${d !== 1 ? "s" : ""}`; }
  if (s >= 3600  && s % 3600 === 0)  { const h = s / 3600;  return `Every ${h} hour${h !== 1 ? "s" : ""}`; }
  if (s >= 60    && s % 60 === 0)    { const m = s / 60;    return `Every ${m} minute${m !== 1 ? "s" : ""}`; }
  return `Every ${s}s`;
}

// ── Parse existing schedule back to form state ─────────────────────────────────

function cronToCronConfig(expr: string): CronConfig {
  const simple: Record<string, FreqId> = {
    "*/5 * * * *":  "5min",
    "*/15 * * * *": "15min",
    "*/30 * * * *": "30min",
    "0 * * * *":    "1h",
    "0 */2 * * *":  "2h",
    "0 */6 * * *":  "6h",
    "0 */12 * * *": "12h",
  };
  if (simple[expr]) return { freq: simple[expr], hour: 9, minute: 0, weekdays: [1], monthDay: 1, customExpr: expr };

  const parts = expr.trim().split(/\s+/);
  if (parts.length === 5) {
    const [minStr, hourStr, domStr, , dowStr] = parts;
    const min  = parseInt(minStr, 10);
    const hour = parseInt(hourStr, 10);
    if (!isNaN(min) && !isNaN(hour)) {
      if (dowStr === "1-5") return { freq: "weekdays", hour, minute: min, weekdays: [1,2,3,4,5], monthDay: 1, customExpr: expr };
      if (domStr !== "*" && !isNaN(parseInt(domStr, 10)))
        return { freq: "monthly", hour, minute: min, weekdays: [1], monthDay: parseInt(domStr, 10), customExpr: expr };
      if (dowStr !== "*") {
        const days = dowStr.split(",").map((d) => parseInt(d, 10)).filter((d) => !isNaN(d));
        if (days.length > 0) return { freq: "weekly", hour, minute: min, weekdays: days, monthDay: 1, customExpr: expr };
      }
      return { freq: "daily", hour, minute: min, weekdays: [1], monthDay: 1, customExpr: expr };
    }
  }
  return { freq: "custom", hour: 9, minute: 0, weekdays: [1], monthDay: 1, customExpr: expr };
}

function secondsToIntervalForm(seconds: number | null): { value: string; unit: "minutes" | "hours" | "days" } {
  const s = seconds ?? 3600;
  if (s >= 86400 && s % 86400 === 0) return { value: String(s / 86400), unit: "days" };
  if (s >= 3600  && s % 3600 === 0)  return { value: String(s / 3600), unit: "hours" };
  return { value: String(Math.max(1, Math.round(s / 60))), unit: "minutes" };
}

function scheduleToForm(s: AgentSchedule): ScheduleFormState {
  const iv = secondsToIntervalForm(s.interval_seconds ?? null);
  return {
    name:           s.name,
    schedule_type:  s.schedule_type,
    cronConfig:     s.cron_expression ? cronToCronConfig(s.cron_expression) : defaultCronConfig(),
    interval_value: iv.value,
    interval_unit:  iv.unit,
    run_at:         s.run_at ? new Date(s.run_at).toISOString().slice(0, 16) : "",
    timezone:       s.timezone || "UTC",
    max_retries:    String(s.max_retries ?? 0),
    enabled:        s.enabled,
  };
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

// ── Time picker sub-component ──────────────────────────────────────────────────

function TimePicker({ hour, minute, onChange }: {
  hour: number;
  minute: number;
  onChange: (h: number, m: number) => void;
}) {
  const ampm = hour < 12 ? "AM" : "PM";
  const h12  = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;

  const setHour12 = (v: number) => {
    const h24 = ampm === "PM" ? (v === 12 ? 12 : v + 12) : (v === 12 ? 0 : v);
    onChange(h24, minute);
  };

  const setAmPm = (v: string) => {
    if (v === "AM" && hour >= 12) onChange(hour - 12, minute);
    else if (v === "PM" && hour < 12) onChange(hour + 12, minute);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-3 shrink-0">at</span>
      <select value={h12} onChange={(e) => setHour12(parseInt(e.target.value))} className={cn(selectCls, "w-16")}>
        {[12,1,2,3,4,5,6,7,8,9,10,11].map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="text-text-3 font-medium shrink-0">:</span>
      <select value={minute} onChange={(e) => onChange(hour, parseInt(e.target.value))} className={cn(selectCls, "w-16")}>
        <option value={0}>00</option>
        <option value={15}>15</option>
        <option value={30}>30</option>
        <option value={45}>45</option>
      </select>
      <select value={ampm} onChange={(e) => setAmPm(e.target.value)} className={cn(selectCls, "w-16")}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

// ── Schedule form state ────────────────────────────────────────────────────────

interface ScheduleFormState {
  name: string;
  schedule_type: "cron" | "interval" | "once";
  cronConfig: CronConfig;
  interval_value: string;
  interval_unit: "minutes" | "hours" | "days";
  run_at: string;
  timezone: string;
  max_retries: string;
  enabled: boolean;
}

const defaultForm = (): ScheduleFormState => ({
  name: "",
  schedule_type: "cron",
  cronConfig: defaultCronConfig(),
  interval_value: "1",
  interval_unit: "hours",
  run_at: "",
  timezone: "UTC",
  max_retries: "0",
  enabled: true,
});

function intervalToSeconds(value: string, unit: string): number {
  const n = parseInt(value, 10) || 1;
  if (unit === "minutes") return n * 60;
  if (unit === "days") return n * 86400;
  return n * 3600;
}

interface Props { agentId: string; }

export function AgentSchedulesTab({ agentId }: Props) {
  const { data: schedules = [], mutate, isLoading } = useSWR(
    ["schedules", agentId],
    () => api.schedules.list(agentId),
  );

  const [creating, setCreating]       = useState(false);
  const [form, setForm]               = useState<ScheduleFormState>(defaultForm());
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [triggered, setTriggered]     = useState<string | null>(null);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editForm, setEditForm]       = useState<ScheduleFormState>(defaultForm());
  const [editSaving, setEditSaving]   = useState(false);
  const [editError, setEditError]     = useState<string | null>(null);

  const set = <K extends keyof ScheduleFormState>(k: K, v: ScheduleFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const setCronCfg = (patch: Partial<CronConfig>) =>
    setForm((f) => ({ ...f, cronConfig: { ...f.cronConfig, ...patch } }));

  const setEdit = <K extends keyof ScheduleFormState>(k: K, v: ScheduleFormState[K]) =>
    setEditForm((f) => ({ ...f, [k]: v }));
  const setEditCronCfg = (patch: Partial<CronConfig>) =>
    setEditForm((f) => ({ ...f, cronConfig: { ...f.cronConfig, ...patch } }));

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload: Parameters<typeof api.schedules.create>[0] = {
        agent_id: agentId,
        name: form.name.trim(),
        schedule_type: form.schedule_type,
        timezone: form.timezone || "UTC",
        enabled: form.enabled,
        max_retries: parseInt(form.max_retries, 10) || 0,
      };
      if (form.schedule_type === "cron")
        payload.cron_expression = buildCronExpr(form.cronConfig).trim();
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

  const handleUpdate = async () => {
    if (!editingId || !editForm.name.trim()) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const payload: Parameters<typeof api.schedules.update>[1] = {
        name: editForm.name.trim(),
        timezone: editForm.timezone || "UTC",
        enabled: editForm.enabled,
        max_retries: parseInt(editForm.max_retries, 10) || 0,
      };
      if (editForm.schedule_type === "cron")
        payload.cron_expression = buildCronExpr(editForm.cronConfig).trim();
      if (editForm.schedule_type === "interval")
        payload.interval_seconds = intervalToSeconds(editForm.interval_value, editForm.interval_unit);
      if (editForm.schedule_type === "once" && editForm.run_at)
        payload.run_at = new Date(editForm.run_at).toISOString();
      await api.schedules.update(editingId, payload);
      await mutate();
      setEditingId(null);
    } catch (e) {
      setEditError(String(e));
    } finally {
      setEditSaving(false);
    }
  };

  const handleToggle  = async (id: string) => { try { await api.schedules.toggle(id);  await mutate(); } catch { /* ignore */ } };
  const handleDelete  = async (id: string) => { try { await api.schedules.delete(id);  await mutate(); } catch { /* ignore */ } };
  const handleTrigger = async (id: string) => {
    try { await api.schedules.trigger(id); setTriggered(id); setTimeout(() => setTriggered(null), 3000); }
    catch { /* ignore */ }
  };

  const activeFreqOpt = FREQ_OPTIONS.find((f) => f.id === form.cronConfig.freq)!;

  const TYPE_OPTIONS = [
    { id: "cron"     as const, label: "Recurring",  Icon: Clock,      desc: "Repeating schedule" },
    { id: "interval" as const, label: "Interval",   Icon: AlarmClock, desc: "Every N minutes/hours/days" },
    { id: "once"     as const, label: "One-time",   Icon: Calendar,   desc: "Run once at a time" },
  ];

  return (
    <div className="flex flex-col gap-3 p-4">
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

      {creating && (
        <div className="rounded-xl border border-border bg-surface-2/50 p-4 flex flex-col gap-4">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Schedule name *</label>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Daily briefing, Monday morning sync"
              className={inputCls}
              autoFocus
            />
          </div>

          {/* Type selector — 3 cards */}
          <div className="flex flex-col gap-2">
            <label className={labelCls}>Type</label>
            <div className="grid grid-cols-3 gap-2">
              {TYPE_OPTIONS.map(({ id, label, Icon, desc }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => set("schedule_type", id)}
                  className={cn(
                    "flex flex-col items-start gap-1.5 p-3 rounded-xl border text-left transition-colors",
                    form.schedule_type === id
                      ? "border-violet bg-violet/8"
                      : "border-border bg-surface-2/30 hover:border-border/80",
                  )}
                >
                  <Icon className={cn("w-4 h-4", form.schedule_type === id ? "text-violet" : "text-text-3")} />
                  <span className={cn("text-xs font-semibold", form.schedule_type === id ? "text-violet" : "text-text-2")}>{label}</span>
                  <span className="text-[10px] text-text-3 leading-tight">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Cron frequency picker */}
          {form.schedule_type === "cron" && (
            <div className="flex flex-col gap-3">
              <label className={labelCls}>Frequency</label>

              {/* Frequency chips in a 4-column grid */}
              <div className="grid grid-cols-4 gap-1.5">
                {FREQ_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setCronCfg({ freq: opt.id })}
                    className={cn(
                      "px-2 py-2 rounded-lg text-xs font-medium text-left transition-colors border leading-tight",
                      form.cronConfig.freq === opt.id
                        ? "bg-violet/15 border-violet/40 text-violet"
                        : "bg-surface-2 border-border text-text-3 hover:text-text-2 hover:border-border/80",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Time picker */}
              {activeFreqOpt.needsTime && (
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Time</label>
                  <TimePicker
                    hour={form.cronConfig.hour}
                    minute={form.cronConfig.minute}
                    onChange={(h, m) => setCronCfg({ hour: h, minute: m })}
                  />
                </div>
              )}

              {/* Weekday chips */}
              {activeFreqOpt.needsDays && (
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Days of week</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {DOW_LABELS.map((day, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const curr = form.cronConfig.weekdays;
                          const next = curr.includes(idx) ? curr.filter((d) => d !== idx) : [...curr, idx];
                          setCronCfg({ weekdays: next.length > 0 ? next : [idx] });
                        }}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border",
                          form.cronConfig.weekdays.includes(idx)
                            ? "bg-violet/15 border-violet/30 text-violet"
                            : "bg-surface-2 border-border text-text-3 hover:text-text-2",
                        )}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Month day */}
              {activeFreqOpt.needsMonthDay && (
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Day of month</label>
                  <select
                    value={form.cronConfig.monthDay}
                    onChange={(e) => setCronCfg({ monthDay: parseInt(e.target.value) })}
                    className={cn(selectCls, "w-full")}
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>{ordinal(d)}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Custom expression */}
              {form.cronConfig.freq === "custom" && (
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Cron expression</label>
                  <input
                    value={form.cronConfig.customExpr}
                    onChange={(e) => setCronCfg({ customExpr: e.target.value })}
                    placeholder="0 9 * * 1-5"
                    className={cn(inputCls, "font-mono")}
                  />
                  <p className="text-[10px] text-text-3">
                    Format: <code className="bg-surface-2 px-0.5 rounded font-mono">min hour day month weekday</code>
                    {" · "}<code className="bg-surface-2 px-0.5 rounded font-mono">*</code> any
                    {" · "}<code className="bg-surface-2 px-0.5 rounded font-mono">*/N</code> every N
                    {" · "}<code className="bg-surface-2 px-0.5 rounded font-mono">1-5</code> range
                  </p>
                </div>
              )}

              {/* Live preview */}
              <div className="rounded-lg bg-violet/8 border border-violet/20 px-3 py-2.5 flex flex-col gap-0.5">
                <p className="text-[11px] font-medium text-text-1">
                  {describeCronConfig(form.cronConfig, form.timezone)}
                </p>
                <p className="text-[10px] font-mono text-text-3">{buildCronExpr(form.cronConfig)}</p>
              </div>
            </div>
          )}

          {/* Interval */}
          {form.schedule_type === "interval" && (
            <div className="flex flex-col gap-2">
              <label className={labelCls}>Run every</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={form.interval_value}
                  onChange={(e) => set("interval_value", e.target.value)}
                  className={cn(inputCls, "w-24")}
                />
                <select
                  value={form.interval_unit}
                  onChange={(e) => set("interval_unit", e.target.value as ScheduleFormState["interval_unit"])}
                  className={cn(selectCls, "flex-1")}
                >
                  <option value="minutes">minutes</option>
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                </select>
              </div>
              <div className="rounded-lg bg-violet/8 border border-violet/20 px-3 py-2">
                <p className="text-[11px] font-medium text-text-1">
                  {fmtInterval(intervalToSeconds(form.interval_value, form.interval_unit))}
                </p>
              </div>
            </div>
          )}

          {/* Once */}
          {form.schedule_type === "once" && (
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Run at</label>
              <input
                type="datetime-local"
                value={form.run_at}
                onChange={(e) => set("run_at", e.target.value)}
                className={inputCls}
              />
            </div>
          )}

          {/* Timezone + Retries */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Timezone</label>
              <select value={form.timezone} onChange={(e) => set("timezone", e.target.value)} className={cn(selectCls, "w-full")}>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Retries on fail</label>
              <select value={form.max_retries} onChange={(e) => set("max_retries", e.target.value)} className={cn(selectCls, "w-full")}>
                {[0, 1, 2, 3, 5].map((n) => (
                  <option key={n} value={n}>{n === 0 ? "No retries" : `${n} time${n !== 1 ? "s" : ""}`}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} className="accent-violet" />
            <span className="text-xs text-text-2">Enable immediately</span>
          </label>

          {error && <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>}

          <button
            onClick={handleCreate}
            disabled={saving || !form.name.trim()}
            className="w-full py-2.5 rounded-xl bg-violet/20 hover:bg-violet/35 disabled:opacity-40 text-violet text-sm font-medium transition-colors"
          >
            {saving ? "Creating…" : "Create Schedule"}
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-text-3 text-center py-4">Loading…</p>
      ) : schedules.length === 0 && !creating ? (
        <div className="text-center py-8">
          <Clock className="w-8 h-8 text-text-3 mx-auto mb-2" />
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
              isEditing={editingId === s.id}
              editForm={editingId === s.id ? editForm : null}
              onEdit={() => { setEditingId(s.id); setEditForm(scheduleToForm(s)); setEditError(null); }}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={handleUpdate}
              editSaving={editSaving}
              editError={editError}
              setEdit={setEdit}
              setEditCronCfg={setEditCronCfg}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleCard({
  schedule, onToggle, onDelete, onTrigger, justTriggered,
  isEditing, editForm, onEdit, onCancelEdit, onSaveEdit,
  editSaving, editError, setEdit, setEditCronCfg,
}: {
  schedule: AgentSchedule;
  onToggle: () => void;
  onDelete: () => void;
  onTrigger: () => void;
  justTriggered: boolean;
  isEditing: boolean;
  editForm: ScheduleFormState | null;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  editSaving: boolean;
  editError: string | null;
  setEdit: <K extends keyof ScheduleFormState>(k: K, v: ScheduleFormState[K]) => void;
  setEditCronCfg: (patch: Partial<CronConfig>) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const humanLabel =
    schedule.schedule_type === "cron" && schedule.cron_expression
      ? describeCronExpr(schedule.cron_expression, schedule.timezone)
      : schedule.schedule_type === "interval"
      ? fmtInterval(schedule.interval_seconds)
      : `Once: ${fmtDate(schedule.run_at)}`;

  const activeFreqOpt = editForm
    ? FREQ_OPTIONS.find((f) => f.id === editForm.cronConfig.freq)!
    : null;

  return (
    <div className={cn(
      "rounded-xl border flex flex-col transition-colors",
      isEditing ? "border-violet/40 bg-violet/5" : schedule.enabled ? "border-border bg-surface-2/30" : "border-border/40 bg-surface-2/10 opacity-60",
    )}>
      {/* Card header — always visible */}
      <div className="p-3 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-1 truncate">{schedule.name}</p>
            <p className="text-xs text-text-2 mt-0.5">{humanLabel}</p>
            {schedule.schedule_type === "cron" && schedule.cron_expression && (
              <p className="text-[10px] font-mono text-text-3 mt-0.5">{schedule.cron_expression}</p>
            )}
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
          <p className="text-[10px] text-text-2 font-medium">{fmtDate(schedule.next_run_at)}</p>
          <p className="text-[10px] text-text-3">Last run</p>
          <p className="text-[10px] text-text-2">{fmtDate(schedule.last_run_at)}</p>
          <p className="text-[10px] text-text-3">Runs / failures</p>
          <p className="text-[10px] text-text-2">{schedule.run_count} / {schedule.failure_count}</p>
        </div>

        <div className="flex items-center gap-1.5 pt-1 border-t border-border/40">
          <button onClick={onToggle} className={cn("px-2 py-1 rounded-lg text-[10px] font-medium transition-colors", schedule.enabled ? "bg-surface-2 text-text-3 hover:text-rose-400" : "bg-violet/10 text-violet hover:bg-violet/20")}>
            {schedule.enabled ? "Disable" : "Enable"}
          </button>
          <button onClick={onTrigger} disabled={justTriggered} className="px-2 py-1 rounded-lg text-[10px] font-medium bg-emerald/10 text-emerald hover:bg-emerald/20 disabled:opacity-40 transition-colors">
            {justTriggered ? "Triggered ✓" : "Run now"}
          </button>
          <button
            onClick={isEditing ? onCancelEdit : onEdit}
            className={cn(
              "px-2 py-1 rounded-lg text-[10px] font-medium transition-colors",
              isEditing ? "bg-surface-2 text-text-3 hover:text-text-2" : "bg-violet/8 text-violet hover:bg-violet/15",
            )}
          >
            {isEditing ? "Cancel" : "Edit"}
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

      {/* Inline edit form */}
      {isEditing && editForm && (
        <div className="border-t border-violet/20 p-3 flex flex-col gap-3 bg-surface-0/50">
          <p className="text-[10px] font-semibold text-violet uppercase tracking-widest">Edit Schedule</p>

          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Name</label>
            <input value={editForm.name} onChange={(e) => setEdit("name", e.target.value)} className={inputCls} />
          </div>

          {/* Cron frequency (only for cron type) */}
          {editForm.schedule_type === "cron" && activeFreqOpt && (
            <div className="flex flex-col gap-2">
              <label className={labelCls}>Frequency</label>
              <div className="grid grid-cols-4 gap-1.5">
                {FREQ_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setEditCronCfg({ freq: opt.id })}
                    className={cn(
                      "px-2 py-1.5 rounded-lg text-[10px] font-medium text-left transition-colors border leading-tight",
                      editForm.cronConfig.freq === opt.id
                        ? "bg-violet/15 border-violet/40 text-violet"
                        : "bg-surface-2 border-border text-text-3 hover:text-text-2",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {activeFreqOpt.needsTime && (
                <TimePicker
                  hour={editForm.cronConfig.hour}
                  minute={editForm.cronConfig.minute}
                  onChange={(h, m) => setEditCronCfg({ hour: h, minute: m })}
                />
              )}
              {activeFreqOpt.needsDays && (
                <div className="flex gap-1.5 flex-wrap">
                  {DOW_LABELS.map((day, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        const curr = editForm.cronConfig.weekdays;
                        const next = curr.includes(idx) ? curr.filter((d) => d !== idx) : [...curr, idx];
                        setEditCronCfg({ weekdays: next.length > 0 ? next : [idx] });
                      }}
                      className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-medium transition-colors border",
                        editForm.cronConfig.weekdays.includes(idx)
                          ? "bg-violet/15 border-violet/30 text-violet"
                          : "bg-surface-2 border-border text-text-3",
                      )}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              )}
              {editForm.cronConfig.freq === "custom" && (
                <input
                  value={editForm.cronConfig.customExpr}
                  onChange={(e) => setEditCronCfg({ customExpr: e.target.value })}
                  placeholder="0 9 * * 1-5"
                  className={cn(inputCls, "font-mono")}
                />
              )}
              {/* Preview */}
              <div className="rounded-lg bg-violet/8 border border-violet/20 px-3 py-2">
                <p className="text-[11px] font-medium text-text-1">{describeCronConfig(editForm.cronConfig, editForm.timezone)}</p>
                <p className="text-[10px] font-mono text-text-3">{buildCronExpr(editForm.cronConfig)}</p>
              </div>
            </div>
          )}

          {/* Interval */}
          {editForm.schedule_type === "interval" && (
            <div className="flex items-center gap-2">
              <input
                type="number" min={1} value={editForm.interval_value}
                onChange={(e) => setEdit("interval_value", e.target.value)}
                className={cn(inputCls, "w-20")}
              />
              <select value={editForm.interval_unit} onChange={(e) => setEdit("interval_unit", e.target.value as ScheduleFormState["interval_unit"])} className={cn(selectCls, "flex-1")}>
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
            </div>
          )}

          {/* Once */}
          {editForm.schedule_type === "once" && (
            <input type="datetime-local" value={editForm.run_at} onChange={(e) => setEdit("run_at", e.target.value)} className={inputCls} />
          )}

          {/* Timezone + Retries */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Timezone</label>
              <select value={editForm.timezone} onChange={(e) => setEdit("timezone", e.target.value)} className={cn(selectCls, "w-full")}>
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Retries</label>
              <select value={editForm.max_retries} onChange={(e) => setEdit("max_retries", e.target.value)} className={cn(selectCls, "w-full")}>
                {[0,1,2,3,5].map((n) => <option key={n} value={n}>{n === 0 ? "None" : `${n}×`}</option>)}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={editForm.enabled} onChange={(e) => setEdit("enabled", e.target.checked)} className="accent-violet" />
            <span className="text-xs text-text-2">Enabled</span>
          </label>

          {editError && <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{editError}</p>}

          <button
            onClick={onSaveEdit}
            disabled={editSaving || !editForm.name.trim()}
            className="w-full py-2 rounded-xl bg-violet/20 hover:bg-violet/35 disabled:opacity-40 text-violet text-sm font-medium transition-colors"
          >
            {editSaving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      )}
    </div>
  );
}
