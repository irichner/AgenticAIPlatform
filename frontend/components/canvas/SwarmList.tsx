"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import useSWR from "swr";
import { ChevronDown, Search, Pencil, Trash2, Check, X } from "lucide-react";
import { api, type Agent, type AgentGroup, type BusinessUnit } from "@/lib/api";
import { cn } from "@/lib/cn";

const inputCls =
  "w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-violet";

const STATUS_DOT: Record<string, string> = {
  published: "bg-emerald",
  draft:     "bg-surface-2 border border-border",
  archived:  "bg-amber",
};

const STATUS_BADGE: Record<string, string> = {
  published: "text-emerald bg-emerald/10",
  draft:     "text-text-3 bg-surface-2",
  archived:  "text-amber bg-amber/10",
};

// ── Agent row ─────────────────────────────────────────────────────────────────

function AgentRow({
  agent,
  groups,
  selected,
  onSelect,
  onRun,
}: {
  agent: Agent;
  groups: AgentGroup[];
  selected: boolean;
  onSelect: () => void;
  onRun: () => void;
}) {
  const group = groups.find((g) => g.id === agent.group_id);

  return (
    <div
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors select-none",
        selected ? "bg-violet/8" : "hover:bg-surface-2/60",
      )}
    >
      <div className={cn("w-2 h-2 rounded-full shrink-0", STATUS_DOT[agent.status] ?? STATUS_DOT.draft)} />

      <span className={cn("text-sm flex-1 truncate", selected ? "text-text-1 font-medium" : "text-text-1")}>
        {agent.name}
      </span>

      {group && (
        <span className="text-[10px] text-text-3 bg-surface-2 px-1.5 py-0.5 rounded shrink-0 truncate max-w-[80px]">
          {group.name}
        </span>
      )}

      <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0", STATUS_BADGE[agent.status] ?? STATUS_BADGE.draft)}>
        {agent.status}
      </span>

      {agent.status === "published" && (
        <button
          onClick={(e) => { e.stopPropagation(); onRun(); }}
          className="text-[10px] px-2 py-0.5 rounded bg-emerald/10 text-emerald hover:bg-emerald/20 transition-colors shrink-0"
        >
          Run
        </button>
      )}
    </div>
  );
}

// ── Swarm section ─────────────────────────────────────────────────────────────

function SwarmSection({
  unit,
  agents,
  groups,
  selectedAgentId,
  collapsed,
  onToggleCollapse,
  onSelectAgent,
  onAddAgent,
  onRun,
  onRename,
  onDelete,
}: {
  unit: BusinessUnit;
  agents: Agent[];
  groups: AgentGroup[];
  selectedAgentId: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectAgent: (id: string) => void;
  onAddAgent: () => void;
  onRun: (id: string) => void;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing]         = useState(false);
  const [editName, setEditName]       = useState(unit.name);
  const [saving, setSaving]           = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [working, setWorking]         = useState(false);
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) { setEditName(unit.name); editRef.current?.focus(); }
  }, [editing, unit.name]);

  const handleRename = async () => {
    const name = editName.trim();
    if (!name || name === unit.name) { setEditing(false); return; }
    setSaving(true);
    try { await onRename(unit.id, name); setEditing(false); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setWorking(true);
    try { await onDelete(unit.id); }
    finally { setWorking(false); setDeleting(false); setDeleteInput(""); }
  };

  const hasAgents      = agents.length > 0;
  const deleteReady    = !hasAgents || deleteInput === unit.name;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div
        onClick={!editing && !deleting ? onToggleCollapse : undefined}
        className={cn(
          "flex items-center gap-2.5 px-4 py-3 bg-surface-1 transition-colors",
          !editing && !deleting && "hover:bg-surface-2 cursor-pointer select-none",
        )}
      >
        {!editing && (
          <ChevronDown
            className={cn("w-3.5 h-3.5 text-text-3 transition-transform shrink-0", collapsed && "-rotate-90")}
          />
        )}

        {editing ? (
          <input
            ref={editRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") setEditing(false);
            }}
            disabled={saving}
            className="flex-1 bg-surface-2 border border-violet rounded-lg px-2 py-0.5 text-sm font-semibold text-text-1 outline-none"
          />
        ) : (
          <span className="text-sm font-semibold text-text-1 flex-1 truncate">{unit.name}</span>
        )}

        {editing ? (
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button onClick={handleRename} disabled={saving || !editName.trim()} className="p-1 text-emerald hover:text-emerald/80 disabled:opacity-40 transition-colors">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setEditing(false)} className="p-1 text-text-3 hover:text-text-2 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <>
            <span className="text-xs text-text-3 bg-surface-2 px-2 py-0.5 rounded-full shrink-0">
              {agents.length}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onAddAgent(); }}
              className="text-xs text-violet hover:text-violet/80 transition-colors shrink-0 ml-1"
            >
              + Add Agent
            </button>
            <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => { setDeleting(false); setEditing(true); }}
                className="p-1 text-text-3 hover:text-text-2 transition-colors rounded"
                title="Rename swarm"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                onClick={() => { setEditing(false); setDeleteInput(""); setDeleting((v) => !v); }}
                className="p-1 text-text-3 hover:text-rose-400 transition-colors rounded"
                title="Delete swarm"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Delete confirmation */}
      {deleting && (
        <div className="px-4 py-3 bg-rose-500/5 border-t border-rose-500/20 flex flex-col gap-2">
          {hasAgents ? (
            <>
              <p className="text-xs text-rose-400">
                This swarm contains <span className="font-semibold">{agents.length} agent{agents.length !== 1 ? "s" : ""}</span> that will also be permanently deleted. Type the swarm name to confirm.
              </p>
              <input
                autoFocus
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") { setDeleting(false); setDeleteInput(""); } }}
                placeholder={unit.name}
                className="w-full bg-surface-2 border border-rose-500/30 focus:border-rose-400 rounded-lg px-3 py-1.5 text-sm text-text-1 placeholder:text-text-3 outline-none"
              />
            </>
          ) : (
            <p className="text-xs text-rose-400">Delete <span className="font-semibold">{unit.name}</span>? This cannot be undone.</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => { setDeleting(false); setDeleteInput(""); }}
              className="flex-1 py-1.5 rounded-lg border border-border text-xs text-text-2 hover:text-text-1 hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={!deleteReady || working}
              className="flex-1 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 disabled:opacity-40 text-rose-400 text-xs font-medium transition-colors"
            >
              {working ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      )}

      {/* Agent list */}
      {!collapsed && (
        <div className="divide-y divide-border/30">
          {agents.length === 0 ? (
            <p className="px-4 py-3 text-xs text-text-3 italic">
              No agents yet — click + Add Agent above.
            </p>
          ) : (
            agents.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                groups={groups}
                selected={selectedAgentId === agent.id}
                onSelect={() => onSelectAgent(agent.id)}
                onRun={() => onRun(agent.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── SwarmList ─────────────────────────────────────────────────────────────────

interface SwarmListProps {
  agents: Agent[];
  groups: AgentGroup[];
  selectedAgentId: string | null;
  orgId: string | null;
  onSelectAgent: (id: string) => void;
  onAddToSwarm: (buId: string) => void;
  onRun: (id: string) => void;
  onRefresh: () => void;
}

export function SwarmList({
  agents,
  groups,
  selectedAgentId,
  orgId,
  onSelectAgent,
  onAddToSwarm,
  onRun,
  onRefresh,
}: SwarmListProps) {
  const storageKey = `swarm-collapsed-${orgId}`;

  // Own SWR subscription — same cache key as the page so they stay in sync
  const { data: allUnits = [], mutate: mutateUnits } = useSWR(
    orgId ? ["business-units-canvas", orgId] : null,
    () => api.businessUnits.list(),
  );

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      if (typeof window === "undefined") return {};
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  const [search, setSearch] = useState("");

  // New swarm form
  const [creatingSwarm, setCreatingSwarm] = useState(false);
  const [newSwarmName, setNewSwarmName]   = useState("");
  const [savingSwarm, setSavingSwarm]     = useState(false);

  // Persist collapsed state
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(collapsed)); } catch { /* ignore */ }
  }, [collapsed, storageKey]);

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  const filteredAgents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter((a) => a.name.toLowerCase().includes(q));
  }, [agents, search]);

  const agentsByUnit = useMemo(() => {
    const map: Record<string, Agent[]> = {};
    for (const a of filteredAgents) {
      if (!map[a.business_unit_id]) map[a.business_unit_id] = [];
      map[a.business_unit_id].push(a);
    }
    return map;
  }, [filteredAgents]);

  // When searching, only show swarms with matching agents
  const visibleUnits = search.trim()
    ? allUnits.filter((u) => (agentsByUnit[u.id]?.length ?? 0) > 0)
    : allUnits;

  const handleRenameSwarm = async (id: string, name: string) => {
    const updated = await api.businessUnits.update(id, { name });
    await mutateUnits(
      (prev = []) => prev.map((u) => u.id === id ? { ...u, ...updated } : u),
      { revalidate: false },
    );
  };

  const handleDeleteSwarm = async (id: string) => {
    await api.businessUnits.delete(id);
    await mutateUnits((prev = []) => prev.filter((u) => u.id !== id), { revalidate: false });
  };

  const handleCreateSwarm = async () => {
    const name = newSwarmName.trim();
    if (!name) return;
    setSavingSwarm(true);
    try {
      const unit = await api.businessUnits.create({ name });
      // Directly insert into SWR cache — same key as page, so both stay in sync
      await mutateUnits([...allUnits, unit], { revalidate: false });
      setCreatingSwarm(false);
      setNewSwarmName("");
      onRefresh();
    } catch { /* ignore */ } finally {
      setSavingSwarm(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-3 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents…"
            className="w-full bg-surface-2 border border-border rounded-xl pl-8 pr-3 py-1.5 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-violet"
          />
        </div>
        <button
          onClick={() => { setCreatingSwarm((v) => !v); setNewSwarmName(""); }}
          className="text-xs text-violet hover:text-violet/80 transition-colors whitespace-nowrap"
        >
          {creatingSwarm ? "Cancel" : "+ New Swarm"}
        </button>
      </div>

      {/* New swarm inline form */}
      {creatingSwarm && (
        <div className="flex gap-2 px-4 py-2 border-b border-border shrink-0">
          <input
            autoFocus
            value={newSwarmName}
            onChange={(e) => setNewSwarmName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateSwarm();
              if (e.key === "Escape") setCreatingSwarm(false);
            }}
            placeholder="Swarm name…"
            disabled={savingSwarm}
            className={cn(inputCls, "flex-1")}
          />
          <button
            onClick={handleCreateSwarm}
            disabled={savingSwarm || !newSwarmName.trim()}
            className="px-3 py-2 rounded-xl bg-violet/20 hover:bg-violet/35 disabled:opacity-40 text-violet text-xs font-medium transition-colors shrink-0"
          >
            {savingSwarm ? "…" : "Create"}
          </button>
        </div>
      )}

      {/* Swarm list */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {allUnits.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <p className="text-sm text-text-2">No swarms yet.</p>
            <p className="text-xs text-text-3">Create a swarm to start organising your agents.</p>
            <button
              onClick={() => setCreatingSwarm(true)}
              className="px-4 py-2 rounded-xl bg-violet/20 hover:bg-violet/35 text-violet text-sm font-medium transition-colors"
            >
              + New Swarm
            </button>
          </div>
        ) : visibleUnits.length === 0 ? (
          <p className="text-sm text-text-3 text-center pt-8">No agents match &ldquo;{search}&rdquo;</p>
        ) : (
          visibleUnits.map((unit) => (
            <SwarmSection
              key={unit.id}
              unit={unit}
              agents={agentsByUnit[unit.id] ?? []}
              groups={groups}
              selectedAgentId={selectedAgentId}
              collapsed={collapsed[unit.id] ?? false}
              onToggleCollapse={() => toggleCollapse(unit.id)}
              onSelectAgent={onSelectAgent}
              onAddAgent={() => onAddToSwarm(unit.id)}
              onRun={onRun}
              onRename={handleRenameSwarm}
              onDelete={handleDeleteSwarm}
            />
          ))
        )}
      </div>
    </div>
  );
}
