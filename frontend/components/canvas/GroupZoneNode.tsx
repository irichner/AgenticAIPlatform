"use client";

import { memo } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { Layers } from "lucide-react";
import { cn } from "@/lib/cn";

const accents = [
  { text: "text-violet/60",  border: "border-violet/20",  bg: "bg-violet/5"  },
  { text: "text-cyan/60",    border: "border-cyan/20",    bg: "bg-cyan/5"    },
  { text: "text-amber/60",   border: "border-amber/20",   bg: "bg-amber/5"   },
  { text: "text-rose/60",    border: "border-rose/20",    bg: "bg-rose/5"    },
  { text: "text-emerald/60", border: "border-emerald/20", bg: "bg-emerald/5" },
];

export type GroupZoneData = {
  name: string;
  colorIndex: number;
};

export const GroupZoneNode = memo(function GroupZoneNode({ data, selected }: NodeProps) {
  const d = data as GroupZoneData;
  const a = accents[d.colorIndex % accents.length];

  return (
    <>
      <NodeResizer
        minWidth={240}
        minHeight={100}
        isVisible={selected}
        lineStyle={{ stroke: "rgba(139,92,246,0.35)", strokeWidth: 1.5 }}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, backgroundColor: "rgba(139,92,246,0.65)", border: "none" }}
      />
      <div className={cn("w-full h-full rounded-xl border", a.border, a.bg)}>
        <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1.5">
          <Layers className={cn("w-3 h-3 shrink-0", a.text)} />
          <span className={cn("text-xs font-semibold tracking-wide", a.text)}>{d.name}</span>
        </div>
      </div>
    </>
  );
});
