"use client";

import { useState } from "react";
import { Bot, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Agent, BusinessUnit } from "@/lib/api";

interface AgentLibraryPanelProps {
  agents: Agent[];
  businessUnits: BusinessUnit[];
}

const swarmDotColors = [
  "bg-violet/70",
  "bg-cyan/70",
  "bg-amber/70",
  "bg-rose/70",
  "bg-emerald/70",
];

export function AgentLibraryPanel({ agents, businessUnits }: AgentLibraryPanelProps) {
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
      {/* Header */}
      <div className="px-3 pt-3.5 pb-2.5 border-b border-border shrink-0">
        <p className="text-[10px] font-semibold text-text-3 uppercase tracking-widest mb-2.5">
          Agent Library
        </p>
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

      {/* Groups */}
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
                  className="w-full flex items-center gap-1.5 px-1.5 py-1.5 rounded-lg hover:bg-surface-2 transition-colors group"
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

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-border shrink-0">
        <p className="text-[10px] text-text-3 leading-tight">
          Drag agents onto the canvas to build your workflow
        </p>
      </div>
    </div>
  );
}
