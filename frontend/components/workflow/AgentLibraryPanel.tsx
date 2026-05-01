"use client";

import { useState } from "react";
import { Bot, ChevronRight, Search, GitBranch, Clock, Trash2, FolderOpen } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Agent, BusinessUnit, WorkflowListItem } from "@/lib/api";

interface AgentLibraryPanelProps {
  agents: Agent[];
  businessUnits: BusinessUnit[];
  workflows?: WorkflowListItem[];
  currentWorkflowId?: string | null;
  onLoadWorkflow?: (id: string) => void;
  onDeleteWorkflow?: (id: string) => void;
}

const swarmDotColors = ["bg-violet/70", "bg-cyan/70", "bg-amber/70", "bg-rose/70", "bg-emerald/70"];

function fmtDate(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

// ── BPMN element palette definition ──────────────────────────────────────────

interface PaletteItem {
  label: string;
  hint: string;
  payload: Record<string, string>;
  preview: React.ReactNode;
}

interface PaletteCategory {
  name: string;
  items: PaletteItem[];
}

const EventPreview = ({ stroke, thick, double: dbl }: { stroke: string; thick?: boolean; double?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 22 22">
    <circle cx="11" cy="11" r={thick ? 7.5 : 8} fill={`${stroke}18`} stroke={stroke} strokeWidth={thick ? 3 : 1.5} />
    {dbl && <circle cx="11" cy="11" r="4.5" fill="none" stroke={stroke} strokeWidth="1" />}
  </svg>
);

const GatewayPreview = ({ stroke }: { stroke: string }) => (
  <svg width="22" height="22" viewBox="0 0 22 22">
    <polygon points="11,1 21,11 11,21 1,11" fill={`${stroke}18`} stroke={stroke} strokeWidth="1.5" />
  </svg>
);

const TaskPreview = () => (
  <svg width="22" height="16" viewBox="0 0 22 16">
    <rect x="1" y="1" width="20" height="14" rx="3" fill="rgba(14,165,233,0.12)" stroke="rgba(14,165,233,0.6)" strokeWidth="1.5" />
  </svg>
);

const AnnotationPreview = () => (
  <svg width="22" height="18" viewBox="0 0 22 18">
    <path d="M6,2 L2,2 L2,16 L6,16" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="8" y1="6" x2="20" y2="6" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
    <line x1="8" y1="10" x2="18" y2="10" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
    <line x1="8" y1="14" x2="16" y2="14" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
  </svg>
);

const PALETTE_CATEGORIES: PaletteCategory[] = [
  {
    name: "Events",
    items: [
      {
        label: "End Event",
        hint: "Plain end",
        payload: { bpmnType: "endEvent", subtype: "none" },
        preview: <EventPreview stroke="#f43f5e" thick />,
      },
      {
        label: "Terminate",
        hint: "Stops all paths",
        payload: { bpmnType: "endEvent", subtype: "terminate" },
        preview: <EventPreview stroke="#f43f5e" thick />,
      },
      {
        label: "Error End",
        hint: "Throws error",
        payload: { bpmnType: "endEvent", subtype: "error" },
        preview: <EventPreview stroke="#f43f5e" thick />,
      },
      {
        label: "Timer",
        hint: "Intermediate catching",
        payload: { bpmnType: "intermediateEvent", eventType: "timer" },
        preview: <EventPreview stroke="#f59e0b" double />,
      },
      {
        label: "Message",
        hint: "Intermediate catching",
        payload: { bpmnType: "intermediateEvent", eventType: "message" },
        preview: <EventPreview stroke="#8b5cf6" double />,
      },
      {
        label: "Signal",
        hint: "Intermediate catching",
        payload: { bpmnType: "intermediateEvent", eventType: "signal" },
        preview: <EventPreview stroke="#06b6d4" double />,
      },
    ],
  },
  {
    name: "Tasks",
    items: [
      {
        label: "Task",
        hint: "Generic activity",
        payload: { bpmnType: "taskNode", taskSubtype: "task" },
        preview: <TaskPreview />,
      },
      {
        label: "User Task",
        hint: "Requires human action",
        payload: { bpmnType: "taskNode", taskSubtype: "userTask" },
        preview: <TaskPreview />,
      },
      {
        label: "Service Task",
        hint: "Calls a service",
        payload: { bpmnType: "taskNode", taskSubtype: "serviceTask" },
        preview: <TaskPreview />,
      },
      {
        label: "Script Task",
        hint: "Executes a script",
        payload: { bpmnType: "taskNode", taskSubtype: "scriptTask" },
        preview: <TaskPreview />,
      },
      {
        label: "Send Task",
        hint: "Sends a message",
        payload: { bpmnType: "taskNode", taskSubtype: "sendTask" },
        preview: <TaskPreview />,
      },
      {
        label: "Receive Task",
        hint: "Waits for a message",
        payload: { bpmnType: "taskNode", taskSubtype: "receiveTask" },
        preview: <TaskPreview />,
      },
    ],
  },
  {
    name: "Gateways",
    items: [
      {
        label: "Exclusive (XOR)",
        hint: "One path taken",
        payload: { bpmnType: "gateway", gatewayType: "exclusive" },
        preview: <GatewayPreview stroke="#f59e0b" />,
      },
      {
        label: "Parallel (AND)",
        hint: "All paths taken",
        payload: { bpmnType: "gateway", gatewayType: "parallel" },
        preview: <GatewayPreview stroke="#06b6d4" />,
      },
      {
        label: "Inclusive (OR)",
        hint: "One or more paths",
        payload: { bpmnType: "gateway", gatewayType: "inclusive" },
        preview: <GatewayPreview stroke="#10b981" />,
      },
    ],
  },
  {
    name: "Artifacts",
    items: [
      {
        label: "Annotation",
        hint: "Add a note to the diagram",
        payload: { bpmnType: "annotation" },
        preview: <AnnotationPreview />,
      },
    ],
  },
  {
    name: "Containers",
    items: [
      {
        label: "Pool",
        hint: "Group nodes in a swimlane pool",
        payload: { bpmnType: "swimlane", color: "violet", orientation: "horizontal" },
        preview: (
          <svg width="22" height="18" viewBox="0 0 22 18">
            <rect x="1" y="1" width="20" height="16" rx="2" fill="rgba(139,92,246,0.1)" stroke="rgba(139,92,246,0.5)" strokeWidth="1.5" />
            <rect x="1" y="1" width="20" height="5" rx="2" fill="rgba(139,92,246,0.2)" stroke="rgba(139,92,246,0.5)" strokeWidth="1.5" />
          </svg>
        ),
      },
    ],
  },
];

function PaletteItemCard({ item }: { item: PaletteItem }) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      "application/reactflow",
      JSON.stringify({ kind: "bpmn", ...item.payload }),
    );
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="flex items-center gap-2.5 px-2 py-2 rounded-xl bg-surface-2 border border-border/60 hover:border-violet/30 hover:bg-violet/5 cursor-grab active:cursor-grabbing active:opacity-70 active:scale-95 transition-all duration-150 select-none"
      title={item.hint}
    >
      <div className="w-6 h-6 flex items-center justify-center shrink-0">
        {item.preview}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-text-1 leading-tight truncate">{item.label}</p>
        <p className="text-[10px] text-text-3 leading-tight truncate">{item.hint}</p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AgentLibraryPanel({
  agents,
  businessUnits,
  workflows = [],
  currentWorkflowId,
  onLoadWorkflow,
  onDeleteWorkflow,
}: AgentLibraryPanelProps) {
  const [tab, setTab] = useState<"elements" | "agents" | "workflows">("elements");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set<string>());

  const q = search.toLowerCase();
  const filtered = q
    ? agents.filter(
        (a) => a.name.toLowerCase().includes(q) || (a.description ?? "").toLowerCase().includes(q),
      )
    : agents;

  const groups = businessUnits
    .map((bu, idx) => ({ bu, idx, buAgents: filtered.filter((a) => a.business_unit_id === bu.id) }))
    .filter((g) => g.buAgents.length > 0);

  const toggleCollapse = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const handleAgentDragStart = (event: React.DragEvent, agent: Agent, bu: BusinessUnit, idx: number) => {
    event.dataTransfer.setData(
      "application/reactflow",
      JSON.stringify({
        kind: "agent",
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

  const TABS = [
    { id: "elements", label: "Elements" },
    { id: "agents",   label: "Agents"   },
    { id: "workflows", label: "Flows"   },
  ] as const;

  return (
    <div className="w-64 shrink-0 flex flex-col glass border-r border-border h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px",
              tab === t.id
                ? "border-violet text-violet"
                : "border-transparent text-text-3 hover:text-text-2",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Elements tab ── */}
      {tab === "elements" && (
        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          {PALETTE_CATEGORIES.map((cat) => (
            <div key={cat.name}>
              <p className="text-[10px] font-semibold text-text-3 uppercase tracking-widest px-1.5 pb-1.5">
                {cat.name}
              </p>
              <div className="space-y-1">
                {cat.items.map((item) => (
                  <PaletteItemCard key={item.label} item={item} />
                ))}
              </div>
            </div>
          ))}
          <div className="px-1 py-2">
            <p className="text-[10px] text-text-3 leading-tight">
              Drag elements onto the canvas to build your process
            </p>
          </div>
        </div>
      )}

      {/* ── Agents tab ── */}
      {tab === "agents" && (
        <>
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

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {groups.length === 0 ? (
              <p className="px-2 py-4 text-xs text-text-3 italic text-center">
                {agents.length === 0 ? "No agents yet" : "No matches"}
              </p>
            ) : (
              groups.map(({ bu, idx, buAgents }) => {
                const isCollapsed = !expanded.has(bu.id);
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
                      <span className="flex-1 text-xs font-medium text-text-2 text-left truncate">{bu.name}</span>
                      <span className="text-[10px] text-text-3 shrink-0">{buAgents.length}</span>
                    </button>

                    {!isCollapsed && (
                      <div className="mt-1 space-y-1 pl-1">
                        {buAgents.map((agent) => (
                          <div
                            key={agent.id}
                            draggable
                            onDragStart={(e) => handleAgentDragStart(e, agent, bu, idx)}
                            className="flex items-center gap-2 px-2 py-2 rounded-xl bg-surface-2 border border-border/60 hover:border-violet/30 hover:bg-violet/5 cursor-grab active:cursor-grabbing active:opacity-70 active:scale-95 transition-all duration-150 select-none"
                          >
                            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet to-violet-dim flex items-center justify-center shrink-0">
                              <Bot className="w-3 h-3 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-text-1 truncate leading-tight">{agent.name}</p>
                              {agent.description && (
                                <p className="text-[10px] text-text-3 truncate leading-tight">{agent.description}</p>
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
              Drag agents onto the canvas to add an Agent Task
            </p>
          </div>
        </>
      )}

      {/* ── Workflows tab ── */}
      {tab === "workflows" && (
        <>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {workflows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 gap-3">
                <FolderOpen className="w-8 h-8 text-text-3/40" />
                <p className="text-xs text-text-3 text-center italic leading-relaxed">
                  No saved workflows yet.{"\n"}Hit{" "}
                  <span className="text-violet font-medium">Save</span> in the toolbar to add one.
                </p>
              </div>
            ) : (
              workflows.map((wf) => {
                const isCurrent = wf.id === currentWorkflowId;
                return (
                  <div
                    key={wf.id}
                    onClick={() => onLoadWorkflow?.(wf.id)}
                    className={cn(
                      "group rounded-xl p-2.5 bg-surface-2 border cursor-pointer transition-colors",
                      isCurrent
                        ? "border-violet/50 bg-violet/5"
                        : "border-border/60 hover:border-violet/30 hover:bg-violet/5",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className={cn(
                        "w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                        isCurrent ? "bg-violet/25" : "bg-violet/15",
                      )}>
                        <GitBranch className="w-3 h-3 text-violet" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-text-1 truncate leading-tight">{wf.name}</p>
                        <p className="text-[10px] text-text-3 mt-0.5 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5 shrink-0" />
                          {fmtDate(wf.updated_at)}
                        </p>
                        <p className="text-[10px] text-text-3">v{wf.version}</p>
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
              Click a workflow to load it onto the canvas
            </p>
          </div>
        </>
      )}
    </div>
  );
}
