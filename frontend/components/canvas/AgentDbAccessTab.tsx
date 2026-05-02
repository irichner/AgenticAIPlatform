"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, type AgentDbPolicy, type TableInfo } from "@/lib/api";
import { cn } from "@/lib/cn";

const inputCls =
  "w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-violet";
const selectCls =
  "w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-1 outline-none focus:border-violet";
const labelCls = "text-xs font-medium text-text-3 uppercase tracking-widest";

const DB_OPS = ["select", "insert", "update", "delete"] as const;

const TABLE_DESCRIPTIONS: Record<string, string> = {
  agents:               "AI agents configured in your workspace — their name, status, model, and settings.",
  business_units:       "Swarms (business units) that group related agents together.",
  agent_groups:         "Sub-groups within a swarm for organising agents.",
  agent_runs:           "Execution history for agent runs — inputs, outputs, status, and timing.",
  agent_schedules:      "Scheduled triggers that run agents automatically on a cron or interval.",
  agent_db_policies:    "Per-agent database access rules controlling which tables and operations are allowed.",
  agent_tool_allowlist: "Allowlist of MCP tools each agent is permitted to call.",
  mcp_servers:          "Connected MCP (Model Context Protocol) servers providing external tool integrations.",
  mcp_tools:            "Individual tools exposed by MCP servers, callable by agents.",
  contacts:             "CRM contacts — names, emails, companies, and communication history.",
  deals:                "Sales deals with stages, amounts, close dates, and owner assignments.",
  accounts:             "Company accounts linked to contacts and deals.",
  activities:           "Sales activities such as calls, emails, and meetings logged against contacts or deals.",
  commissions:          "Commission records for sales reps — amounts, deal links, and payout status.",
  users:                "User accounts in your organisation.",
  organisations:        "Top-level tenant organisations (your company and customers).",
};

const OP_COLORS: Record<string, string> = {
  select: "text-cyan bg-cyan/10",
  insert: "text-emerald bg-emerald/10",
  update: "text-amber bg-amber/10",
  delete: "text-rose-400 bg-rose-400/10",
};

interface FormState {
  table_name: string;
  name: string;
  operations: string[];
  row_limit: string;
  column_allowlist: string;
  column_blocklist: string;
  enabled: boolean;
}

const defaultForm = (): FormState => ({
  table_name: "",
  name: "",
  operations: ["select"],
  row_limit: "100",
  column_allowlist: "",
  column_blocklist: "",
  enabled: true,
});

function parseList(raw: string): string[] | undefined {
  const items = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

interface Props {
  agentId: string;
}

export function AgentDbAccessTab({ agentId }: Props) {
  const { data: policies = [], mutate, isLoading } = useSWR(
    ["db-policies", agentId],
    () => api.agentDbPolicies.list(agentId),
  );

  const { data: tables = [] } = useSWR(
    "db-tables",
    () => api.agentDbPolicies.tables(),
  );

  const [creating, setCreating] = useState(false);
  const [form, setForm]         = useState<FormState>(defaultForm());
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleOp = (op: string) =>
    set("operations", form.operations.includes(op)
      ? form.operations.filter((o) => o !== op)
      : [...form.operations, op]);

  const handleTableChange = (tableName: string) => {
    set("table_name", tableName);
    if (!form.name || form.name === form.table_name) {
      set("name", tableName);
    }
  };

  const handleCreate = async () => {
    if (!form.table_name || form.operations.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await api.agentDbPolicies.create({
        agent_id: agentId,
        name: form.name.trim() || form.table_name,
        table_name: form.table_name,
        allowed_operations: form.operations,
        row_limit: parseInt(form.row_limit, 10) || 100,
        column_allowlist: parseList(form.column_allowlist),
        column_blocklist: parseList(form.column_blocklist),
        enabled: form.enabled,
      });
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
    try { await api.agentDbPolicies.toggle(id); await mutate(); } catch { /* ignore */ }
  };

  const handleDelete = async (id: string) => {
    try { await api.agentDbPolicies.delete(id); await mutate(); } catch { /* ignore */ }
  };

  const existingTables = new Set(policies.map((p: AgentDbPolicy) => p.table_name));

  // Tables not yet granted to this agent
  const availableTables = tables.filter((t: TableInfo) => !existingTables.has(t.table_name));

  const selectedTableInfo = tables.find((t: TableInfo) => t.table_name === form.table_name);

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-3">
          {policies.length === 0
            ? "No table access granted yet."
            : `${policies.length} table${policies.length !== 1 ? "s" : ""} accessible`}
        </p>
        <button
          onClick={() => { setCreating((v) => !v); setForm(defaultForm()); setError(null); }}
          className="text-xs text-violet hover:text-violet/80 transition-colors"
        >
          {creating ? "Cancel" : "+ Grant Access"}
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-xl border border-border bg-surface-2/50 p-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Table *</label>
            {availableTables.length === 0 ? (
              <p className="text-xs text-text-3 italic">All tables already granted.</p>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-0.5">
                {availableTables.map((t: TableInfo) => (
                  <button
                    key={t.table_name}
                    type="button"
                    onClick={() => handleTableChange(t.table_name)}
                    className={cn(
                      "flex flex-col gap-0.5 p-2.5 rounded-xl border text-left transition-colors",
                      form.table_name === t.table_name
                        ? "border-violet bg-violet/8"
                        : "border-border bg-surface-2/40 hover:border-border/80 hover:bg-surface-2/70",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("text-xs font-mono font-semibold", form.table_name === t.table_name ? "text-violet" : "text-text-1")}>
                        {t.table_name}
                      </span>
                      {!t.has_org_id && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber/10 text-amber font-medium uppercase tracking-wide shrink-0">global</span>
                      )}
                    </div>
                    {TABLE_DESCRIPTIONS[t.table_name] && (
                      <p className="text-[10px] text-text-3 leading-relaxed">{TABLE_DESCRIPTIONS[t.table_name]}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {form.table_name && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Policy name</label>
                <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={form.table_name} className={inputCls} />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Allowed operations *</label>
                <div className="flex gap-1.5 flex-wrap">
                  {DB_OPS.map((op) => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => toggleOp(op)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border",
                        form.operations.includes(op)
                          ? cn(OP_COLORS[op], "border-current/30")
                          : "border-border text-text-3 bg-surface-2 hover:border-border/60",
                      )}
                    >
                      {op}
                    </button>
                  ))}
                </div>
              </div>

              {!selectedTableInfo?.has_org_id && (
                <p className="text-[10px] text-amber bg-amber/10 rounded-lg px-2.5 py-1.5">
                  This table has no org_id — data is shared across all orgs. Proceed with caution.
                </p>
              )}

              <div className="flex gap-2">
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className={labelCls}>Row limit</label>
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    value={form.row_limit}
                    onChange={(e) => set("row_limit", e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Column allowlist</label>
                <input
                  value={form.column_allowlist}
                  onChange={(e) => set("column_allowlist", e.target.value)}
                  placeholder="col1, col2, col3 (empty = all columns)"
                  className={inputCls}
                />
                {selectedTableInfo && (
                  <p className="text-[10px] text-text-3">
                    Available: {selectedTableInfo.columns.map((c) => c.name).join(", ")}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Column blocklist</label>
                <input
                  value={form.column_blocklist}
                  onChange={(e) => set("column_blocklist", e.target.value)}
                  placeholder="secret_col, internal_col (always hidden)"
                  className={inputCls}
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} className="accent-violet" />
                <span className="text-xs text-text-2">Enabled</span>
              </label>
            </>
          )}

          {error && <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>}

          <button
            onClick={handleCreate}
            disabled={saving || !form.table_name || form.operations.length === 0}
            className="w-full py-2 rounded-xl bg-violet/20 hover:bg-violet/35 disabled:opacity-40 text-violet text-sm font-medium transition-colors"
          >
            {saving ? "Granting…" : "Grant Access"}
          </button>
        </div>
      )}

      {/* Policy list */}
      {isLoading ? (
        <p className="text-xs text-text-3 text-center py-4">Loading…</p>
      ) : policies.length === 0 && !creating ? (
        <div className="text-center py-8">
          <p className="text-sm text-text-3">No database access granted.</p>
          <p className="text-xs text-text-3 mt-1">Grant table access so this agent can read and write data.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {policies.map((p: AgentDbPolicy) => (
            <PolicyCard
              key={p.id}
              policy={p}
              onToggle={() => handleToggle(p.id)}
              onDelete={() => handleDelete(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PolicyCard({
  policy,
  onToggle,
  onDelete,
}: {
  policy: AgentDbPolicy;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className={cn(
      "rounded-xl border p-3 flex flex-col gap-2 transition-colors",
      policy.enabled ? "border-border bg-surface-2/30" : "border-border/40 bg-surface-2/10 opacity-60",
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-1 truncate">{policy.name}</p>
          <p className="text-[10px] text-text-3 font-mono mt-0.5">{policy.table_name}</p>
          {TABLE_DESCRIPTIONS[policy.table_name] && (
            <p className="text-[10px] text-text-2 mt-1 leading-relaxed">{TABLE_DESCRIPTIONS[policy.table_name]}</p>
          )}
        </div>
        <span className="text-[10px] text-text-3 bg-surface-2 px-1.5 py-0.5 rounded shrink-0">
          max {policy.row_limit} rows
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        {policy.allowed_operations.map((op) => (
          <span key={op} className={cn("text-[9px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide", OP_COLORS[op] ?? "text-text-3 bg-surface-2")}>
            {op}
          </span>
        ))}
      </div>

      {(policy.column_allowlist || policy.column_blocklist) && (
        <div className="text-[10px] text-text-3 space-y-0.5">
          {policy.column_allowlist && (
            <p>Allow: <span className="text-text-2">{policy.column_allowlist.join(", ")}</span></p>
          )}
          {policy.column_blocklist && (
            <p>Block: <span className="text-rose-400">{policy.column_blocklist.join(", ")}</span></p>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5 pt-1 border-t border-border/40">
        <button
          onClick={onToggle}
          className={cn(
            "px-2 py-1 rounded-lg text-[10px] font-medium transition-colors",
            policy.enabled
              ? "bg-surface-2 text-text-3 hover:text-rose-400"
              : "bg-violet/10 text-violet hover:bg-violet/20",
          )}
        >
          {policy.enabled ? "Disable" : "Enable"}
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
