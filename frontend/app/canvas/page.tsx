"use client";

import { useState, useRef, Suspense, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { Server } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { CanvasView } from "@/components/canvas/CanvasView";
import { api, type BusinessUnit, type Agent, type AgentGroup, type AiModel, type McpServer } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { getOrgItem, setOrgItem, removeOrgItem } from "@/lib/org-storage";
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
  onClose: () => void;
  onCreated: () => void;
}

function AgentCreatePanel({ businessUnits, groups, aiModels, mcpServers, onClose, onCreated }: AgentCreatePanelProps) {
  const [name, setName]               = useState("");
  const [description, setDescription] = useState("");
  const [buId, setBuId]               = useState(businessUnits[0]?.id ?? "");
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
          <div className="flex items-center justify-between">
            <label className={labelCls}>Swarm *</label>
            <button
              type="button"
              onClick={() => { setCreatingSwarm((v) => !v); setNewSwarmName(""); }}
              className="text-xs text-violet hover:text-violet/80 transition-colors"
            >
              {creatingSwarm ? "Cancel" : "+ New"}
            </button>
          </div>
          {creatingSwarm ? (
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

const AGENT_FORM_SUBKEY = (id: string) => `agent-form:${id}`;

// ── Agent properties panel ────────────────────────────────────────────────────

interface AgentPropertiesPanelProps {
  agent: Agent;
  businessUnits: BusinessUnit[];
  allGroups: AgentGroup[];
  aiModels: AiModel[];
  mcpServers: McpServer[];
  onClose: () => void;
  onUpdated: () => void;
  onRun: (agentId: string) => void;
}

function AgentPropertiesPanel({ agent, businessUnits, allGroups, aiModels, mcpServers, onClose, onUpdated, onRun }: AgentPropertiesPanelProps) {
  const { currentOrg } = useAuth();
  const orgId = currentOrg?.id ?? null;
  const [name, setName]               = useState(agent.name);
  const [description, setDescription] = useState(agent.description ?? "");
  const [buId, setBuId]               = useState(agent.business_unit_id);
  const [groupId, setGroupId]         = useState(agent.group_id ?? "");
  const [modelId, setModelId]         = useState(agent.model_id ?? "");
  const [status, setStatus]           = useState(agent.status);
  const [prompt, setPrompt]           = useState<string>("");
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
  // True once localStorage has supplied the prompt so the versions effect doesn't overwrite it
  const promptFromStorage = useRef(false);

  const { data: versions } = useSWR(
    ["agent-versions", agent.id],
    ([, id]) => api.agents.versions(id),
  );

  // Restore / reset all non-prompt fields when the active agent changes.
  // Check localStorage first so unsaved edits survive navigation.
  useEffect(() => {
    promptFromStorage.current = false;
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
        if (s.prompt !== undefined) {
          setPrompt(s.prompt);
          promptFromStorage.current = true;
        }
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
  }, [agent.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load prompt from the latest version — skip if already restored from localStorage.
  useEffect(() => {
    if (promptFromStorage.current) return;
    if (versions && versions.length > 0) setPrompt(versions[0].prompt ?? "");
  }, [versions]);

  // Auto-save every form change so it survives navigation.
  useEffect(() => {
    try {
      setOrgItem(
        orgId,
        AGENT_FORM_SUBKEY(agent.id),
        JSON.stringify({ name, description, buId, groupId, modelId, status, prompt, mcpIds }),
      );
    } catch { /* ignore */ }
  }, [agent.id, name, description, buId, groupId, modelId, status, prompt, mcpIds]);

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
        model_id: modelId || null,
        status,
        prompt: prompt.trim() || undefined,
        mcp_server_ids: mcpIds,
      });
      try { removeOrgItem(orgId, AGENT_FORM_SUBKEY(agent.id)); } catch { /* ignore */ }
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
          <div className="flex items-center justify-between">
            <label className={labelCls}>Swarm</label>
            <button
              type="button"
              onClick={() => { setCreatingSwarm((v) => !v); setNewSwarmName(""); }}
              className="text-xs text-violet hover:text-violet/80 transition-colors"
            >
              {creatingSwarm ? "Cancel" : "+ New"}
            </button>
          </div>
          {creatingSwarm ? (
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
          <select value={status} onChange={(e) => setStatus(e.target.value as Agent["status"])} className={selectCls}>
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

const CANVAS_PANEL_SUBKEY = "canvas-panel";
const CANVAS_UNIT_SUBKEY  = "canvas-unit";

function CanvasPageInner() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const unitFilter   = searchParams.get("unit");
  const { currentOrg } = useAuth();
  const orgKey = currentOrg?.id ?? null;

  const [rightPanel, setRightPanel] = useState<RightPanel>(
    searchParams.get("new") === "true" ? { type: "create" } : null,
  );

  useEffect(() => {
    if (searchParams.get("new") === "true") setRightPanel({ type: "create" });
  }, [searchParams]);

  // Restore unit filter from org-scoped storage if URL has none
  useEffect(() => {
    if (searchParams.get("unit") || !orgKey) return;
    try {
      const saved = getOrgItem(orgKey, CANVAS_UNIT_SUBKEY);
      if (saved) router.replace(`/canvas?unit=${encodeURIComponent(saved)}`);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgKey]);

  // Save unit filter whenever it changes
  useEffect(() => {
    if (!orgKey) return;
    try {
      if (unitFilter) setOrgItem(orgKey, CANVAS_UNIT_SUBKEY, unitFilter);
    } catch { /* ignore */ }
  }, [unitFilter, orgKey]);

  // Restore right panel from org-scoped storage (skip ephemeral run state)
  useEffect(() => {
    if (searchParams.get("new") === "true" || !orgKey) return;
    try {
      const raw = getOrgItem(orgKey, CANVAS_PANEL_SUBKEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as RightPanel;
      if (saved?.type !== "run") setRightPanel(saved);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgKey]);

  // Save right panel whenever it changes (skip ephemeral run state)
  useEffect(() => {
    if (!orgKey) return;
    try {
      const toSave = rightPanel?.type === "run" ? null : rightPanel;
      setOrgItem(orgKey, CANVAS_PANEL_SUBKEY, JSON.stringify(toSave));
    } catch { /* ignore */ }
  }, [rightPanel, orgKey]);

  const { data: units = [], mutate: mutateUnits } = useSWR(
    orgKey ? ["business-units-canvas", orgKey] : null,
    () => api.businessUnits.list(),
  );

  const { data: agents = [], mutate: mutateAgents } = useSWR(
    orgKey ? ["agents-canvas", orgKey, unitFilter] : null,
    () => api.agents.list(unitFilter ?? undefined),
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
        aiModels={aiModels as AiModel[]}
        mcpServers={mcpServers as McpServer[]}
        onClose={() => setRightPanel(null)}
        onCreated={() => { setRightPanel(null); refresh(); }}
      />
    ) : rightPanel?.type === "properties" && selectedAgent ? (
      <AgentPropertiesPanel
        agent={selectedAgent}
        businessUnits={units as BusinessUnit[]}
        allGroups={groups as AgentGroup[]}
        aiModels={aiModels as AiModel[]}
        mcpServers={mcpServers as McpServer[]}
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
