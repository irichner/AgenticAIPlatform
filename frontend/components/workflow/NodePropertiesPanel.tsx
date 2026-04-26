"use client";

import { Bot } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Node, Edge } from "@xyflow/react";
import type { TriggerNodeData, TriggerType } from "./TriggerNode";
import type { WorkflowStepData, InputType } from "./WorkflowStepNode";

const labelCls = "text-[10px] font-semibold text-text-3 uppercase tracking-widest";
const selectCls =
  "w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-1 outline-none focus:border-violet transition-colors";

interface NodePropertiesPanelProps {
  node: Node;
  edges: Edge[];
  onUpdate: (data: Partial<TriggerNodeData | WorkflowStepData>) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function NodePropertiesPanel({
  node,
  edges,
  onUpdate,
  onRemove,
  onClose,
}: NodePropertiesPanelProps) {
  const hasIncoming = edges.some((e) => e.target === node.id);

  if (node.type === "triggerNode") {
    const d = node.data as TriggerNodeData;
    return (
      <div className="w-72 shrink-0 flex flex-col glass border-l border-border h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <span className="text-sm font-semibold text-text-1">Start Trigger</span>
          <button
            onClick={onClose}
            className="text-text-3 hover:text-text-2 text-xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-5 p-4">
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Trigger Type</label>
            <select
              value={d.triggerType ?? "manual"}
              onChange={(e) =>
                onUpdate({ triggerType: e.target.value as TriggerType })
              }
              className={selectCls}
            >
              <option value="manual">Manual Trigger</option>
              <option value="email">Email</option>
              <option value="webhook">Webhook</option>
              <option value="file">File Upload</option>
              <option value="schedule">Schedule</option>
            </select>
            <p className="text-xs text-text-3">How this workflow is started</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Label (optional)</label>
            <input
              value={d.label ?? ""}
              onChange={(e) => onUpdate({ label: e.target.value })}
              placeholder="e.g. New deal created…"
              className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-violet transition-colors"
            />
          </div>

          <div className="rounded-xl bg-violet/6 border border-violet/15 px-3 py-2.5">
            <p className="text-xs text-violet/80 leading-relaxed">
              The trigger node is the entry point. It cannot be deleted, only reconfigured.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (node.type === "workflowStep") {
    const d = node.data as WorkflowStepData;
    return (
      <div className="w-72 shrink-0 flex flex-col glass border-l border-border h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <span className="text-sm font-semibold text-text-1">Step Config</span>
          <button
            onClick={onClose}
            className="text-text-3 hover:text-text-2 text-xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-5 p-4 flex-1 overflow-y-auto">
          {/* Agent card */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 border border-border">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet to-violet-dim flex items-center justify-center shrink-0">
              <Bot className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-1 truncate">{d.agentName}</p>
              <p className="text-xs text-text-3 truncate">{d.swarmName}</p>
            </div>
          </div>

          {/* Input configuration */}
          {hasIncoming ? (
            <div className="rounded-xl bg-violet/6 border border-violet/15 px-3 py-2.5">
              <p className="text-[10px] font-semibold text-violet/60 uppercase tracking-widest mb-1">
                Input
              </p>
              <p className="text-xs text-violet/80">
                Receives output from the connected step automatically
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Input Type</label>
              <select
                value={d.inputType ?? "any"}
                onChange={(e) => onUpdate({ inputType: e.target.value as InputType })}
                className={selectCls}
              >
                <option value="any">Any</option>
                <option value="text">Text</option>
                <option value="json">JSON</option>
                <option value="file">File</option>
                <option value="image">Image</option>
                <option value="document">Document</option>
                <option value="email">Email</option>
                <option value="webhook">Webhook</option>
              </select>
              <p className="text-xs text-text-3">
                Type of data this step accepts as input
              </p>
            </div>
          )}

          {/* Output info */}
          <div className="flex flex-col gap-1.5">
            <p className={labelCls}>Output</p>
            <div className="rounded-xl bg-surface-2 border border-border px-3 py-2.5">
              <p className="text-xs text-text-2">
                Passes result to the next connected step
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border shrink-0">
          <button
            onClick={onRemove}
            className={cn(
              "w-full py-2 rounded-xl border border-rose/25 bg-rose/5 hover:bg-rose/12",
              "text-rose text-sm transition-colors",
            )}
          >
            Remove Step
          </button>
        </div>
      </div>
    );
  }

  return null;
}
