"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot, FileText, Mail, Globe, Zap, Upload, Image, Code2 } from "lucide-react";
import { cn } from "@/lib/cn";

export type InputType = "any" | "text" | "json" | "file" | "image" | "document" | "email" | "webhook";

export type WorkflowStepData = {
  agentId: string;
  agentName: string;
  agentDescription: string | null;
  swarmName: string;
  swarmId: string;
  colorIndex: number;
  inputType: InputType;
};

const inputCfg: Record<InputType, { icon: React.ElementType; label: string; color: string }> = {
  any:      { icon: Zap,      label: "Any",      color: "text-text-3"     },
  text:     { icon: FileText, label: "Text",     color: "text-violet/70"  },
  json:     { icon: Code2,    label: "JSON",     color: "text-cyan/70"    },
  file:     { icon: Upload,   label: "File",     color: "text-amber/70"   },
  image:    { icon: Image,    label: "Image",    color: "text-rose/70"    },
  document: { icon: FileText, label: "Document", color: "text-emerald/70" },
  email:    { icon: Mail,     label: "Email",    color: "text-violet/70"  },
  webhook:  { icon: Globe,    label: "Webhook",  color: "text-cyan/70"    },
};

const swarmAccents = [
  { border: "border-violet/20", badge: "bg-violet/15 text-violet/80"    },
  { border: "border-cyan/20",   badge: "bg-cyan/15 text-cyan/80"        },
  { border: "border-amber/20",  badge: "bg-amber/15 text-amber/80"      },
  { border: "border-rose/20",   badge: "bg-rose/15 text-rose/80"        },
  { border: "border-emerald/20",badge: "bg-emerald/15 text-emerald/80"  },
];

export const WorkflowStepNode = memo(function WorkflowStepNode({ data, selected }: NodeProps) {
  const d = data as WorkflowStepData;
  const accent = swarmAccents[(d.colorIndex ?? 0) % swarmAccents.length];
  const inp = inputCfg[d.inputType ?? "any"];
  const InputIcon = inp.icon;

  return (
    <>
      <Handle type="target" position={Position.Top}    id="top"    className="wf-handle" />
      <Handle type="target" position={Position.Left}   id="left"   className="wf-handle" />
      <div
        className={cn(
          "glass rounded-2xl p-3.5 w-52 flex flex-col gap-2 cursor-pointer transition-all duration-200 border",
          accent.border,
          selected && "ring-1 ring-white/20",
        )}
      >
        {/* Swarm + icon row */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet to-violet-dim flex items-center justify-center shrink-0">
            <Bot className="w-3.5 h-3.5 text-white" />
          </div>
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded-md font-semibold truncate max-w-[112px]", accent.badge)}>
            {d.swarmName}
          </span>
        </div>

        {/* Agent name + description */}
        <div>
          <p className="text-sm font-semibold text-text-1 leading-snug line-clamp-2">{d.agentName}</p>
          {d.agentDescription && (
            <p className="text-xs text-text-3 mt-0.5 line-clamp-1">{d.agentDescription}</p>
          )}
        </div>

        {/* Input type badge */}
        <div className="flex items-center gap-1.5 pt-0.5 border-t border-border/40">
          <InputIcon className={cn("w-3 h-3 shrink-0", inp.color)} />
          <span className="text-[10px] text-text-3">{inp.label} input</span>
        </div>
      </div>
      <Handle type="source" position={Position.Right}  id="right"  className="wf-handle" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="wf-handle" />
    </>
  );
});
