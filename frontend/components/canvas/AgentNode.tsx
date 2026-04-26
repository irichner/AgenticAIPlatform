"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot, Play, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import { StatusBadge } from "@/components/shared/StatusBadge";

const typeGlow: Record<string, string> = {
  quota_forecaster: "glow-violet border-violet/30",
  spif_optimizer: "glow-cyan border-cyan/30",
  clawback_detector: "glow-amber border-amber/30",
};

const typeIcon: Record<string, string> = {
  quota_forecaster: "from-violet to-violet-dim",
  spif_optimizer: "from-cyan to-cyan-dim",
  clawback_detector: "from-amber to-amber",
};

export type AgentNodeData = {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  agentType?: string;
  onRun?: (agentId: string) => void;
  onSelect?: (agentId: string) => void;
};

export const AgentNode = memo(function AgentNode({ data, selected }: NodeProps) {
  const d = data as AgentNodeData;
  const glowClass = typeGlow[d.agentType ?? ""] ?? "glow-violet border-violet/20";
  const gradClass = typeIcon[d.agentType ?? ""] ?? "from-violet to-violet-dim";

  return (
    <>
      <Handle type="target" position={Position.Left} className="!bg-text-3 !border-border !w-2 !h-2" />

      <div
        onClick={() => d.onSelect?.(d.id)}
        className={cn(
          "glass rounded-2xl p-4 w-48 flex flex-col gap-2.5 transition-all duration-200 cursor-pointer",
          glowClass,
          selected && "ring-1 ring-white/20"
        )}
      >
        {/* Icon + menu */}
        <div className="flex items-center justify-between">
          <div
            className={cn(
              "w-8 h-8 rounded-xl bg-gradient-to-br flex items-center justify-center",
              gradClass
            )}
          >
            <Bot className="w-4 h-4 text-white" />
          </div>
          <button className="text-text-3 hover:text-text-2 transition-colors">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>

        {/* Name */}
        <div>
          <p className="text-sm font-semibold text-text-1 leading-snug line-clamp-2">
            {d.name}
          </p>
          {d.description && (
            <p className="text-xs text-text-3 mt-0.5 line-clamp-2">{d.description}</p>
          )}
        </div>

        {/* Status + run */}
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <StatusBadge status={d.status} />
          {d.status === "published" && d.onRun && (
            <button
              onClick={(e) => { e.stopPropagation(); d.onRun!(d.id); }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald/15 hover:bg-emerald/25 text-emerald text-xs transition-colors"
            >
              <Play className="w-3 h-3" />
              Run
            </button>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-text-3 !border-border !w-2 !h-2" />
    </>
  );
});
