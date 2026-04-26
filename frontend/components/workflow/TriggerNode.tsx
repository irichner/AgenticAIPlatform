"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Play, Mail, Globe, Upload, Clock } from "lucide-react";
import { cn } from "@/lib/cn";

export type TriggerType = "manual" | "email" | "webhook" | "file" | "schedule";

export type TriggerNodeData = {
  triggerType: TriggerType;
  label?: string;
};

const triggerCfg: Record<
  TriggerType,
  { icon: React.ElementType; label: string; border: string; iconBg: string; iconColor: string }
> = {
  manual:   { icon: Play,   label: "Manual Trigger", border: "border-emerald/30", iconBg: "from-emerald/25 to-emerald/5", iconColor: "text-emerald" },
  email:    { icon: Mail,   label: "Email Trigger",  border: "border-violet/30",  iconBg: "from-violet/25 to-violet/5",   iconColor: "text-violet"  },
  webhook:  { icon: Globe,  label: "Webhook",        border: "border-cyan/30",    iconBg: "from-cyan/25 to-cyan/5",       iconColor: "text-cyan"    },
  file:     { icon: Upload, label: "File Upload",    border: "border-amber/30",   iconBg: "from-amber/25 to-amber/5",     iconColor: "text-amber"   },
  schedule: { icon: Clock,  label: "Schedule",       border: "border-rose/30",    iconBg: "from-rose/25 to-rose/5",       iconColor: "text-rose"    },
};

export const TriggerNode = memo(function TriggerNode({ data, selected }: NodeProps) {
  const d = data as TriggerNodeData;
  const cfg = triggerCfg[d.triggerType ?? "manual"];
  const Icon = cfg.icon;

  return (
    <>
      <div
        className={cn(
          "glass rounded-2xl px-4 py-3.5 w-44 flex flex-col items-center gap-2.5 cursor-pointer transition-all duration-200 border",
          cfg.border,
          selected && "ring-1 ring-white/20",
        )}
      >
        <div className={cn("w-10 h-10 rounded-2xl bg-gradient-to-br flex items-center justify-center", cfg.iconBg)}>
          <Icon className={cn("w-5 h-5", cfg.iconColor)} />
        </div>
        <div className="text-center">
          <p className="text-xs font-semibold text-text-1 leading-tight">{cfg.label}</p>
          {d.label && <p className="text-[10px] text-text-3 mt-0.5">{d.label}</p>}
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 text-text-3 border border-border/60 font-medium tracking-wider">
          START
        </span>
      </div>
      <Handle type="source" position={Position.Top}    id="top"    className="wf-handle" />
      <Handle type="source" position={Position.Right}  id="right"  className="wf-handle" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="wf-handle" />
      <Handle type="source" position={Position.Left}   id="left"   className="wf-handle" />
    </>
  );
});
