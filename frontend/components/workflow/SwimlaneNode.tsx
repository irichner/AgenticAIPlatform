"use client";

import { memo, useState } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/cn";

export interface SwimlaneData {
  label?: string;
  orientation?: "horizontal" | "vertical";
  color?: string;
}

const COLOR_OPTIONS = [
  { label: "Violet", value: "violet",  bg: "rgba(139,92,246,0.08)", border: "rgba(139,92,246,0.4)", header: "rgba(139,92,246,0.18)" },
  { label: "Cyan",   value: "cyan",    bg: "rgba(6,182,212,0.07)",  border: "rgba(6,182,212,0.4)",  header: "rgba(6,182,212,0.18)"  },
  { label: "Amber",  value: "amber",   bg: "rgba(245,158,11,0.07)", border: "rgba(245,158,11,0.4)", header: "rgba(245,158,11,0.18)" },
  { label: "Rose",   value: "rose",    bg: "rgba(244,63,94,0.06)",  border: "rgba(244,63,94,0.35)", header: "rgba(244,63,94,0.18)"  },
  { label: "Emerald",value: "emerald", bg: "rgba(16,185,129,0.07)", border: "rgba(16,185,129,0.4)", header: "rgba(16,185,129,0.18)" },
];

function getColors(colorValue?: string) {
  return COLOR_OPTIONS.find((c) => c.value === colorValue) ?? COLOR_OPTIONS[0];
}

export const SwimlaneNode = memo(function SwimlaneNode({ data, selected }: NodeProps) {
  const d = data as SwimlaneData;
  const colors = getColors(d.color);
  const isVertical = d.orientation === "vertical";

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={120}
        handleStyle={{ width: 8, height: 8, borderRadius: 4 }}
      />
      <div
        className="w-full h-full rounded-2xl overflow-hidden"
        style={{
          border: `1.5px solid ${colors.border}`,
          background: colors.bg,
        }}
      >
        {/* Header strip */}
        <div
          className={cn(
            "flex items-center px-3",
            isVertical
              ? "flex-col justify-center w-8 h-full writing-mode-vertical"
              : "flex-row h-9 border-b",
          )}
          style={{ background: colors.header, borderColor: colors.border }}
        >
          <span
            className={cn(
              "text-xs font-semibold text-text-1 truncate select-none",
              isVertical && "rotate-90 origin-center whitespace-nowrap",
            )}
          >
            {d.label || "Pool"}
          </span>
        </div>
      </div>
    </>
  );
});
