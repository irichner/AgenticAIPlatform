"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/cn";
import { XCircle, MessageSquare } from "lucide-react";

export type EndEventSubtype = "none" | "terminate" | "error" | "message";

export type EndEventData = {
  label?: string;
  subtype?: EndEventSubtype;
};

export const EndEventNode = memo(function EndEventNode({ data, selected }: NodeProps) {
  const d = data as EndEventData;
  const sub = d.subtype ?? "none";

  return (
    <div className="flex flex-col items-center gap-1">
      <Handle type="target" position={Position.Top}  id="top"  className="wf-handle" />
      <Handle type="target" position={Position.Left} id="left" className="wf-handle" />
      <div
        className={cn(
          "w-14 h-14 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200",
          "border-[3.5px] border-rose/70 bg-rose/10",
          selected && "ring-2 ring-rose/40 ring-offset-2 ring-offset-[rgb(var(--color-surface-0,6_6_11))] scale-105",
        )}
      >
        {sub === "terminate" && (
          <div className="w-7 h-7 rounded-full bg-rose/65" />
        )}
        {sub === "error" && (
          <XCircle className="w-6 h-6 text-rose/80" strokeWidth={2.5} />
        )}
        {sub === "message" && (
          <MessageSquare className="w-5 h-5 text-rose/80" strokeWidth={2} />
        )}
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
