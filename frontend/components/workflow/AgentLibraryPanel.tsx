"use client";

import { useState } from "react";
import { Bot, ChevronRight, Search, GitBranch, Clock, Trash2, FolderOpen } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Agent, BusinessUnit } from "@/lib/api";
import type { Node, Edge } from "@xyflow/react";

export interface SavedWorkflow {
  id: string;
  name: string;
  nodes: Node[];
  edges: Edge[];
  savedAt: string; // ISO string
}

interface AgentLibraryPanelProps {
  agents: Agent[];
  businessUnits: BusinessUnit[];
  savedWorkflows?: SavedWorkflow[];
  onLoadWorkflow?: (wf: SavedWorkflow) => void;
  onDeleteWorkflow?: (id: string) => void;
}

const swarmDotColors = [
  "bg-violet/70",
  "bg-cyan/70",
  "bg-amber/70",
  "bg-rose/70",
  "bg-emerald/70",
];

function fmtDate(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

export function AgentLibraryPanel({
  agents,
  businessUnits,
  savedWorkflows = [],
  onLoadWorkflow,
  onDeleteWorkflow,
}: AgentLibraryPanelProps) {
  const [tab, setTab] = useState<"agents" | "workflows">("agents");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(businessUnits.map((bu) => bu.id)),
  );

  const q = search.toLowerCase();
  const filtered = q
    ? agents.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.description ?? "").toLowerCase().includes(q),
      )
    : agents;

  const groups = businessUnits
    .map((bu, idx) => ({ bu, idx, buAgents: filtered.filter((a) => a.business_unit_id === bu.id) }))
    .filter((g) => g.buAgents.length > 0);

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleDragStart = (
    event: React.DragEvent,
    agent: Agent,
    bu: BusinessUnit,
    idx: number,
  ) => {
    event.dataTransfer.setData(
      "application/reactflow",
      JSON.stringify({
        agentId: agent.id,
        agentName: agent.name,
        agentDescription: agent.description,
        swarmName: bu.name,
        swarmId: bu.id,
        colorIndex: idx,
      }),
    );
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="w-64 shrink-0 flex flex-col glass border-r border-border h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0">
        {(["agents", "workflows"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 py-2.5 text-xs font-medium capitalize transition-colors border-b-2 -mb-px",
              tab === t
                ? "border-violet text-violet"
                : "border-transparent text-text-3 hover:text-text-2",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "agents" ? (
        <>
          {/* Search */}
          <div className="px-3 pt-2.5 pb-2 border-b border-border shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-3 pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search agents…"
                className="w-full bg-surface-2 border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-text-1 placeholder:text-text-3 outline-none focus:border-violet transition-colors"
              />
            </div>
          </div>

          {/* Agent groups */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {groups.length === 0 ? (
              <p className="px-2 py-4 text-xs text-text-3 italic text-center">
                {agents.length === 0 ? "No agents yet" : "No matches"}
              </p>
            ) : (
              groups.map(({ bu, idx, buAgents }) => {
                const isCollapsed = collapsed.has(bu.id);
                const dot = swarmDotColors[idx % swarmDotColors.length];
                return (
                  <div key={bu.id}>
                    <button
                      onClick={() => toggleCollapse(bu.id)}
                      className="w-full flex items-center gap-1.5 px-1.5 py-1.5 rounded-lg hover:bg-surface-2 transition-colors"
                    >
                      <ChevronRight
                        className={cn(
                          "w-3 h-3 text-text-3 transition-transform duration-150 shrink-0",
                          !isCollapsed && "rotate-90",
                        )}
                      />
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dot)} />
                      <span className="flex-1 text-xs font-medium text-text-2 text-left truncate">
                        {bu.name}
                      </span>
                      <span className="text-[10px] text-text-3 shrink-0">{buAgents.length}</span>
                    </button>

                    {!isCollapsed && (
                      <div className="mt-1 space-y-1 pl-1">
                        {buAgents.map((agent) => (
                          <div
                            key={agent.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, agent, bu, idx)}
                            className="flex items-center gap-2 px-2 py-2 rounded-xl bg-surface-2 border border-border/60 hover:border-violet/30 hover:bg-violet/5 cursor-grab active:cursor-grabbing active:opacity-70 active:scale-95 transition-all duration-150 select-none"
                          >
                            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet to-violet-dim flex items-center justify-center shrink-0">
                              <Bot className="w-3 h-3 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-text-1 truncate leading-tight">
                                {agent.name}
                              </p>
                              {agent.description && (
                                <p className="text-[10px] text-text-3 truncate leading-tight">
                                  {agent.description}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="px-3 py-2 border-t border-border shrink-0">
            <p className="text-[10px] text-text-3 leading-tight">
              Drag agents onto the canvas to build your workflow
            </p>
          </div>
        </>
      ) : (
        <>
          {/* Saved workflows list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {savedWorkflows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 gap-3">
                <FolderOpen className="w-8 h-8 text-text-3/40" />
                <p className="text-xs text-text-3 text-center italic leading-relaxed">
                  No saved workflows yet.{"\n"}Hit <span className="text-violet font-medium">Save</span> in the toolbar to add one.
                </p>
              </div>
            ) : (
              savedWorkflows.map((wf) => {
                const stepCount = wf.nodes.filter((n) => n.type === "workflowStep").length;
                return (
                  <div
                    key={wf.id}
                    onClick={() => onLoadWorkflow?.(wf)}
                    className="group rounded-xl p-2.5 bg-surface-2 border border-border/60 hover:border-violet/30 hover:bg-violet/5 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <div className="w-6 h-6 rounded-lg bg-violet/15 flex items-center justify-center shrink-0 mt-0.5">
                        <GitBranch className="w-3 h-3 text-violet" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-text-1 truncate leading-tight">
                          {wf.name}
                        </p>
                        <p className="text-[10px] text-text-3 mt-0.5 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5 shrink-0" />
                          {fmtDate(wf.savedAt)}
                        </p>
                        <p className="text-[10px] text-text-3">
                          {stepCount} {stepCount === 1 ? "step" : "steps"}
                        </p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteWorkflow?.(wf.id); }}
                        className="shrink-0 p-1 rounded-lg text-text-3 hover:text-rose-400 hover:bg-rose-400/10 opacity-0 group-hover:opacity-100 transition-all"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="px-3 py-2 border-t border-border shrink-0">
            <p className="text-[10px] text-text-3 leading-tight">
              Click a workflow to restore it onto the canvas
            </p>
          </div>
        </>
      )}
    </div>
  );
}
