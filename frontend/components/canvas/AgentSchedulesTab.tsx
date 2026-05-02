"use client";

import { useState } from "react";
import useSWR from "swr";
import { Clock } from "lucide-react";
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

// ── Cron utilities ─────────────────────────────────────────────────────────────

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type FreqId =
  | "5min" | "15min" | "30min"
  | "1h" | "2h" | "6h" | "12h"
  | "daily" | "weekdays" | "weekly" | "monthly" | "custom";

interface CronConfig {
  freq: FreqId;
  hour: number;
  minute: number;
  weekdays: number[];
  monthDay: number;
  customExpr: string;
}

const freqNeedsTime     = (f: FreqId) => ["daily", "weekdays", "weekly", "monthly"].includes(f);
const freqNeedsDays     = (f: FreqId) => f === "weekly";
const freqNeedsMonthDay = (f: FreqId) => f === "monthly";

function buildCronExpr(cfg: CronConfig): string {
  const { freq, minute: min, hour, weekdays, monthDay, customExpr } = cfg;
  switch (freq) {
    case "5min":     return "*/5 * * * *";
    case "15min":    return "*/15 * * * *";
    case "30min":    return "*/30 * * * *";
    case "1h":       return "0 * * * *";
    case "2h":       return "0 */2 * * *";
    case "6h":       return "0 */6 * * *";
    case "12h":      return "0 */12 * * *";
    case "daily":    return `${min} ${hour} * * *`;
    case "weekdays": return `${min} ${hour} * * 1-5`;
    case "weekly":   return `${min} ${hour} * * ${weekdays.length > 0 ? weekdays.slice().sort((a,b)=>a-b).join(",") : "1"}`;
    case "monthly":  return `${min} ${hour} ${monthDay} * *`;
    case "custom":   return customExpr || "0 9 * * 1-5";
  }
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function fmt12h(hour: number, minute: number): string {
  const ampm = hour < 12 ? "AM" : "PM";
  const h12  = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${String(minute).padStart(2, "0")} ${ampm}`;
}

function describeCron(cfg: CronConfig, tz: string): string {
  const t  = freqNeedsTime(cfg.freq) ? ` at ${fmt12h(cfg.hour, cfg.minute)}` : "";
  const tz_ = tz === "UTC" ? " UTC" : ` (${tz.split("/").pop()?.replace(/_/g, " ")})`;
  switch (cfg.freq) {
    case "5min":     return "Every 5 minutes";
    case "15min":    return "Every 15 minutes";
    case "30min":    return "Every 30 minutes";
    case "1h":       return "Every hour";
    case "2h":       return "Every 2 hours";
    case "6h":       return "Every 6 hours";
    case "12h":      return "Every 12 hours";
    case "daily":    return `Every day${t}${tz_}`;
    case "weekdays": return `Mon – Fri${t}${tz_}`;
    case "weekly": {
      const days = cfg.weekdays.length > 0
        ? cfg.weekdays.slice().sort((a, b) => a - b).map((d) => DOW_LABELS[d]).join(", ")
        : "Monday";
      return `Every ${days}${t}${tz_}`;
    }
    case "monthly":  return `Monthly on the ${ordinal(cfg.monthDay)}${t}${tz_}`;
    case "custom":   return cfg.customExpr || "—";
  }
}

function parseCronExpr(expr: string): CronConfig {
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
    const min = parseInt(minStr, 10), hour = parseInt(hourStr, 10);
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

function intervalSecsToCron(s: number): CronConfig {
  if (s <= 300)   return parseCronExpr("*/5 * * * *");
  if (s <= 900)   return parseCronExpr("*/15 * * * *");
  if (s <= 1800)  return parseCronExpr("*/30 * * * *");
  if (s <= 3600)  return parseCronExpr("0 * * * *");
  if (s <= 7200)  return parseCronExpr("0 */2 * * *");
  if (s <= 21600) return parseCronExpr("0 */6 * * *");
  return parseCronExpr("0 */12 * * *");
}

const defaultCron = (): CronConfig => ({
  freq: "daily", hour: 9, minute: 0, weekdays: [1], monthDay: 1, customExpr: "0 9 * * 1-5",
});

function detectTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; }
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function timeRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diffMs = new Date(iso).getTime() - Date.now();
  const abs    = Math.abs(diffMs);
  const future = diffMs > 0;

  const mins  = Math.floor(abs / 60_000);
  const hours = Math.floor(abs / 3_600_000);
  const days  = Math.floor(abs / 86_400_000);

  if (abs < 30_000)  return future ? "any moment" : "just now";
  if (mins  <  60)   return future ? `in ${mins}m`         : `${mins}m ago`;
  if (hours <  24)   return future ? `in ${hours}h ${mins % 60}m` : `${hours}h ago`;
  if (days  <   7)   return future ? `in ${days}d`         : `${days}d ago`;
  return fmtDate(iso);
}

// ── Form state ─────────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  type: "recurring" | "once";
  cron: CronConfig;
  run_at: string;
  timezone: string;
  max_retries: number;
  enabled: boolean;
}

const defaultForm = (): FormState => ({
  name: "", type: "recurring", cron: defaultCron(), run_at: "",
  timezone: detectTimezone(), max_retries: 0, enabled: true,
});

function scheduleToForm(s: AgentSchedule): FormState {
  const cron = s.cron_expression
    ? parseCronExpr(s.cron_expression)
    : s.interval_seconds != null
    ? intervalSecsToCron(s.interval_seconds)
    : defaultCron();
  return {
    name: s.name,
    type: s.schedule_type === "once" ? "once" : "recurring",
    cron,
    run_at: s.run_at ? new Date(s.run_at).toISOString().slice(0, 16) : "",
    timezone: s.timezone || "UTC",
    max_retries: s.max_retries ?? 0,
    enabled: s.enabled,
  };
}

function formToPayload(form: FormState, agentId: string) {
  const base = {
    agent_id:    agentId,
    name:        form.name.trim(),
    timezone:    form.timezone || "UTC",
    enabled:     form.enabled,
    max_retries: form.max_retries,
  };
  if (form.type === "once") return { ...base, schedule_type: "once" as const, run_at: new Date(form.run_at).toISOString() };
  return { ...base, schedule_type: "cron" as const, cron_expression: buildCronExpr(form.cron) };
}

// ── TimePicker ─────────────────────────────────────────────────────────────────

function TimePicker({ hour, minute, onChange }: {
  hour: number; minute: number; onChange: (h: number, m: number) => void;
}) {
  const ampm = hour < 12 ? "AM" : "PM";
  const h12  = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const setH = (v: number) =>
    onChange(ampm === "PM" ? (v === 12 ? 12 : v + 12) : (v === 12 ? 0 : v), minute);
  const setAmPm = (v: string) =>
    onChange(v === "AM" && hour >= 12 ? hour - 12 : v === "PM" && hour < 12 ? hour + 12 : hour, minute);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-3 shrink-0">at</span>
      <select value={h12} onChange={(e) => setH(parseInt(e.target.value))} className={cn(selectCls, "w-16")}>
        {[12,1,2,3,4,5,6,7,8,9,10,11].map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="text-text-3 font-medium">:</span>
      <select value={minute} onChange={(e) => onChange(hour, parseInt(e.target.value))} className={cn(selectCls, "w-16")}>
        {[0,15,30,45].map((m) => <option key={m} value={m}>{String(m).padStart(2, "0")}</option>)}
      </select>
      <select value={ampm} onChange={(e) => setAmPm(e.target.value)} className={cn(selectCls, "w-16")}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

// ── CronBuilder ────────────────────────────────────────────────────────────────

function CronBuilder({ cfg, onChange }: {
  cfg: CronConfig; onChange: (patch: Partial<CronConfig>) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <select
        value={cfg.freq}
        onChange={(e) => onChange({ freq: e.target.value as FreqId })}
        className={cn(selectCls, "w-full")}
      >
        <optgroup label="Frequent">
          <option value="5min">Every 5 minutes</option>
          <option value="15min">Every 15 minutes</option>
          <option value="30min">Every 30 minutes</option>
        </optgroup>
        <optgroup label="Hourly">
          <option value="1h">Every hour</option>
          <option value="2h">Every 2 hours</option>
          <option value="6h">Every 6 hours</option>
          <option value="12h">Every 12 hours</option>
        </optgroup>
        <optgroup label="Daily / Weekly / Monthly">
          <option value="daily">Daily</option>
          <option value="weekdays">Weekdays (Mon – Fri)</option>
          <option value="weekly">Weekly (pick days)</option>
          <option value="monthly">Monthly (pick day)</option>
        </optgroup>
        <optgroup label="Advanced">
          <option value="custom">Custom cron expression</option>
        </optgroup>
      </select>

      {freqNeedsTime(cfg.freq) && (
        <TimePicker
          hour={cfg.hour}
          minute={cfg.minute}
          onChange={(h, m) => onChange({ hour: h, minute: m })}
        />
      )}

      {freqNeedsDays(cfg.freq) && (
        <div className="flex gap-1.5 flex-wrap">
          {DOW_LABELS.map((day, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                const next = cfg.weekdays.includes(idx)
                  ? cfg.weekdays.filter((d) => d !== idx)
                  : [...cfg.weekdays, idx];
                onChange({ weekdays: next.length > 0 ? next : [idx] });
              }}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border",
                cfg.weekdays.includes(idx)
                  ? "bg-violet/15 border-violet/30 text-violet"
                  : "bg-surface-2 border-border text-text-3 hover:text-text-2",
              )}
            >
              {day}
            </button>
          ))}
        </div>
      )}

      {freqNeedsMonthDay(cfg.freq) && (
        <select
          value={cfg.monthDay}
          onChange={(e) => onChange({ monthDay: parseInt(e.target.value) })}
          className={cn(selectCls, "w-full")}
        >
          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>{ordinal(d)}</option>
          ))}
        </select>
      )}

      {cfg.freq === "custom" && (
        <div className="flex flex-col gap-1.5">
          <input
            value={cfg.customExpr}
            onChange={(e) => onChange({ customExpr: e.target.value })}
            placeholder="0 9 * * 1-5"
            className={cn(inputCls, "font-mono")}
          />
          <p className="text-[10px] text-text-3">
            <code className="font-mono bg-surface-2 px-0.5 rounded">min hour day month weekday</code>
            {" · "}<code className="font-mono bg-surface-2 px-0.5 rounded">*</code> any
            {" · "}<code className="font-mono bg-surface-2 px-0.5 rounded">*/N</code> every N
            {" · "}<code className="font-mono bg-surface-2 px-0.5 rounded">1-5</code> range
          </p>
        </div>
      )}
    </div>
  );
}

// ── ScheduleForm ───────────────────────────────────────────────────────────────

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

function ScheduleForm({ form, onChange, onSubmit, submitting, error, submitLabel, autoFocus = false }: {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  submitLabel: string;
  autoFocus?: boolean;
}) {
  const patchCron = (patch: Partial<CronConfig>) =>
    onChange({ cron: { ...form.cron, ...patch } });

  return (
    <div className="flex flex-col gap-4">
      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Name</label>
        <input
          value={form.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. Daily briefing"
          className={inputCls}
          autoFocus={autoFocus}
        />
      </div>

      {/* Type toggle */}
      <div className="flex gap-2">
        {(["recurring", "once"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onChange({ type: t })}
            className={cn(
              "flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors",
              form.type === t
                ? "border-violet bg-violet/10 text-violet"
                : "border-border bg-surface-2/30 text-text-3 hover:text-text-2",
            )}
          >
            {t === "recurring" ? "Recurring" : "One-time"}
          </button>
        ))}
      </div>

      {/* Cron builder */}
      {form.type === "recurring" && (
        <>
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Schedule</label>
            <CronBuilder cfg={form.cron} onChange={patchCron} />
          </div>
          <div className="rounded-lg bg-violet/8 border border-violet/20 px-3 py-2.5 flex flex-col gap-0.5">
            <p className="text-[11px] font-medium text-text-1">
              {describeCron(form.cron, form.timezone)}
            </p>
            <p className="text-[10px] font-mono text-text-3">{buildCronExpr(form.cron)}</p>
          </div>
        </>
      )}

      {/* One-time */}
      {form.type === "once" && (
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Run at</label>
          <input
            type="datetime-local"
            value={form.run_at}
            onChange={(e) => onChange({ run_at: e.target.value })}
            className={inputCls}
          />
        </div>
      )}

      {/* Timezone + retries */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Timezone</label>
          <select
            value={form.timezone}
            onChange={(e) => onChange({ timezone: e.target.value })}
            className={cn(selectCls, "w-full")}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Retries</label>
          <select
            value={form.max_retries}
            onChange={(e) => onChange({ max_retries: parseInt(e.target.value) })}
            className={cn(selectCls, "w-full")}
          >
            {[0,1,2,3,5].map((n) => (
              <option key={n} value={n}>{n === 0 ? "None" : `${n}×`}</option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          className="accent-violet"
        />
        <span className="text-xs text-text-2">Enable immediately</span>
      </label>

      {error && (
        <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        onClick={onSubmit}
        disabled={submitting || !form.name.trim() || (form.type === "once" && !form.run_at)}
        className="w-full py-2.5 rounded-xl bg-violet/20 hover:bg-violet/35 disabled:opacity-40 text-violet text-sm font-medium transition-colors"
      >
        {submitting ? "Saving…" : submitLabel}
      </button>
    </div>
  );
}

// ── ScheduleCard ───────────────────────────────────────────────────────────────

function scheduleHumanLabel(s: AgentSchedule): string {
  if (s.schedule_type === "cron" && s.cron_expression)
    return describeCron(parseCronExpr(s.cron_expression), s.timezone);
  if (s.schedule_type === "interval" && s.interval_seconds != null)
    return describeCron(intervalSecsToCron(s.interval_seconds), s.timezone);
  if (s.schedule_type === "once") return `Once at ${fmtDate(s.run_at)}`;
  return "—";
}

function statusDotCls(s: AgentSchedule): string {
  if (!s.enabled) return "bg-text-3/40";
  if (s.last_run_status === "running") return "bg-violet animate-pulse";
  if (s.last_run_status === "failed")  return "bg-rose-400";
  if (s.last_run_status === "success") return "bg-emerald";
  return "bg-violet/50";
}

function RunPanel({ label, iso, status }: {
  label: string;
  iso: string | null | undefined;
  status?: string | null;
}) {
  const isNextRun = label === "Next run";
  const hasData   = !!iso;
  const isPast    = hasData && new Date(iso!).getTime() <= Date.now();
  const accentCls =
    status === "success" ? "border-emerald/25 bg-emerald/5"  :
    status === "failed"  ? "border-rose-400/25 bg-rose-400/5" :
    "border-border/50 bg-surface-2/40";
  const valueCls =
    status === "success" ? "text-emerald" :
    status === "failed"  ? "text-rose-400" :
    "text-text-1";

  const relativeValue = isNextRun && isPast ? "Due soon" : timeRelative(iso);

  return (
    <div className={cn("rounded-lg border px-3 py-2.5 flex flex-col gap-0.5", accentCls)}>
      <p className="text-[9px] font-semibold text-text-3 uppercase tracking-widest">{label}</p>
      {hasData ? (
        <>
          <p className={cn("text-sm font-semibold tabular-nums leading-tight", valueCls)}>
            {relativeValue}
          </p>
          {!(isNextRun && isPast) && (
            <p className="text-[10px] text-text-3">{fmtDate(iso)}</p>
          )}
        </>
      ) : (
        <p className="text-sm text-text-3 mt-0.5">
          {isNextRun ? "Paused" : "Never"}
        </p>
      )}
    </div>
  );
}

function ScheduleCard({
  schedule, onToggle, onDelete, onTrigger, justTriggered,
  isEditing, editForm, onEdit, onCancelEdit, onSaveEdit,
  editSaving, editError, setEditForm,
}: {
  schedule: AgentSchedule;
  onToggle: () => void;
  onDelete: () => void;
  onTrigger: () => void;
  justTriggered: boolean;
  isEditing: boolean;
  editForm: FormState | null;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  editSaving: boolean;
  editError: string | null;
  setEditForm: (patch: Partial<FormState>) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const expr = schedule.schedule_type === "cron" && schedule.cron_expression
    ? schedule.cron_expression
    : null;
  const hasFailed = schedule.failure_count > 0;

  return (
    <div className={cn(
      "rounded-xl border flex flex-col transition-all",
      isEditing  ? "border-violet/40 bg-violet/[0.03]" :
      !schedule.enabled ? "border-border/40 bg-surface-2/10 opacity-60" :
      "border-border bg-surface-2/20 hover:border-border/80",
    )}>
      <div className="p-3.5 flex flex-col gap-3">
        {/* Name + status */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <span className={cn("w-1.5 h-1.5 rounded-full mt-[5px] shrink-0", statusDotCls(schedule))} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-1 truncate leading-snug">
                {schedule.name}
              </p>
              <p className="text-xs text-text-2 mt-0.5 leading-tight">
                {scheduleHumanLabel(schedule)}
              </p>
              {expr && (
                <p className="text-[10px] font-mono text-text-3 mt-0.5">{expr}</p>
              )}
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

        {/* Next / Last run panels */}
        <div className="grid grid-cols-2 gap-2">
          <RunPanel
            label="Next run"
            iso={schedule.enabled ? schedule.next_run_at : null}
          />
          <RunPanel
            label="Last run"
            iso={schedule.last_run_at}
            status={schedule.last_run_status}
          />
        </div>

        {/* Stats */}
        <p className="text-[10px] text-text-3 -mt-1">
          {schedule.run_count === 0
            ? "Not yet run"
            : `${schedule.run_count} run${schedule.run_count !== 1 ? "s" : ""}`}
          {hasFailed && (
            <span className="text-rose-400 ml-1">
              · {schedule.failure_count} failure{schedule.failure_count !== 1 ? "s" : ""}
            </span>
          )}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-1.5 pt-2 border-t border-border/40">
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
              "px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors",
              justTriggered
                ? "bg-emerald/15 text-emerald"
                : "bg-emerald/8 text-emerald hover:bg-emerald/20",
              "disabled:opacity-60",
            )}
          >
            {justTriggered ? "Triggered ✓" : "Run now"}
          </button>
          <button
            onClick={isEditing ? onCancelEdit : onEdit}
            className={cn(
              "px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors",
              isEditing
                ? "bg-surface-2 text-text-3 hover:text-text-2"
                : "bg-violet/8 text-violet hover:bg-violet/15",
            )}
          >
            {isEditing ? "Cancel" : "Edit"}
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

      {/* Inline edit */}
      {isEditing && editForm && (
        <div className="border-t border-violet/20 p-3.5 bg-surface-0/40">
          <p className="text-[10px] font-semibold text-violet uppercase tracking-widest mb-3">Edit Schedule</p>
          <ScheduleForm
            form={editForm}
            onChange={setEditForm}
            onSubmit={onSaveEdit}
            submitting={editSaving}
            error={editError}
            submitLabel="Save Changes"
          />
        </div>
      )}
    </div>
  );
}

// ── AgentSchedulesTab ──────────────────────────────────────────────────────────

interface Props { agentId: string; }

export function AgentSchedulesTab({ agentId }: Props) {
  const { data: schedules = [], mutate, isLoading } = useSWR(
    ["schedules", agentId],
    () => api.schedules.list(agentId),
  );

  const [creating, setCreating]     = useState(false);
  const [form, setForm]             = useState<FormState>(defaultForm());
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [triggered, setTriggered]   = useState<string | null>(null);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editForm, setEditForm]     = useState<FormState>(defaultForm());
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError]   = useState<string | null>(null);

  const patchForm     = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const patchEditForm = (patch: Partial<FormState>) => setEditForm((f) => ({ ...f, ...patch }));

  const handleCreate = async () => {
    setSaving(true); setError(null);
    try {
      await api.schedules.create(formToPayload(form, agentId));
      await mutate();
      setCreating(false);
      setForm(defaultForm());
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    setEditSaving(true); setEditError(null);
    try {
      const payload: Parameters<typeof api.schedules.update>[1] = {
        name:        editForm.name.trim(),
        timezone:    editForm.timezone || "UTC",
        enabled:     editForm.enabled,
        max_retries: editForm.max_retries,
      };
      if (editForm.type === "recurring") payload.cron_expression = buildCronExpr(editForm.cron);
      if (editForm.type === "once" && editForm.run_at)
        payload.run_at = new Date(editForm.run_at).toISOString();
      await api.schedules.update(editingId, payload);
      await mutate();
      setEditingId(null);
    } catch (e) { setEditError(String(e)); }
    finally { setEditSaving(false); }
  };

  const handleToggle  = async (id: string) => { try { await api.schedules.toggle(id);  await mutate(); } catch { /* ignore */ } };
  const handleDelete  = async (id: string) => { try { await api.schedules.delete(id);  await mutate(); } catch { /* ignore */ } };
  const handleTrigger = async (id: string) => {
    try { await api.schedules.trigger(id); setTriggered(id); setTimeout(() => setTriggered(null), 3000); }
    catch { /* ignore */ }
  };

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
        <div className="rounded-xl border border-border bg-surface-2/50 p-4">
          <ScheduleForm
            form={form}
            onChange={patchForm}
            onSubmit={handleCreate}
            submitting={saving}
            error={error}
            submitLabel="Create Schedule"
            autoFocus
          />
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
          {(schedules as AgentSchedule[]).map((s) => (
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
              setEditForm={patchEditForm}
            />
          ))}
        </div>
      )}
    </div>
  );
}
