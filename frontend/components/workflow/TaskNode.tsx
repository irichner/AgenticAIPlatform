"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { User, Settings, Code, Mail, Phone, ClipboardList } from "lucide-react";
import { cn } from "@/lib/cn";

export type TaskSubtype = "task" | "userTask" | "serviceTask" | "scriptTask" | "sendTask" | "receiveTask";

export type TaskData = {
  label?: string;
  subtype?: TaskSubtype;
  description?: string;
};

const subtypeCfg: Record<TaskSubtype, { icon: React.ElementType; label: string }> = {
  task:        { icon: ClipboardList, label: "Task"         },
  userTask:    { icon: User,          label: "User Task"    },
  serviceTask: { icon: Settings,      label: "Service Task" },
  scriptTask:  { icon: Code,          label: "Script Task"  },
  sendTask:    { icon: Mail,          label: "Send Task"    },
  receiveTask: { icon: Phone,         label: "Receive Task" },
};

export const TaskNode = memo(function TaskNode({ data, selected }: NodeProps) {
  const d = data as TaskData;
  const sub = d.subtype ?? "task";
  const cfg = subtypeCfg[sub];
  const Icon = cfg.icon;

  return (
    <>
      <Handle type="target" position={Position.Top}  id="top"  className="wf-handle" />
      <Handle type="target" position={Position.Left} id="left" className="wf-handle" />

      <div
        className={cn(
          "glass rounded-xl px-4 py-3 w-48 flex flex-col gap-2 cursor-pointer border transition-all duration-200",
          "border-sky-500/30 bg-sky-500/5",
          selected && "ring-1 ring-sky-400/50 border-sky-400/50",
        )}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-sky-500/15 flex items-center justify-center shrink-0">
            <Icon className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <span className="text-[10px] text-sky-400/80 font-semibold uppercase tracking-wider truncate">
            {cfg.label}
          </span>
        </div>
        <p className="text-sm font-semibold text-text-1 leading-snug line-clamp-2">
          {d.label || "Unnamed Task"}
        </p>
        {d.description && (
          <p className="text-xs text-text-3 line-clamp-2 border-t border-border/40 pt-1.5">
            {d.description}
          </p>
        )}
      </div>

      <Handle type="source" position={Position.Right}  id="right"  className="wf-handle" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="wf-handle" />
    </>
  );
});
