"use client";

import { memo } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { Building2, ChevronDown, ChevronRight, Bot, Zap, Layers } from "lucide-react";
import { cn } from "@/lib/cn";

const accents = [
  {
    bar:    "bg-violet",
    border: "border-violet/25",
    bg:     "bg-violet/[0.04]",
    head:   "bg-violet/[0.07]",
    text:   "text-violet",
    badge:  "bg-violet/15 text-violet border-violet/20",
    live:   "bg-emerald/15 text-emerald",
  },
  {
    bar:    "bg-cyan",
    border: "border-cyan/25",
    bg:     "bg-cyan/[0.04]",
    head:   "bg-cyan/[0.07]",
    text:   "text-cyan",
    badge:  "bg-cyan/15 text-cyan border-cyan/20",
    live:   "bg-emerald/15 text-emerald",
  },
  {
    bar:    "bg-amber",
    border: "border-amber/25",
    bg:     "bg-amber/[0.04]",
    head:   "bg-amber/[0.07]",
    text:   "text-amber",
    badge:  "bg-amber/15 text-amber border-amber/20",
    live:   "bg-emerald/15 text-emerald",
  },
  {
    bar:    "bg-rose",
    border: "border-rose/25",
    bg:     "bg-rose/[0.04]",
    head:   "bg-rose/[0.07]",
    text:   "text-rose",
    badge:  "bg-rose/15 text-rose border-rose/20",
    live:   "bg-emerald/15 text-emerald",
  },
  {
    bar:    "bg-emerald",
    border: "border-emerald/25",
    bg:     "bg-emerald/[0.04]",
    head:   "bg-emerald/[0.07]",
    text:   "text-emerald",
    badge:  "bg-emerald/15 text-emerald border-emerald/20",
    live:   "bg-emerald/15 text-emerald",
  },
];

export type UnitZoneData = {
  name: string;
  agentCount: number;
  liveCount: number;
  groupCount: number;
  colorIndex: number;
  collapsed: boolean;
  naturalHeight: number;
  unitId: string;
  onToggleCollapse: (unitId: string) => void;
};

export const UnitZoneNode = memo(function UnitZoneNode({ data, selected }: NodeProps) {
  const d  = data as UnitZoneData;
  const a  = accents[d.colorIndex % accents.length];

  return (
    <>
      <NodeResizer
        minWidth={480}
        minHeight={120}
        isVisible={selected && !d.collapsed}
        lineStyle={{ stroke: "rgba(139,92,246,0.4)", strokeWidth: 1 }}
        handleStyle={{
          width: 8,
          height: 8,
          borderRadius: 2,
          backgroundColor: "rgba(139,92,246,0.7)",
          border: "none",
        }}
      />

      <div
        className={cn(
          "w-full h-full rounded-2xl overflow-hidden border",
          a.border,
          a.bg,
        )}
        style={{
          backdropFilter: "blur(12px)",
          boxShadow: "0 4px 24px rgb(0 0 0 / 0.4), inset 0 1px 0 rgb(255 255 255 / 0.05)",
        }}
      >
        {/* Colored left accent bar */}
        <div className={cn("absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl", a.bar)} />

        {/* Header */}
        <div className={cn("flex items-center gap-3 pl-5 pr-4 py-4 border-b border-white/[0.06]", a.head)}>
          <Building2 className={cn("w-4 h-4 shrink-0", a.text)} />

          <div className="flex-1 min-w-0">
            <p className={cn("text-sm font-semibold tracking-tight leading-none", a.text)}>
              {d.name}
            </p>
            <p className="text-xs text-text-3 mt-1 leading-none">Business Unit</p>
          </div>

          {/* KPI pills */}
          <div className="flex items-center gap-2 shrink-0">
            {d.agentCount > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/[0.08]">
                <Bot className="w-3 h-3 text-text-3" />
                <span className="text-xs font-medium text-text-2">{d.agentCount}</span>
              </div>
            )}

            {d.liveCount > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald/10 border border-emerald/20">
                <Zap className="w-3 h-3 text-emerald" />
                <span className="text-xs font-medium text-emerald">{d.liveCount} live</span>
              </div>
            )}

            {d.groupCount > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/[0.08]">
                <Layers className="w-3 h-3 text-text-3" />
                <span className="text-xs font-medium text-text-2">{d.groupCount}</span>
              </div>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                d.onToggleCollapse(d.unitId);
              }}
              title={d.collapsed ? "Expand" : "Collapse"}
              className={cn(
                "w-6 h-6 rounded-md flex items-center justify-center transition-colors",
                "hover:bg-white/10",
                a.text,
              )}
            >
              {d.collapsed
                ? <ChevronRight className="w-3.5 h-3.5" />
                : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Empty state — shown when zone has no agents */}
        {!d.collapsed && d.agentCount === 0 && (
          <div className="flex flex-col items-center justify-center h-[calc(100%-88px)] gap-3 px-8 text-center">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              "bg-white/[0.05] border border-white/[0.08]",
            )}>
              <Bot className="w-5 h-5 text-text-3" />
            </div>
            <div>
              <p className="text-sm font-medium text-text-2">No agents deployed</p>
              <p className="text-xs text-text-3 mt-1">
                Add agents from the Swarms view to populate this unit.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
});
