"use client";

import { useState, Suspense, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Sidebar } from "@/components/layout/Sidebar";
import { CanvasView } from "@/components/canvas/CanvasView";
import { api, type BusinessUnit, type Agent, type AgentGroup } from "@/lib/api";

// ── Shared field styles ───────────────────────────────────────────────────────

const inputCls =
  "w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-violet";
const selectCls =
  "w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-1 outline-none focus:border-violet";
const labelCls = "text-xs font-medium text-text-3 uppercase tracking-widest";

function useGenerateInstructions(
  getName: () => string,
  getDescription: () => string,
  getSwarmName: () => string,
  onResult: (prompt: string) => void,
) {
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError]     = useState<string | null>(null);

  const generate = useCallback(async () => {
    const name = getName();
    if (!name.trim()) return;
    setGenerating(true);
    setGenError(null);
    try {
      const res = await api.agents.generateInstructions({
        name: name.trim(),
        description: getDescription().trim() || undefined,
        swarm_name: getSwarmName(),
      });
      onResult(res.prompt);
    } catch (err) {
      setGenError(String(err));
    } finally {
      setGenerating(false);
    }
  }, [getName, getDescription, getSwarmName, onResult]);

  return { generating, genError, generate };
}

// ── Agent create panel ────────────────────────────────────────────────────────

interface AgentCreatePanelProps {
  businessUnits: BusinessUnit[];
  groups: AgentGroup[];
  onClose: () => void;
  onCreated: () => void;
}

function AgentCreatePanel({ businessUnits, groups, onClose, onCreated }: AgentCreatePanelProps) {
  const [name, setName]               = useState("");
  const [description, setDescription] = useState("");
  const [buId, setBuId]               = useState(businessUnits[0]?.id ?? "");
  const [groupId, setGroupId]         = useState<string>("");
  const [status, setStatus]           = useState<string>("draft");
  const [prompt, setPrompt]           = useState("");
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    if (businessUnits.length > 0 && !buId) setBuId(businessUnits[0].id);
  }, [businessUnits, buId]);

  const buGroups = groups.filter((g) => g.business_unit_id === buId);
  const swarmName = businessUnits.find((b) => b.id === buId)?.name ?? "";

  const { generating, genError, generate } = useGenerateInstructions(
    useCallback(() => name, [name]),
    useCallback(() => description, [description]),
    useCallback(() => swarmName, [swarmName]),
    useCallback((p: string) => setPrompt(p), []),
  );

  const handleSave = async () => {
    if (!name.trim() || !buId) return;
    setSaving(true);
    setError(null);
    try {
      await api.agents.create({
        name: name.trim(),
        description: description.trim() || undefined,
        business_unit_id: buId,
        group_id: groupId || undefined,
        status,
        prompt: prompt.trim() || undefined,
      });
      onCreated();
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  };

  return (
    <div className="w-96 flex flex-col glass border-l border-border h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <span className="text-sm font-semibold text-text-1">New Agent</span>
        <button onClick={onClose} className="text-text-3 hover:text-text-2 text-lg leading-none">×</button>
      </div>

      <div className="flex flex-col gap-4 p-4 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Quota Forecaster" className={inputCls} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this agent do?" rows={2} className={`${inputCls} resize-none`} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Swarm *</label>
          {businessUnits.length === 0 ? (
            <p className="text-xs text-text-3 italic">No swarms available — create one first.</p>
          ) : (
            <select value={buId} onChange={(e) => { setBuId(e.target.value); setGroupId(""); }} className={selectCls}>
              {businessUnits.map((bu) => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
            </select>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Group</label>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={selectCls} disabled={buGroups.length === 0}>
            <option value="">No group</option>
            {buGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className={labelCls}>Instructions</label>
            <button
              type="button"
              onClick={generate}
              disabled={generating || !name.trim()}
              className="flex items-center gap-1 text-xs text-violet hover:text-violet/80 disabled:opacity-40 transition-colors"
            >
              <span>{generating ? "Generating…" : "✦ Generate with AI"}</span>
            </button>
          </div>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="System prompt or instructions for this agent…" rows={6} className={`${inputCls} resize-none`} />
          {genError && <p className="text-xs text-rose-400">{genError}</p>}
        </div>

        {error && <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>}
      </div>

      <div className="p-4 border-t border-border shrink-0 flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-border text-sm text-text-2 hover:text-text-1 hover:bg-surface-2 transition-colors">Cancel</button>
        <button onClick={handleSave} disabled={saving || !name.trim() || !buId} className="flex-1 py-2 rounded-xl bg-violet/20 hover:bg-violet/35 disabled:opacity-40 text-violet text-sm font-medium transition-colors">
          {saving ? "Creating…" : "Create Agent"}
        </button>
      </div>
    </div>
  );
}

// ── Agent properties panel ────────────────────────────────────────────────────

interface AgentPropertiesPanelProps {
  agent: Agent;
  businessUnits: BusinessUnit[];
  allGroups: AgentGroup[];
  onClose: () => void;
  onUpdated: () => void;
  onRun: (agentId: string) => void;
}

function AgentPropertiesPanel({ agent, businessUnits, allGroups, onClose, onUpdated, onRun }: AgentPropertiesPanelProps) {
  const [name, setName]               = useState(agent.name);
  const [description, setDescription] = useState(agent.description ?? "");
  const [buId, setBuId]               = useState(agent.business_unit_id);
  const [groupId, setGroupId]         = useState(agent.group_id ?? "");
  const [status, setStatus]           = useState(agent.status);
  const [prompt, setPrompt]           = useState<string>("");
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const { data: versions } = useSWR(
    ["agent-versions", agent.id],
    ([, id]) => api.agents.versions(id),
  );

  useEffect(() => {
    if (versions && versions.length > 0) {
      setPrompt(versions[0].prompt ?? "");
    }
  }, [versions]);

  // Reset form when agent changes
  useEffect(() => {
    setName(agent.name);
    setDescription(agent.description ?? "");
    setBuId(agent.business_unit_id);
    setGroupId(agent.group_id ?? "");
    setStatus(agent.status);
    setError(null);
  }, [agent.id]);

  const buGroups = allGroups.filter((g) => g.business_unit_id === buId);
  const swarmName = businessUnits.find((b) => b.id === buId)?.name ?? "";

  const { generating, genError, generate } = useGenerateInstructions(
    useCallback(() => name, [name]),
    useCallback(() => description, [description]),
    useCallback(() => swarmName, [swarmName]),
    useCallback((p: string) => setPrompt(p), []),
  );

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.agents.update(agent.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        business_unit_id: buId,
        group_id: groupId || null,
        status,
        prompt: prompt.trim() || undefined,
      });
      onUpdated();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="w-96 flex flex-col glass border-l border-border h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <span className="text-sm font-semibold text-text-1">Agent Properties</span>
        <button onClick={onClose} className="text-text-3 hover:text-text-2 text-lg leading-none">×</button>
      </div>

      <div className="flex flex-col gap-4 p-4 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="What does this agent do?" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Swarm</label>
          <select value={buId} onChange={(e) => { setBuId(e.target.value); setGroupId(""); }} className={selectCls}>
            {businessUnits.map((bu) => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Group</label>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={selectCls} disabled={buGroups.length === 0}>
            <option value="">No group</option>
            {buGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as Agent["status"])} className={selectCls}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className={labelCls}>Instructions</label>
            <button
              type="button"
              onClick={generate}
              disabled={generating || !name.trim()}
              className="flex items-center gap-1 text-xs text-violet hover:text-violet/80 disabled:opacity-40 transition-colors"
            >
              <span>{generating ? "Generating…" : "✦ Generate with AI"}</span>
            </button>
          </div>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6} className={`${inputCls} resize-none`} placeholder="System prompt or instructions for this agent…" />
          {genError && <p className="text-xs text-rose-400">{genError}</p>}
        </div>

        <div className="flex flex-col gap-1 pt-1 border-t border-border">
          <p className="text-xs text-text-3">Created {fmt(agent.created_at)}</p>
          <p className="text-xs text-text-3">Updated {fmt(agent.updated_at)}</p>
        </div>

        {error && <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>}
      </div>

      <div className="p-4 border-t border-border shrink-0 flex gap-2">
        {status === "published" && (
          <button
            onClick={() => onRun(agent.id)}
            className="px-3 py-2 rounded-xl bg-emerald/15 hover:bg-emerald/25 text-emerald text-sm font-medium transition-colors"
          >
            Run
          </button>
        )}
        <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-border text-sm text-text-2 hover:text-text-1 hover:bg-surface-2 transition-colors">Cancel</button>
        <button onClick={handleSave} disabled={saving || !name.trim()} className="flex-1 py-2 rounded-xl bg-violet/20 hover:bg-violet/35 disabled:opacity-40 text-violet text-sm font-medium transition-colors">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ── Run drawer ────────────────────────────────────────────────────────────────

interface RunDrawerProps {
  agentId: string;
  onClose: () => void;
}

function RunDrawer({ agentId, onClose }: RunDrawerProps) {
  const [message, setMessage] = useState("");
  const [events, setEvents]   = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  const startRun = async () => {
    if (!message.trim()) return;
    setRunning(true);
    setEvents([]);
    try {
      const run = await api.runs.create(agentId, message);
      const es = new EventSource(`/api/runs/${run.id}/stream`);
      es.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.content) setEvents((prev) => [...prev, data.content]);
        if (data.event === "complete" || data.event === "error") { setRunning(false); es.close(); }
      };
      es.onerror = () => { setRunning(false); es.close(); };
    } catch (err) {
      setEvents([String(err)]);
      setRunning(false);
    }
  };

  return (
    <div className="w-80 flex flex-col glass border-l border-border h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-text-1">Run Agent</span>
        <button onClick={onClose} className="text-text-3 hover:text-text-2 text-lg leading-none">×</button>
      </div>
      <div className="flex flex-col gap-3 p-4 flex-1 overflow-y-auto">
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Enter input for the agent…" rows={4} className={`${inputCls} resize-none`} />
        <button onClick={startRun} disabled={running || !message.trim()} className="w-full py-2 rounded-xl bg-violet/20 hover:bg-violet/35 disabled:opacity-40 text-violet text-sm font-medium transition-colors">
          {running ? "Running…" : "Run"}
        </button>
        {events.length > 0 && (
          <div className="space-y-2">
            {events.map((ev, i) => (
              <p key={i} className="text-xs text-text-2 bg-surface-2 rounded-lg p-2.5 whitespace-pre-wrap">{ev}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Canvas page ───────────────────────────────────────────────────────────────

type RightPanel =
  | { type: "create" }
  | { type: "properties"; agentId: string }
  | { type: "run"; agentId: string }
  | null;

function CanvasPageInner() {
  const searchParams = useSearchParams();
  const unitFilter   = searchParams.get("unit");

  const [rightPanel, setRightPanel] = useState<RightPanel>(
    searchParams.get("new") === "true" ? { type: "create" } : null,
  );

  useEffect(() => {
    if (searchParams.get("new") === "true") setRightPanel({ type: "create" });
  }, [searchParams]);

  const { data: units = [], mutate: mutateUnits } = useSWR(
    "business-units-canvas",
    () => api.businessUnits.list(),
  );

  const { data: agents = [], mutate: mutateAgents } = useSWR(
    ["agents-canvas", unitFilter],
    ([, uid]) => api.agents.list(uid ?? undefined),
  );

  const { data: groups = [], mutate: mutateGroups } = useSWR(
    "groups-canvas",
    () => api.groups.list(),
  );

  const refresh = () => { mutateUnits(); mutateAgents(); mutateGroups(); };

  const visibleUnits: BusinessUnit[] = unitFilter
    ? units.filter((u: BusinessUnit) => u.id === unitFilter)
    : units;

  const selectedAgent =
    rightPanel?.type === "properties" || rightPanel?.type === "run"
      ? (agents as Agent[]).find((a) => a.id === rightPanel.agentId) ?? null
      : null;

  const rightPanelEl =
    rightPanel?.type === "create" ? (
      <AgentCreatePanel
        businessUnits={visibleUnits.length > 0 ? visibleUnits : (units as BusinessUnit[])}
        groups={groups as AgentGroup[]}
        onClose={() => setRightPanel(null)}
        onCreated={() => { setRightPanel(null); refresh(); }}
      />
    ) : rightPanel?.type === "properties" && selectedAgent ? (
      <AgentPropertiesPanel
        agent={selectedAgent}
        businessUnits={units as BusinessUnit[]}
        allGroups={groups as AgentGroup[]}
        onClose={() => setRightPanel(null)}
        onUpdated={() => { refresh(); }}
        onRun={(id) => setRightPanel({ type: "run", agentId: id })}
      />
    ) : rightPanel?.type === "run" ? (
      <RunDrawer
        agentId={rightPanel.agentId}
        onClose={() => setRightPanel(null)}
      />
    ) : null;

  return (
    <div className="flex h-screen bg-surface-0 overflow-hidden">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          {visibleUnits.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-text-3 text-sm">
              No swarms found.
            </div>
          ) : (
            <div className="flex-1">
              <CanvasView
                businessUnits={visibleUnits}
                agents={agents as Agent[]}
                groups={groups as AgentGroup[]}
                onRun={(id) => setRightPanel({ type: "run", agentId: id })}
                onSelectAgent={(id) => setRightPanel({ type: "properties", agentId: id })}
                onDeselect={() => setRightPanel((p) => p?.type === "properties" ? null : p)}
                onReassign={async (agentId, newBuId) => {
                  try {
                    await api.agents.update(agentId, { business_unit_id: newBuId });
                    mutateAgents();
                  } catch (err) {
                    console.error("Reassign failed:", err);
                  }
                }}
              />
            </div>
          )}

          {rightPanelEl}
        </div>
      </div>
    </div>
  );
}

export default function CanvasPage() {
  return (
    <Suspense>
      <CanvasPageInner />
    </Suspense>
  );
}
