"use client";

import { useState, useRef, Suspense, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Server } from "lucide-react";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle, usePanelRef, type PanelImperativeHandle } from "react-resizable-panels";
import { Sidebar } from "@/components/layout/Sidebar";
import { SwarmList } from "@/components/canvas/SwarmList";
import { AgentSchedulesTab } from "@/components/canvas/AgentSchedulesTab";
import { AgentDbAccessTab } from "@/components/canvas/AgentDbAccessTab";
import { AgentToolsTab } from "@/components/canvas/AgentToolsTab";
import { AgentPromptTab } from "@/components/canvas/AgentPromptTab";
import { AgentGraphTab } from "@/components/canvas/AgentGraphTab";
import { AgentConsole } from "@/components/canvas/AgentConsole";
import { api, type BusinessUnit, type Agent, type AgentGroup, type AiModel, type McpServer } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { getOrgItem, setOrgItem } from "@/lib/org-storage";
import { cn } from "@/lib/cn";

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

// ── MCP server picker ─────────────────────────────────────────────────────────

interface McpPickerProps {
  mcpServers: McpServer[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

function McpPicker({ mcpServers, selectedIds, onChange }: McpPickerProps) {
  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((s) => s !== id)
        : [...selectedIds, id],
    );
  };

  const activeCount = selectedIds.filter((id) => mcpServers.some((s) => s.id === id)).length;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className={labelCls}>MCP Servers</label>
        <span className="text-xs text-text-3">
          {activeCount > 0 ? `${activeCount} of ${mcpServers.length}` : mcpServers.length > 0 ? "none" : ""}
        </span>
      </div>

      {mcpServers.length === 0 ? (
        <p className="text-xs text-text-3 italic">No MCP servers registered. Add them in Admin → MCP Servers.</p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          {mcpServers.map((server, i) => {
            const active = selectedIds.includes(server.id);
            return (
              <button
                key={server.id}
                type="button"
                onClick={() => toggle(server.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                  i > 0 && "border-t border-border",
                  active ? "bg-violet/8" : "hover:bg-surface-2",
                )}
              >
                <div className={cn(
                  "w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors",
                  active ? "bg-violet/20" : "bg-surface-2",
                )}>
                  <Server className={cn("w-3 h-3", active ? "text-violet" : "text-text-3")} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className={cn("text-xs font-medium truncate", active ? "text-text-1" : "text-text-2")}>
                    {server.name}
                  </p>
                  {server.description && (
                    <p className="text-[10px] text-text-3 truncate">{server.description}</p>
                  )}
                </div>

                <span className={cn(
                  "text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 uppercase tracking-wide",
                  active ? "bg-violet/15 text-violet" : "bg-surface-2 text-text-3",
                )}>
                  {server.transport.replace(/_/g, " ")}
                </span>

                <div className={cn(
                  "w-3.5 h-3.5 rounded-full border shrink-0 transition-colors",
                  active ? "bg-violet border-violet" : "border-border",
                )} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Agent create panel ────────────────────────────────────────────────────────

interface AgentCreatePanelProps {
  businessUnits: BusinessUnit[];
  groups: AgentGroup[];
  aiModels: AiModel[];
  mcpServers: McpServer[];
  defaultBuId?: string;
  onClose: () => void;
  onCreated: () => void;
}

function AgentCreatePanel({ businessUnits, groups, aiModels, mcpServers, defaultBuId, onClose, onCreated }: AgentCreatePanelProps) {
  const [name, setName]               = useState("");
  const [description, setDescription] = useState("");
  const [buId, setBuId]               = useState(defaultBuId ?? businessUnits[0]?.id ?? "");
  const [groupId, setGroupId]         = useState<string>("");
  const [modelId, setModelId]         = useState<string>("");
  const [status, setStatus]           = useState<string>("draft");
  const [prompt, setPrompt]           = useState("");
  const [mcpIds, setMcpIds]           = useState<string[]>([]);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);

  // Inline swarm creation
  const [creatingSwarm, setCreatingSwarm]   = useState(false);
  const [newSwarmName, setNewSwarmName]     = useState("");
  const [savingSwarm, setSavingSwarm]       = useState(false);
  const [extraUnits, setExtraUnits]         = useState<BusinessUnit[]>([]);

  // Inline group creation
  const [creatingGroup, setCreatingGroup]   = useState(false);
  const [newGroupName, setNewGroupName]     = useState("");
  const [savingGroup, setSavingGroup]       = useState(false);
  const [extraGroups, setExtraGroups]       = useState<AgentGroup[]>([]);

  const allUnits  = [...businessUnits, ...extraUnits];
  const allGroups = [...groups, ...extraGroups];

  useEffect(() => {
    if (allUnits.length > 0 && !buId) setBuId(allUnits[0].id);
  }, [businessUnits, buId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateSwarm = async () => {
    const n = newSwarmName.trim();
    if (!n) return;
    setSavingSwarm(true);
    try {
      const unit = await api.businessUnits.create({ name: n });
      setExtraUnits((prev) => [...prev, unit]);
      setBuId(unit.id);
      setGroupId("");
      setCreatingSwarm(false);
      setNewSwarmName("");
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingSwarm(false);
    }
  };

  const handleCreateGroup = async () => {
    const n = newGroupName.trim();
    if (!n || !buId) return;
    setSavingGroup(true);
    try {
      const group = await api.groups.create({ name: n, business_unit_id: buId });
      setExtraGroups((prev) => [...prev, group]);
      setGroupId(group.id);
      setCreatingGroup(false);
      setNewGroupName("");
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingGroup(false);
    }
  };

  const buGroups  = allGroups.filter((g) => g.business_unit_id === buId);
  const swarmName = allUnits.find((b) => b.id === buId)?.name ?? "";

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
        model_id: modelId || null,
        status,
        prompt: prompt.trim() || undefined,
        mcp_server_ids: mcpIds,
      });
      onCreated();
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <span className="text-base font-semibold text-text-1">New Agent</span>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-2 transition-colors text-lg leading-none">×</button>
      </div>

      <div className="flex flex-col gap-4 px-6 py-5 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Quota Forecaster" className={inputCls} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this agent do?" rows={2} className={`${inputCls} resize-none`} />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className={labelCls}>Swarm *</label>
            {!defaultBuId && (
              <button
                type="button"
                onClick={() => { setCreatingSwarm((v) => !v); setNewSwarmName(""); }}
                className="text-xs text-violet hover:text-violet/80 transition-colors"
              >
                {creatingSwarm ? "Cancel" : "+ New"}
              </button>
            )}
          </div>
          {defaultBuId ? (
            <p className="text-sm text-text-1 bg-surface-2 border border-border rounded-xl px-3 py-2">
              {allUnits.find((u) => u.id === defaultBuId)?.name ?? defaultBuId}
            </p>
          ) : creatingSwarm ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={newSwarmName}
                onChange={(e) => setNewSwarmName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateSwarm(); if (e.key === "Escape") setCreatingSwarm(false); }}
                placeholder="Swarm name…"
                disabled={savingSwarm}
                className={`${inputCls} flex-1`}
              />
              <button
                onClick={handleCreateSwarm}
                disabled={savingSwarm || !newSwarmName.trim()}
                className="px-3 py-2 rounded-xl bg-violet/20 hover:bg-violet/35 disabled:opacity-40 text-violet text-xs font-medium transition-colors shrink-0"
              >
                {savingSwarm ? "…" : "Create"}
              </button>
            </div>
          ) : allUnits.length === 0 ? (
            <p className="text-xs text-text-3 italic">No swarms yet — create one above.</p>
          ) : (
            <select value={buId} onChange={(e) => { setBuId(e.target.value); setGroupId(""); }} className={selectCls}>
              {allUnits.map((bu) => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
            </select>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className={labelCls}>Group</label>
            {buId && (
              <button
                type="button"
                onClick={() => { setCreatingGroup((v) => !v); setNewGroupName(""); }}
                className="text-xs text-violet hover:text-violet/80 transition-colors"
              >
                {creatingGroup ? "Cancel" : "+ New"}
              </button>
            )}
          </div>
          {creatingGroup ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateGroup(); if (e.key === "Escape") setCreatingGroup(false); }}
                placeholder="Group name…"
                disabled={savingGroup}
                className={`${inputCls} flex-1`}
              />
              <button
                onClick={handleCreateGroup}
                disabled={savingGroup || !newGroupName.trim()}
                className="px-3 py-2 rounded-xl bg-violet/20 hover:bg-violet/35 disabled:opacity-40 text-violet text-xs font-medium transition-colors shrink-0"
              >
                {savingGroup ? "…" : "Create"}
              </button>
            </div>
          ) : (
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={selectCls} disabled={buGroups.length === 0}>
              <option value="">No group</option>
              {buGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>AI Model</label>
          <select value={modelId} onChange={(e) => setModelId(e.target.value)} className={selectCls}>
            <option value="">Platform default</option>
            {aiModels.filter((m) => m.enabled).map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
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

        <McpPicker mcpServers={mcpServers} selectedIds={mcpIds} onChange={setMcpIds} />

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
      </div>

      <div className="flex flex-col gap-2 px-6 py-4 border-t border-border shrink-0">
        {error && <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-border text-sm text-text-2 hover:text-text-1 hover:bg-surface-2 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving || !name.trim() || !buId} className="flex-1 py-2 rounded-xl bg-violet/20 hover:bg-violet/35 disabled:opacity-40 text-violet text-sm font-medium transition-colors">
            {saving ? "Creating…" : "Create Agent"}
          </button>
        </div>
      </div>
    </div>
  );
}

const AGENT_FORM_SUBKEY = (id: string) => `agent-form:${id}`;

// ── Agent properties panel ────────────────────────────────────────────────────

interface AgentPropertiesPanelProps {
  agent: Agent;
  businessUnits: BusinessUnit[];
  allGroups: AgentGroup[];
  aiModels: AiModel[];
  mcpServers: McpServer[];
  activeNodeId: string | null;
  hasRunStarted: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  onRun: (agentId: string, message: string) => void;
}

type AgentTab = "profile" | "schedules" | "memory" | "mcp" | "instructions" | "graph";

function AgentPropertiesPanel({ agent, businessUnits, allGroups, aiModels, mcpServers, activeNodeId, hasRunStarted, onClose, onSaved, onDeleted, onRun }: AgentPropertiesPanelProps) {
  const { currentOrg } = useAuth();
  const orgId = currentOrg?.id ?? null;
  const [activeTab, setActiveTab]      = useState<AgentTab>("profile");
  const [name, setName]               = useState(agent.name);
  const [description, setDescription] = useState(agent.description ?? "");
  const [buId, setBuId]               = useState(agent.business_unit_id);
  const [groupId, setGroupId]         = useState(agent.group_id ?? "");
  const [modelId, setModelId]         = useState(agent.model_id ?? "");
  const [status, setStatus]           = useState(agent.status);
  const [mcpIds, setMcpIds]           = useState<string[]>(agent.mcp_servers?.map((s) => s.id) ?? []);

  // Inline swarm creation
  const [creatingSwarm, setCreatingSwarm]   = useState(false);
  const [newSwarmName, setNewSwarmName]     = useState("");
  const [savingSwarm, setSavingSwarm]       = useState(false);
  const [extraUnits, setExtraUnits]         = useState<BusinessUnit[]>([]);

  // Inline group creation
  const [creatingGroup, setCreatingGroup]   = useState(false);
  const [newGroupName, setNewGroupName]     = useState("");
  const [savingGroup, setSavingGroup]       = useState(false);
  const [extraGroups, setExtraGroups]       = useState<AgentGroup[]>([]);

  const allUnits      = [...businessUnits, ...extraUnits];
  const effectiveGroups = [...allGroups, ...extraGroups];
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteInput, setDeleteInput]     = useState("");
  const [deleting, setDeleting]           = useState(false);
  const [runMessage, setRunMessage]       = useState("");
  const [prompt, setPrompt]               = useState<string>("");
  const hasStoredPromptRef                = useRef(false);

  const { data: versions, mutate: mutateVersions } = useSWR(
    ["agent-versions", agent.id],
    ([, id]) => api.agents.versions(id),
  );

  useEffect(() => {
    setError(null);
    try {
      const raw = getOrgItem(orgId, AGENT_FORM_SUBKEY(agent.id));
      if (raw) {
        const s = JSON.parse(raw);
        setName(s.name         ?? agent.name);
        setDescription(s.description ?? (agent.description ?? ""));
        setBuId(s.buId         ?? agent.business_unit_id);
        setGroupId(s.groupId   ?? (agent.group_id ?? ""));
        setModelId(s.modelId   ?? (agent.model_id ?? ""));
        setStatus(s.status     ?? agent.status);
        setMcpIds(s.mcpIds     ?? (agent.mcp_servers?.map((m) => m.id) ?? []));
        if (s.prompt != null) { setPrompt(s.prompt); hasStoredPromptRef.current = true; }
        else { setPrompt(""); hasStoredPromptRef.current = false; }
        return;
      }
    } catch { /* ignore corrupt storage */ }
    setName(agent.name);
    setDescription(agent.description ?? "");
    setBuId(agent.business_unit_id);
    setGroupId(agent.group_id ?? "");
    setModelId(agent.model_id ?? "");
    setStatus(agent.status);
    setMcpIds(agent.mcp_servers?.map((m) => m.id) ?? []);
    setPrompt("");
    hasStoredPromptRef.current = false;
  }, [agent.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hasStoredPromptRef.current) {
      setPrompt(versions?.[0]?.prompt ?? "");
    }
  }, [versions]);

  useEffect(() => {
    try {
      setOrgItem(
        orgId,
        AGENT_FORM_SUBKEY(agent.id),
        JSON.stringify({ name, description, buId, groupId, modelId, status, mcpIds, prompt }),
      );
    } catch { /* ignore */ }
  }, [agent.id, name, description, buId, groupId, modelId, status, mcpIds, prompt, orgId]);

  const handleCreateSwarm = async () => {
    const n = newSwarmName.trim();
    if (!n) return;
    setSavingSwarm(true);
    try {
      const unit = await api.businessUnits.create({ name: n });
      setExtraUnits((prev) => [...prev, unit]);
      setBuId(unit.id);
      setGroupId("");
      setCreatingSwarm(false);
      setNewSwarmName("");
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingSwarm(false);
    }
  };

  const handleCreateGroup = async () => {
    const n = newGroupName.trim();
    if (!n || !buId) return;
    setSavingGroup(true);
    try {
      const group = await api.groups.create({ name: n, business_unit_id: buId });
      setExtraGroups((prev) => [...prev, group]);
      setGroupId(group.id);
      setCreatingGroup(false);
      setNewGroupName("");
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingGroup(false);
    }
  };

  const buGroups  = effectiveGroups.filter((g) => g.business_unit_id === buId);
  const swarmName = allUnits.find((b) => b.id === buId)?.name ?? "";

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
        model_id: modelId || null,
        status,
        mcp_server_ids: mcpIds,
        prompt: prompt.trim() || undefined,
      });
      try {
        setOrgItem(orgId, AGENT_FORM_SUBKEY(agent.id), JSON.stringify({
          name: name.trim(), description: description.trim() || "",
          buId, groupId, modelId, status, mcpIds, prompt: prompt.trim() || "",
        }));
      } catch { /* ignore */ }
      mutateVersions(undefined, { revalidate: true });
      onSaved();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.agents.delete(agent.id);
      onDeleted();
    } catch (err) {
      setError(String(err));
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  const visibleTabs = (["profile", "schedules", "memory", "mcp", "instructions", ...(hasRunStarted ? ["graph"] : [])] as AgentTab[]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-0">
      {/* Tab bar with close button */}
      <div className="flex items-center border-b border-border shrink-0 overflow-x-auto">
        {visibleTabs.map((tab) => {
          const label: Record<AgentTab, string> = {
            profile: "Profile",
            schedules: "Schedules",
            memory: "Memory",
            mcp: "MCP",
            instructions: "Instructions",
            graph: "Graph",
          };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              role="tab"
              aria-selected={activeTab === tab}
              className={cn(
                "shrink-0 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap",
                activeTab === tab
                  ? "text-violet border-b-2 border-violet"
                  : "text-text-3 hover:text-text-2",
              )}
            >
              {label[tab]}
            </button>
          );
        })}
      </div>

      {activeTab === "schedules" && (
        <div className="flex-1 overflow-y-auto">
          <AgentSchedulesTab agentId={agent.id} />
        </div>
      )}

      {activeTab === "memory" && (
        <div className="flex-1 overflow-y-auto">
          <AgentDbAccessTab agentId={agent.id} />
        </div>
      )}

      {activeTab === "mcp" && (
        <div className="flex-1 overflow-y-auto">
          <AgentToolsTab
            agentId={agent.id}
            allMcpServers={mcpServers}
            selectedServerIds={mcpIds}
            onSelectedServerIdsChange={setMcpIds}
          />
        </div>
      )}

      {activeTab === "instructions" && (
        <AgentPromptTab
          agentId={agent.id}
          agentName={name}
          agentDescription={description}
          agentSwarmName={swarmName}
          prompt={prompt}
          onPromptChange={setPrompt}
        />
      )}

      {activeTab === "graph" && (
        <div className="flex-1 overflow-hidden">
          <AgentGraphTab versions={versions ?? []} activeNodeId={activeNodeId} />
        </div>
      )}

      {activeTab === "profile" && <div className="flex flex-col gap-4 px-6 py-5 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="What does this agent do?" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>AI Model</label>
          <select value={modelId} onChange={(e) => setModelId(e.target.value)} className={selectCls}>
            <option value="">Platform default</option>
            {aiModels.filter((m) => m.enabled).map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
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

        <div className="flex flex-col gap-1 pt-1 border-t border-border">
          <p className="text-xs text-text-3">Created {fmt(agent.created_at)}</p>
          <p className="text-xs text-text-3">Updated {fmt(agent.updated_at)}</p>
        </div>

      </div>}

      {activeTab !== "graph" && (
        <div className="flex flex-col gap-2 px-4 py-3 border-t border-border shrink-0">
          {error && <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>}
          {confirmDelete ? (
            <div className="flex flex-col gap-2 px-1 py-1 bg-rose-500/5 rounded-xl border border-rose-500/20 p-3">
              <p className="text-xs text-rose-400">
                Type <span className="font-semibold">{agent.name}</span> to confirm deletion.
              </p>
              <input
                autoFocus
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && deleteInput === agent.name) handleDelete();
                  if (e.key === "Escape") { setConfirmDelete(false); setDeleteInput(""); }
                }}
                placeholder={agent.name}
                className="w-full bg-surface-2 border border-rose-500/30 focus:border-rose-400 rounded-lg px-3 py-1.5 text-sm text-text-1 placeholder:text-text-3 outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setConfirmDelete(false); setDeleteInput(""); }}
                  className="flex-1 py-1.5 rounded-lg border border-border text-xs text-text-2 hover:text-text-1 hover:bg-surface-2 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting || deleteInput !== agent.name}
                  className="flex-1 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 disabled:opacity-40 text-rose-400 text-xs font-medium transition-colors"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {status === "published" && (
                <div className="flex items-center gap-2">
                  <input
                    value={runMessage}
                    onChange={(e) => setRunMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && runMessage.trim()) {
                        onRun(agent.id, runMessage);
                        setRunMessage("");
                      }
                    }}
                    placeholder="Send a message to the agent…"
                    className="flex-1 bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-violet"
                  />
                  <button
                    onClick={() => { onRun(agent.id, runMessage); setRunMessage(""); }}
                    disabled={!runMessage.trim()}
                    className="px-4 py-2 rounded-xl bg-emerald/15 hover:bg-emerald/25 disabled:opacity-40 text-emerald text-sm font-semibold transition-colors shrink-0"
                  >
                    Run
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="flex-1" />
                <button
                  onClick={() => { setConfirmDelete(true); setDeleteInput(""); }}
                  className="px-3 py-2 rounded-xl text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10 text-sm transition-colors"
                >
                  Delete
                </button>
                <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-sm text-text-2 hover:text-text-1 hover:bg-surface-2 transition-colors">Cancel</button>
                <button onClick={handleSave} disabled={saving || !name.trim()} className="px-4 py-2 rounded-xl bg-violet/20 hover:bg-violet/35 disabled:opacity-40 text-violet text-sm font-medium transition-colors">
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Canvas page ───────────────────────────────────────────────────────────────

type RightPanel =
  | { type: "create"; defaultBuId?: string }
  | { type: "properties"; agentId: string }
  | null;

const CANVAS_PANEL_SUBKEY = "canvas-panel";

function CanvasPageInner() {
  const searchParams = useSearchParams();
  const { currentOrg } = useAuth();
  const orgKey = currentOrg?.id ?? null;

  const [rightPanel, setRightPanel] = useState<RightPanel>(
    searchParams.get("new") === "true" ? { type: "create" } : null,
  );

  useEffect(() => {
    if (searchParams.get("new") === "true") setRightPanel({ type: "create" });
  }, [searchParams]);

  // Restore right panel from org-scoped storage (skip ephemeral run state)
  useEffect(() => {
    if (searchParams.get("new") === "true" || !orgKey) return;
    try {
      const raw = getOrgItem(orgKey, CANVAS_PANEL_SUBKEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as RightPanel;
      setRightPanel(saved);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgKey]);

  // Save right panel whenever it changes (skip ephemeral run state)
  useEffect(() => {
    if (!orgKey) return;
    try {
      setOrgItem(orgKey, CANVAS_PANEL_SUBKEY, JSON.stringify(rightPanel));
    } catch { /* ignore */ }
  }, [rightPanel, orgKey]);

  const { data: units = [], mutate: mutateUnits } = useSWR(
    orgKey ? ["business-units-canvas", orgKey] : null,
    () => api.businessUnits.list(),
  );

  const { data: agents = [], mutate: mutateAgents } = useSWR(
    orgKey ? ["agents-canvas", orgKey] : null,
    () => api.agents.list(),
  );

  const { data: groups = [], mutate: mutateGroups } = useSWR(
    orgKey ? ["groups-canvas", orgKey] : null,
    () => api.groups.list(),
  );

  const { data: aiModels = [] } = useSWR(
    orgKey ? ["ai-models-canvas", orgKey] : null,
    () => api.aiModels.list(),
  );

  const { data: mcpServers = [] } = useSWR(
    orgKey ? ["mcp-servers-canvas", orgKey] : null,
    () => api.mcpServers.list(),
  );

  const refresh = () => { mutateUnits(); mutateAgents(); mutateGroups(); };

  const selectedAgent =
    rightPanel?.type === "properties"
      ? (agents as Agent[]).find((a) => a.id === rightPanel.agentId) ?? null
      : null;

  const activeAgentId = rightPanel?.type === "properties" ? rightPanel.agentId : null;
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [hasRunStarted, setHasRunStarted] = useState(false);
  const [consoleCollapsed, setConsoleCollapsed] = useState(true);

  // Start the console panel collapsed on mount
  useEffect(() => { consolePanelRef.current?.collapse(); }, []);
  const consolePanelRef = usePanelRef();

  const [pendingRun, setPendingRun]   = useState<{ message: string; seq: number } | null>(null);
  const runSeqRef                     = useRef(0);

  const [leftNavWidth, setLeftNavWidth] = useState(432);
  const leftNavDragging = useRef(false);
  const leftNavDragStart = useRef({ x: 0, width: 432 });

  const handleLeftNavDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    leftNavDragging.current = true;
    leftNavDragStart.current = { x: e.clientX, width: leftNavWidth };
    const onMove = (ev: MouseEvent) => {
      if (!leftNavDragging.current) return;
      const delta = ev.clientX - leftNavDragStart.current.x;
      const next = Math.max(180, Math.min(600, leftNavDragStart.current.width + delta));
      setLeftNavWidth(next);
    };
    const onUp = () => {
      leftNavDragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [leftNavWidth]);

  // Reset hasRunStarted when the selected agent changes
  useEffect(() => { setHasRunStarted(false); }, [activeAgentId]);

  const rightPanelEl =
    rightPanel?.type === "create" ? (
      <AgentCreatePanel
        businessUnits={units as BusinessUnit[]}
        groups={groups as AgentGroup[]}
        aiModels={aiModels as AiModel[]}
        mcpServers={mcpServers as McpServer[]}
        defaultBuId={rightPanel.defaultBuId}
        onClose={() => setRightPanel(null)}
        onCreated={() => { setRightPanel(null); refresh(); }}
      />
    ) : rightPanel?.type === "properties" && selectedAgent ? (
      <AgentPropertiesPanel
        key={selectedAgent.id}
        agent={selectedAgent}
        businessUnits={units as BusinessUnit[]}
        allGroups={groups as AgentGroup[]}
        aiModels={aiModels as AiModel[]}
        mcpServers={mcpServers as McpServer[]}
        activeNodeId={activeNodeId}
        hasRunStarted={hasRunStarted}
        onClose={() => setRightPanel(null)}
        onSaved={() => refresh()}
        onDeleted={() => { setRightPanel(null); refresh(); }}
        onRun={(_agentId, message) => {
          consolePanelRef.current?.expand();
          setConsoleCollapsed(false);
          runSeqRef.current += 1;
          setPendingRun({ message, seq: runSeqRef.current });
        }}
      />
    ) : null;

  const toggleConsole = () => {
    if (consoleCollapsed) {
      consolePanelRef.current?.expand();
    } else {
      consolePanelRef.current?.collapse();
    }
  };

  return (
    <div className="flex h-screen bg-surface-0 overflow-hidden">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Main area: left nav + content, fixed horizontal split */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left nav — agent list, drag-resizable */}
          <div className="relative shrink-0 border-r border-border flex flex-col overflow-hidden" style={{ width: leftNavWidth }}>
            <SwarmList
              agents={agents as Agent[]}
              groups={groups as AgentGroup[]}
              selectedAgentId={activeAgentId}
              runningAgentId={hasRunStarted ? activeAgentId : null}
              orgId={orgKey}
              onSelectAgent={(id) => setRightPanel({ type: "properties", agentId: id })}
              onAddToSwarm={(buId) => setRightPanel({ type: "create", defaultBuId: buId })}
              onRun={(id) => setRightPanel({ type: "properties", agentId: id })}
              onRefresh={refresh}
            />
            {/* drag handle — wide click zone, thin visual line */}
            <div
              onMouseDown={handleLeftNavDragStart}
              className="absolute top-0 right-0 w-4 h-full cursor-col-resize z-10 flex justify-end group"
            >
              <div className="w-px h-full bg-border group-hover:bg-violet/50 transition-colors" />
            </div>
          </div>

          {/* Right: properties/create/empty + resizable console */}
          <div className="flex-1 min-w-0 overflow-hidden h-full">
            <PanelGroup orientation="vertical" className="h-full">
          <Panel id="canvas-top" defaultSize="65%" minSize="15%">
                <div className="h-full overflow-hidden" data-testid="agent-properties-panel">
                  {rightPanelEl ?? (
                    <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                      <p className="text-sm text-text-3">Select an agent to get started</p>
                    </div>
                  )}
                </div>
          </Panel>

          {/* Console resize handle — hidden when console is collapsed */}
          <PanelResizeHandle
            className={cn(
              "flex items-center justify-center h-2.5 bg-surface-2/60 border-y border-border hover:bg-violet/10 active:bg-violet/20 transition-colors cursor-row-resize shrink-0 group",
              consoleCollapsed && "invisible pointer-events-none",
            )}
            aria-label="Resize console panel"
            data-testid="panel-resize-handle"
          >
            {/* Three grip dots — visual affordance, pointer-events-none so they never intercept drags */}
            <div className="flex items-center gap-1 pointer-events-none">
              <div className="w-1 h-1 rounded-full bg-border group-hover:bg-violet/50 transition-colors" />
              <div className="w-1 h-1 rounded-full bg-border group-hover:bg-violet/50 transition-colors" />
              <div className="w-1 h-1 rounded-full bg-border group-hover:bg-violet/50 transition-colors" />
            </div>
          </PanelResizeHandle>

          <Panel
            id="canvas-console"
            defaultSize="35%"
            minSize="10%"
            maxSize="80%"
            collapsible
            collapsedSize="0%"
            panelRef={consolePanelRef}
            onResize={(size) => setConsoleCollapsed(size.asPercentage === 0)}
          >
            <div className="h-full" data-testid="agent-console">
              <AgentConsole
                activeAgentId={activeAgentId}
                onActiveNodeChange={setActiveNodeId}
                onRunStarted={() => setHasRunStarted(true)}
                isCollapsed={consoleCollapsed}
                onToggleCollapse={toggleConsole}
                triggerRun={pendingRun}
              />
            </div>
          </Panel>
        </PanelGroup>
          </div>
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
