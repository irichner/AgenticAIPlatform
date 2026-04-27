"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/cn";

export type GatewayType = "exclusive" | "parallel" | "inclusive";

export type GatewayData = {
  label?: string;
  gatewayType?: GatewayType;
};

const configs: Record<GatewayType, { marker: string; stroke: string; fill: string }> = {
  exclusive: { marker: "×", stroke: "#f59e0b", fill: "rgba(245,158,11,0.11)" },
  parallel:  { marker: "+", stroke: "#06b6d4", fill: "rgba(6,182,212,0.11)"  },
  inclusive: { marker: "○", stroke: "#10b981", fill: "rgba(16,185,129,0.11)" },
};

export const GatewayNode = memo(function GatewayNode({ data, selected }: NodeProps) {
  const d = data as GatewayData;
  const gt = d.gatewayType ?? "exclusive";
  const cfg = configs[gt];

  return (
    <div className="flex flex-col items-center gap-1">
      <Handle type="target" position={Position.Top}  id="top"  className="wf-handle" />
      <Handle type="target" position={Position.Left} id="left" className="wf-handle" />

      <div
        className={cn(
          "relative w-[76px] h-[76px] flex items-center justify-center cursor-pointer transition-all duration-200",
          selected && "scale-105",
        )}
      >
        <svg width="76" height="76" viewBox="0 0 76 76" className="absolute inset-0">
          <polygon
            points="38,3 73,38 38,73 3,38"
            fill={cfg.fill}
            stroke={cfg.stroke}
            strokeWidth={selected ? 2.5 : 1.75}
            strokeLinejoin="round"
          />
          {selected && (
            <polygon
              points="38,3 73,38 38,73 3,38"
              fill="none"
              stroke={cfg.stroke}
              strokeWidth={4}
              strokeOpacity={0.18}
              strokeLinejoin="round"
            />
          )}
        </svg>
        <span
          className="relative text-[22px] font-bold leading-none select-none z-10"
          style={{ color: cfg.stroke, marginTop: gt === "exclusive" ? "-2px" : 0 }}
        >
          {cfg.marker}
        </span>
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
