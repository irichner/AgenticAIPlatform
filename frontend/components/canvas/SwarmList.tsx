"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import useSWR from "swr";
import { ChevronDown, Search, Pencil, Trash2, Check, X, Plus } from "lucide-react";
import { api, type Agent, type AgentGroup, type BusinessUnit } from "@/lib/api";
import { cn } from "@/lib/cn";

const STATUSES = ["draft", "published", "archived"] as const;

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
  selected,
  onSelect,
  onRun,
  onRefresh,
  isRunning,
}: {
  agent: Agent;
  selected: boolean;
  onSelect: () => void;
  onRun: () => void;
  onRefresh: () => void;
  isRunning?: boolean;
}) {
  const [statusOpen, setStatusOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const handleStatusChange = async (s: string) => {
    setUpdatingStatus(true);
    try {
      await api.agents.update(agent.id, { status: s as Agent["status"] });
      onRefresh();
    } catch { /* ignore */ } finally {
      setUpdatingStatus(false);
      setStatusOpen(false);
    }
  };

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

      {/* Status dropdown button */}
      <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setStatusOpen((v) => !v)}
          disabled={updatingStatus}
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors",
            STATUS_BADGE[agent.status] ?? STATUS_BADGE.draft,
          )}
        >
          {updatingStatus ? "…" : agent.status}
        </button>
        {statusOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setStatusOpen(false)} />
            <div className="absolute right-0 top-full mt-1 z-50 bg-surface-1 border border-border rounded-xl shadow-lg overflow-hidden min-w-[100px]">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-xs hover:bg-surface-2 transition-colors",
                    s === agent.status && "text-violet font-medium",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {agent.status === "published" && (
        <button
          onClick={(e) => { e.stopPropagation(); onRun(); }}
          className={cn(
            "text-[10px] px-2 py-0.5 rounded font-medium transition-colors shrink-0",
            isRunning
              ? "bg-violet/15 text-violet"
              : "bg-emerald/10 text-emerald hover:bg-emerald/20",
          )}
        >
          {isRunning ? "Running…" : "Run"}
        </button>
      )}
    </div>
  );
}

// ── Add menu ──────────────────────────────────────────────────────────────────

function AddMenu({ onAddAgent, onCreateSubSwarm }: { onAddAgent: () => void; onCreateSubSwarm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="p-1.5 text-text-3 hover:text-violet transition-colors rounded"
        title="Add…"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1.5 z-50 bg-surface-1 border border-border rounded-xl shadow-xl overflow-hidden min-w-[160px]">
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onAddAgent(); }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-2 transition-colors text-text-1 flex flex-col gap-0.5"
            >
              <span className="font-medium">New Agent</span>
              <span className="text-[10px] text-text-3">Add an agent to this swarm</span>
            </button>
            <div className="h-px bg-border mx-2" />
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onCreateSubSwarm(); }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-2 transition-colors text-text-1 flex flex-col gap-0.5"
            >
              <span className="font-medium">Sub-swarm</span>
              <span className="text-[10px] text-text-3">Nest a swarm inside this one</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Inline sub-swarm create form ──────────────────────────────────────────────

function InlineSwarmForm({
  placeholder,
  saving,
  onSave,
  onCancel,
}: {
  placeholder: string;
  saving: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  return (
    <>
      {!name.trim() && (
        <div className="fixed inset-0 z-10" onClick={onCancel} />
      )}
      <div className="relative z-20 flex gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onSave(name.trim());
            if (e.key === "Escape") onCancel();
          }}
          placeholder={placeholder}
          disabled={saving}
          className={cn(inputCls, "flex-1")}
        />
        <button
          onClick={() => { if (name.trim()) onSave(name.trim()); }}
          disabled={saving || !name.trim()}
          className="px-3 py-2 rounded-xl bg-violet/20 hover:bg-violet/35 disabled:opacity-40 text-violet text-xs font-medium transition-colors shrink-0"
        >
          {saving ? "…" : "Create"}
        </button>
      </div>
    </>
  );
}

// ── Swarm section ─────────────────────────────────────────────────────────────

function SwarmSection({
  unit,
  agents,
  subSwarms,
  groups,
  selectedAgentId,
  runningAgentId,
  collapsed,
  onToggleCollapse,
  onSelectAgent,
  onAddAgent,
  onCreateSubSwarm,
  onDrillDown,
  onRun,
  onRefresh,
  onRename,
  onDelete,
  totalAgents,
}: {
  unit: BusinessUnit;
  agents: Agent[];
  subSwarms: BusinessUnit[];
  groups: AgentGroup[];
  selectedAgentId: string | null;
  runningAgentId: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectAgent: (id: string) => void;
  onAddAgent: () => void;
  onCreateSubSwarm: () => void;
  onDrillDown?: (id: string) => void;
  onRun: (id: string) => void;
  onRefresh: () => void;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  totalAgents?: number;
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

  const hasAgents    = agents.length > 0;
  const hasChildren  = subSwarms.length > 0;
  const needsConfirm = hasAgents || hasChildren;
  const deleteReady  = !needsConfirm || deleteInput === unit.name;

  return (
    <div className="rounded-xl border border-border">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-4 bg-surface-1 transition-colors hover:bg-surface-2">
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
          <div
            onClick={!deleting ? onToggleCollapse : undefined}
            className={cn("flex items-center gap-1.5 flex-1 min-w-0", !deleting && "cursor-pointer select-none")}
          >
            <span className="text-sm font-semibold text-text-1 truncate">{unit.name}</span>
            <span className="text-[10px] text-text-3 bg-surface-2 px-1.5 py-0.5 rounded-full shrink-0">
              {subSwarms.length > 0 ? subSwarms.length : agents.length}
            </span>
            {totalAgents !== undefined && (
              <span className="text-[10px] text-text-3 bg-violet/10 text-violet px-1.5 py-0.5 rounded-full shrink-0">
                {totalAgents} agents
              </span>
            )}
          </div>
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
          <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <AddMenu onAddAgent={onAddAgent} onCreateSubSwarm={onCreateSubSwarm} />
            <button
              onClick={() => { setDeleting(false); setEditing(true); }}
              className="p-1.5 text-text-3 hover:text-text-2 transition-colors rounded"
              title="Rename swarm"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { setEditing(false); setDeleteInput(""); setDeleting((v) => !v); }}
              className="p-1.5 text-text-3 hover:text-rose-400 transition-colors rounded"
              title="Delete swarm"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {deleting && (
        <div className="px-4 py-3 bg-rose-500/5 border-t border-rose-500/20 flex flex-col gap-2">
          {needsConfirm ? (
            <>
              <p className="text-xs text-rose-400">
                {hasAgents && hasChildren
                  ? <>Contains <span className="font-semibold">{agents.length} agent{agents.length !== 1 ? "s" : ""}</span> (deleted) and <span className="font-semibold">{subSwarms.length} sub-swarm{subSwarms.length !== 1 ? "s" : ""}</span> (promoted to top-level). Type the name to confirm.</>
                  : hasAgents
                  ? <>Contains <span className="font-semibold">{agents.length} agent{agents.length !== 1 ? "s" : ""}</span> that will be permanently deleted. Type the name to confirm.</>
                  : <>Contains <span className="font-semibold">{subSwarms.length} sub-swarm{subSwarms.length !== 1 ? "s" : ""}</span> that will be promoted to top-level. Type the name to confirm.</>}
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
          {agents.length === 0 && subSwarms.length === 0 ? (
            <p className="px-4 py-3 text-xs text-text-3 italic">
              No agents yet — click + to add an agent or sub-swarm.
            </p>
          ) : (
            agents.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                selected={selectedAgentId === agent.id}
                isRunning={runningAgentId === agent.id}
                onSelect={() => onSelectAgent(agent.id)}
                onRun={() => onRun(agent.id)}
                onRefresh={onRefresh}
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
  runningAgentId?: string | null;
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
  runningAgentId = null,
  orgId,
  onSelectAgent,
  onAddToSwarm,
  onRun,
  onRefresh,
}: SwarmListProps) {
  const storageKey = `swarm-collapsed-${orgId}`;

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
  const expandedForRef = useRef<string | null>(null);

  // Auto-expand the swarm path to the selected agent (once per selection)
  useEffect(() => {
    if (!selectedAgentId || allUnits.length === 0) return;
    if (expandedForRef.current === selectedAgentId) return;
    const selectedAgent = agents.find((a) => a.id === selectedAgentId);
    if (!selectedAgent) return;
    expandedForRef.current = selectedAgentId;
    const unitIds: string[] = [];
    let currentId: string | null | undefined = selectedAgent.business_unit_id;
    while (currentId) {
      unitIds.push(currentId);
      currentId = allUnits.find((u) => u.id === currentId)?.parent_id;
    }
    setCollapsed((prev) => {
      const next = { ...prev };
      for (const id of unitIds) next[id] = false;
      return next;
    });
  }, [selectedAgentId, agents, allUnits]);

  // Create-swarm form state
  const [creatingSwarm, setCreatingSwarm]       = useState(false);
  const [newSwarmParentId, setNewSwarmParentId] = useState<string | null>(null);
  const [savingSwarm, setSavingSwarm]           = useState(false);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(collapsed)); } catch { /* ignore */ }
  }, [collapsed, storageKey]);

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));

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

  const subSwarmsByParent = useMemo(() => {
    const map: Record<string, BusinessUnit[]> = {};
    for (const u of allUnits) {
      if (u.parent_id) {
        if (!map[u.parent_id]) map[u.parent_id] = [];
        map[u.parent_id].push(u);
      }
    }
    return map;
  }, [allUnits]);

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

  const dismissCreateForm = () => {
    setCreatingSwarm(false);
    setNewSwarmParentId(null);
  };

  const openCreateSubSwarm = (parentId: string) => {
    setNewSwarmParentId(parentId);
    setCreatingSwarm(true);
  };

  const openCreateTopLevel = () => {
    setNewSwarmParentId(null);
    setCreatingSwarm((v) => !v);
  };

  const handleCreateSwarm = async (name: string) => {
    setSavingSwarm(true);
    try {
      const unit = await api.businessUnits.create({
        name,
        ...(newSwarmParentId ? { parent_id: newSwarmParentId } : {}),
      });
      await mutateUnits([...allUnits, unit], { revalidate: false });
      setCreatingSwarm(false);
      setNewSwarmParentId(null);
      onRefresh();
    } catch { /* ignore */ } finally {
      setSavingSwarm(false);
    }
  };

  // ── Tree view — all swarms expandable ────────────────────────────────────────
  const topLevelUnits = allUnits.filter((u) => !u.parent_id);

  const countAgentsDeep = (unitId: string): number => {
    const direct = agentsByUnit[unitId]?.length ?? 0;
    const children = subSwarmsByParent[unitId] ?? [];
    return direct + children.reduce((sum, child) => sum + countAgentsDeep(child.id), 0);
  };

  const renderUnit = (unit: BusinessUnit, depth: number = 0): React.ReactNode => {
    const unitAgents     = agentsByUnit[unit.id] ?? [];
    const children       = subSwarmsByParent[unit.id] ?? [];
    const isCollapsed    = collapsed[unit.id] ?? true;
    const isCreatingChild = creatingSwarm && newSwarmParentId === unit.id;

    return (
      <div key={unit.id} className={cn(depth > 0 && "ml-3 pl-3 border-l border-border/50")}>
        <SwarmSection
          unit={unit}
          agents={unitAgents}
          subSwarms={children}
          groups={groups}
          selectedAgentId={selectedAgentId}
          runningAgentId={runningAgentId}
          collapsed={isCollapsed}
          onToggleCollapse={() => toggleCollapse(unit.id)}
          onSelectAgent={onSelectAgent}
          onAddAgent={() => onAddToSwarm(unit.id)}
          onCreateSubSwarm={() => openCreateSubSwarm(unit.id)}
          onRun={onRun}
          onRefresh={onRefresh}
          onRename={handleRenameSwarm}
          onDelete={handleDeleteSwarm}
          totalAgents={depth === 0 ? countAgentsDeep(unit.id) : undefined}
        />
        {isCreatingChild && (
          <div className="ml-4 pl-3 border-l-2 border-violet/30 py-2">
            <InlineSwarmForm
              placeholder={`Sub-swarm of ${unit.name}…`}
              saving={savingSwarm}
              onSave={handleCreateSwarm}
              onCancel={dismissCreateForm}
            />
          </div>
        )}
        {!isCollapsed && children.length > 0 && (
          <div className="mt-1">
            {children.map((child) => renderUnit(child, depth + 1))}
          </div>
        )}
      </div>
    );
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
          onClick={openCreateTopLevel}
          className="text-xs text-violet hover:text-violet/80 transition-colors whitespace-nowrap"
        >
          {creatingSwarm && !newSwarmParentId ? "Cancel" : "+Swarm"}
        </button>
      </div>

      {/* Top-level swarm create form */}
      {creatingSwarm && !newSwarmParentId && (
        <div className="px-4 py-2 border-b border-border shrink-0">
          <InlineSwarmForm
            placeholder="Swarm name…"
            saving={savingSwarm}
            onSave={handleCreateSwarm}
            onCancel={dismissCreateForm}
          />
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {allUnits.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <p className="text-sm text-text-2">No swarms yet.</p>
            <p className="text-xs text-text-3">Create a swarm to start organising your agents.</p>
            <button
              onClick={() => { setNewSwarmParentId(null); setCreatingSwarm(true); }}
              className="px-4 py-2 rounded-xl bg-violet/20 hover:bg-violet/35 text-violet text-sm font-medium transition-colors"
            >
              +Swarm
            </button>
          </div>
        ) : topLevelUnits.length === 0 ? (
          <p className="text-sm text-text-3 text-center pt-8">No results for &ldquo;{search}&rdquo;</p>
        ) : (
          topLevelUnits.map((unit) => renderUnit(unit))
        )}
      </div>
    </div>
  );
}
