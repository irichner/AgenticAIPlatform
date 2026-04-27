"use client";

import { memo } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/cn";

export type AnnotationData = {
  text?: string;
};

export const AnnotationNode = memo(function AnnotationNode({ data, selected }: NodeProps) {
  const d = data as AnnotationData;

  return (
    <div className="relative w-full h-full" style={{ minWidth: 100, minHeight: 40 }}>
      <NodeResizer
        minWidth={100}
        minHeight={40}
        isVisible={selected}
        lineStyle={{ borderColor: "rgba(255,255,255,0.25)" }}
        handleStyle={{ borderColor: "rgba(255,255,255,0.4)", backgroundColor: "rgba(255,255,255,0.15)" }}
      />
      <div
        className={cn(
          "h-full px-3 py-2.5 flex items-start",
          "border-l-2 border-t-2 border-b-2 rounded-tl-sm rounded-bl-sm",
          selected ? "border-white/40" : "border-white/20",
        )}
      >
        <p className="text-xs text-text-3 italic leading-relaxed w-full whitespace-pre-wrap break-words">
          {d.text || "Note…"}
        </p>
      </div>
    </div>
  );
});
