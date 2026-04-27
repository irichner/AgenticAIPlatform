"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Clock, Mail, Zap, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";

export type IntermediateEventType = "timer" | "message" | "signal" | "error";
export type IntermediateEventMode = "catching" | "throwing";

export type IntermediateEventData = {
  label?: string;
  eventType?: IntermediateEventType;
  mode?: IntermediateEventMode;
  timerExpression?: string;
};

const evtCfg: Record<IntermediateEventType, { icon: React.ElementType; stroke: string; fill: string }> = {
  timer:   { icon: Clock,         stroke: "#f59e0b", fill: "rgba(245,158,11,0.10)" },
  message: { icon: Mail,          stroke: "#8b5cf6", fill: "rgba(139,92,246,0.10)" },
  signal:  { icon: Zap,           stroke: "#06b6d4", fill: "rgba(6,182,212,0.10)"  },
  error:   { icon: AlertTriangle, stroke: "#f43f5e", fill: "rgba(244,63,94,0.10)"  },
};

export const IntermediateEventNode = memo(function IntermediateEventNode({ data, selected }: NodeProps) {
  const d = data as IntermediateEventData;
  const et = d.eventType ?? "timer";
  const c = evtCfg[et];
  const Icon = c.icon;

  return (
    <div className="flex flex-col items-center gap-1">
      <Handle type="target" position={Position.Top}  id="top"  className="wf-handle" />
      <Handle type="target" position={Position.Left} id="left" className="wf-handle" />

      <div
        className={cn(
          "relative w-14 h-14 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200",
          selected && "scale-105",
        )}
        style={{
          border: `2px solid ${c.stroke}`,
          backgroundColor: c.fill,
          boxShadow: selected ? `0 0 0 3px ${c.stroke}28` : undefined,
        }}
      >
        {/* Double-border ring — hallmark of intermediate events */}
        <div
          className="absolute inset-1.5 rounded-full pointer-events-none"
          style={{ border: `1.5px solid ${c.stroke}` }}
        />
        <Icon className="w-5 h-5 relative z-10" style={{ color: c.stroke }} strokeWidth={1.75} />
      </div>

      {d.label && (
        <span className="text-[10px] text-text-2 font-medium whitespace-nowrap max-w-[100px] text-center truncate leading-tight">
          {d.label}
        </span>
      )}

      <Handle type="source" position={Position.Right}  id="right"  className="wf-handle" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="wf-handle" />
    </div>
  );
});
