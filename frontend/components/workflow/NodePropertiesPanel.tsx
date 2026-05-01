"use client";

import { useState, useEffect } from "react";
import { Bot, X, Save, AlertTriangle } from "lucide-react";

import type { Node, Edge } from "@xyflow/react";
import type { TriggerNodeData, TriggerType } from "./TriggerNode";
import type { WorkflowStepData, InputType } from "./WorkflowStepNode";
import type { EndEventData, EndEventSubtype } from "./EndEventNode";
import type { GatewayData, GatewayType } from "./GatewayNode";
import type { TaskData, TaskSubtype } from "./TaskNode";
import type { IntermediateEventData, IntermediateEventType, IntermediateEventMode } from "./IntermediateEventNode";
import type { AnnotationData } from "./AnnotationNode";
import type { EdgeData } from "./FloatingEdge";

// ── Shared field styles ───────────────────────────────────────────────────────

const labelCls = "text-[10px] font-semibold text-text-3 uppercase tracking-widest";
const inputCls =
  "w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-violet transition-colors";
const selectCls =
  "w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-1 outline-none focus:border-violet transition-colors";
const textareaCls =
  "w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-violet transition-colors resize-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-violet/6 border border-violet/15 px-3 py-2.5">
      <p className="text-xs text-violet/80 leading-relaxed">{children}</p>
    </div>
  );
}

// ── Modal Panel wrapper ───────────────────────────────────────────────────────

interface PanelProps {
  title: string;
  isDirty: boolean;
  onRequestClose: () => void;
  onSave: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  showConfirm: boolean;
  onConfirmDiscard: () => void;
  onCancelConfirm: () => void;
  children: React.ReactNode;
}

function Panel({
  title,
  isDirty,
  onRequestClose,
  onSave,
  onRemove,
  removeLabel = "Remove",
  showConfirm,
  onConfirmDiscard,
  onCancelConfirm,
  children,
}: PanelProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onRequestClose(); }}
    >
      <div
        className="relative w-[760px] max-h-[88vh] flex flex-col glass border border-border rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <span className="text-base font-semibold text-text-1">{title}</span>
          <button
            onClick={onRequestClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-2 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-5 px-6 py-5 flex-1 overflow-y-auto">
          {children}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
          <div>
            {onRemove && (
              <button
                onClick={onRemove}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose/25 bg-rose/5 hover:bg-rose/12 text-rose text-sm transition-colors"
              >
                {removeLabel}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRequestClose}
              className="px-4 py-1.5 rounded-xl text-sm text-text-2 hover:text-text-1 hover:bg-surface-2 border border-border transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={!isDirty}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-sm font-medium bg-violet hover:bg-violet/90 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save className="w-3.5 h-3.5" />
              Save Changes
            </button>
          </div>
        </div>

        {/* Unsaved-changes confirm overlay */}
        {showConfirm && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-1/75 backdrop-blur-sm rounded-2xl z-10">
            <div className="w-80 flex flex-col gap-4 glass border border-border rounded-2xl p-6 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber/10 border border-amber/20 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4 text-amber" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-1">Unsaved changes</p>
                  <p className="text-xs text-text-3 mt-0.5">What would you like to do?</p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={onSave}
                  className="w-full py-2 rounded-xl bg-violet hover:bg-violet/90 text-white text-sm font-medium transition-colors"
                >
                  Save changes
                </button>
                <button
                  onClick={onConfirmDiscard}
                  className="w-full py-2 rounded-xl border border-rose/25 bg-rose/5 hover:bg-rose/12 text-rose text-sm transition-colors"
                >
                  Discard changes
                </button>
                <button
                  onClick={onCancelConfirm}
                  className="w-full py-2 rounded-xl text-sm text-text-2 hover:text-text-1 hover:bg-surface-2 transition-colors"
                >
                  Keep editing
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface NodePropertiesPanelProps {
  node?: Node | null;
  edge?: Edge | null;
  edges: Edge[];
  onUpdateNode: (data: Partial<Record<string, unknown>>) => void;
  onUpdateEdge: (data: Partial<EdgeData>) => void;
  onRemoveNode: () => void;
  onRemoveEdge: () => void;
  onClose: () => void;
}

export function NodePropertiesPanel({
  node,
  edge,
  edges,
  onUpdateNode,
  onUpdateEdge,
  onRemoveNode,
  onRemoveEdge,
  onClose,
}: NodePropertiesPanelProps) {
  const itemId = node?.id ?? edge?.id;

  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Reset draft whenever the selected item changes
  useEffect(() => {
    setDraft(((node?.data ?? edge?.data) as Record<string, unknown>) ?? {});
    setIsDirty(false);
    setShowConfirm(false);
  }, [itemId]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (partial: Record<string, unknown>) => {
    setDraft((prev) => ({ ...prev, ...partial }));
    setIsDirty(true);
  };

  const handleSave = () => {
    if (edge) onUpdateEdge(draft as Partial<EdgeData>);
    else onUpdateNode(draft);
    onClose();
  };

  const handleRequestClose = () => {
    if (isDirty) setShowConfirm(true);
    else onClose();
  };

  const handleConfirmDiscard = () => {
    setShowConfirm(false);
    onClose();
  };

  const panelProps = {
    isDirty,
    onRequestClose: handleRequestClose,
    onSave: handleSave,
    showConfirm,
    onConfirmDiscard: handleConfirmDiscard,
    onCancelConfirm: () => setShowConfirm(false),
  };

  if (!node && !edge) return null;

  // ── Edge panel ────────────────────────────────────────────────────────────
  if (edge) {
    const d = draft as EdgeData;
    return (
      <Panel
        {...panelProps}
        title="Sequence Flow"
        onRemove={onRemoveEdge}
        removeLabel="Delete Connection"
      >
        <Field label="Label">
          <input
            className={inputCls}
            value={d.label ?? ""}
            onChange={(e) => update({ label: e.target.value })}
            placeholder="e.g. Approved, Yes, Error…"
          />
          <p className="text-xs text-text-3">Shown on the connection line</p>
        </Field>

        <Field label="Flow Type">
          <select
            className={selectCls}
            value={d.edgeType ?? "sequence"}
            onChange={(e) => update({ edgeType: e.target.value as EdgeData["edgeType"] })}
          >
            <option value="sequence">Sequence Flow</option>
            <option value="conditional">Conditional Flow</option>
            <option value="default">Default Flow</option>
          </select>
        </Field>

        {(d.edgeType === "conditional" || d.edgeType === "default") && (
          <Field label="Condition Expression">
            <input
              className={inputCls}
              value={d.condition ?? ""}
              onChange={(e) => update({ condition: e.target.value })}
              placeholder="e.g. status === 'approved'"
            />
            <p className="text-xs text-text-3">Evaluated at runtime to determine if this path is taken</p>
          </Field>
        )}

        <InfoBox>
          {d.edgeType === "conditional"
            ? "Taken when the condition evaluates to true."
            : d.edgeType === "default"
            ? "Taken when no other conditional flow matches."
            : "Standard sequence flow — always followed unless a gateway controls routing."}
        </InfoBox>
      </Panel>
    );
  }

  if (!node) return null;

  // ── Start Event (TriggerNode) ─────────────────────────────────────────────
  if (node.type === "triggerNode") {
    const d = draft as TriggerNodeData;
    return (
      <Panel {...panelProps} title="Start Event">
        <Field label="Trigger Type">
          <select
            value={d.triggerType ?? "manual"}
            onChange={(e) => update({ triggerType: e.target.value as TriggerType })}
            className={selectCls}
          >
            <option value="manual">Manual Trigger</option>
            <option value="email">Email</option>
            <option value="webhook">Webhook</option>
            <option value="file">File Upload</option>
            <option value="schedule">Schedule</option>
          </select>
          <p className="text-xs text-text-3">How this process is initiated</p>
        </Field>

        <Field label="Label (optional)">
          <input
            value={d.label ?? ""}
            onChange={(e) => update({ label: e.target.value })}
            placeholder="e.g. New deal created…"
            className={inputCls}
          />
        </Field>

        <InfoBox>
          The Start Event is the entry point of your process. It cannot be deleted — only reconfigured.
        </InfoBox>
      </Panel>
    );
  }

  // ── End Event ─────────────────────────────────────────────────────────────
  if (node.type === "endEvent") {
    const d = draft as EndEventData;
    return (
      <Panel {...panelProps} title="End Event" onRemove={onRemoveNode} removeLabel="Remove End Event">
        <Field label="End Type">
          <select
            value={d.subtype ?? "none"}
            onChange={(e) => update({ subtype: e.target.value as EndEventSubtype })}
            className={selectCls}
          >
            <option value="none">Plain End</option>
            <option value="terminate">Terminate (stops all)</option>
            <option value="error">Error End</option>
            <option value="message">Message End</option>
          </select>
        </Field>

        <Field label="Label (optional)">
          <input
            value={d.label ?? ""}
            onChange={(e) => update({ label: e.target.value })}
            placeholder="e.g. Process complete"
            className={inputCls}
          />
        </Field>

        <InfoBox>
          {d.subtype === "terminate"
            ? "Terminate: immediately stops all active paths in the process."
            : d.subtype === "error"
            ? "Error End: throws a BPMN error that can be caught by an error boundary."
            : d.subtype === "message"
            ? "Message End: sends a message and ends the process."
            : "Plain End: marks a normal completion path."}
        </InfoBox>
      </Panel>
    );
  }

  // ── Gateway ───────────────────────────────────────────────────────────────
  if (node.type === "gateway") {
    const d = draft as GatewayData;
    return (
      <Panel {...panelProps} title="Gateway" onRemove={onRemoveNode} removeLabel="Remove Gateway">
        <Field label="Gateway Type">
          <select
            value={d.gatewayType ?? "exclusive"}
            onChange={(e) => update({ gatewayType: e.target.value as GatewayType })}
            className={selectCls}
          >
            <option value="exclusive">Exclusive (XOR) — one path</option>
            <option value="parallel">Parallel (AND) — all paths</option>
            <option value="inclusive">Inclusive (OR) — one or more</option>
          </select>
        </Field>

        <Field label="Label (optional)">
          <input
            value={d.label ?? ""}
            onChange={(e) => update({ label: e.target.value })}
            placeholder="e.g. Approval decision"
            className={inputCls}
          />
        </Field>

        <InfoBox>
          {d.gatewayType === "exclusive"
            ? "XOR: evaluates conditions on outgoing flows — exactly one path is taken."
            : d.gatewayType === "parallel"
            ? "AND: activates all outgoing flows simultaneously — use a join AND gateway to merge them."
            : "OR: one or more outgoing flows are taken based on conditions."}
        </InfoBox>
      </Panel>
    );
  }

  // ── Task Node ─────────────────────────────────────────────────────────────
  if (node.type === "taskNode") {
    const d = draft as TaskData;
    return (
      <Panel {...panelProps} title="Task" onRemove={onRemoveNode} removeLabel="Remove Task">
        <Field label="Task Type">
          <select
            value={d.subtype ?? "task"}
            onChange={(e) => update({ subtype: e.target.value as TaskSubtype })}
            className={selectCls}
          >
            <option value="task">Task (Generic)</option>
            <option value="userTask">User Task</option>
            <option value="serviceTask">Service Task</option>
            <option value="scriptTask">Script Task</option>
            <option value="sendTask">Send Task</option>
            <option value="receiveTask">Receive Task</option>
          </select>
        </Field>

        <Field label="Name">
          <input
            value={d.label ?? ""}
            onChange={(e) => update({ label: e.target.value })}
            placeholder="Task name…"
            className={inputCls}
          />
        </Field>

        <Field label="Description (optional)">
          <textarea
            value={d.description ?? ""}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="What does this task do?"
            className={textareaCls}
            rows={4}
          />
        </Field>
      </Panel>
    );
  }

  // ── Intermediate Event ────────────────────────────────────────────────────
  if (node.type === "intermediateEvent") {
    const d = draft as IntermediateEventData;
    return (
      <Panel
        {...panelProps}
        title="Intermediate Event"
        onRemove={onRemoveNode}
        removeLabel="Remove Event"
      >
        <Field label="Event Type">
          <select
            value={d.eventType ?? "timer"}
            onChange={(e) => update({ eventType: e.target.value as IntermediateEventType })}
            className={selectCls}
          >
            <option value="timer">Timer</option>
            <option value="message">Message</option>
            <option value="signal">Signal</option>
            <option value="error">Error (catching)</option>
          </select>
        </Field>

        <Field label="Mode">
          <select
            value={d.mode ?? "catching"}
            onChange={(e) => update({ mode: e.target.value as IntermediateEventMode })}
            className={selectCls}
          >
            <option value="catching">Catching</option>
            <option value="throwing">Throwing</option>
          </select>
        </Field>

        <Field label="Label (optional)">
          <input
            value={d.label ?? ""}
            onChange={(e) => update({ label: e.target.value })}
            placeholder="e.g. Wait 24h"
            className={inputCls}
          />
        </Field>

        {d.eventType === "timer" && (
          <Field label="Timer Expression">
            <input
              value={d.timerExpression ?? ""}
              onChange={(e) => update({ timerExpression: e.target.value })}
              placeholder="PT24H · R/P1D · 2025-01-01T00:00Z"
              className={inputCls}
            />
            <p className="text-xs text-text-3">ISO 8601 duration, recurring, or date</p>
          </Field>
        )}

        <InfoBox>
          {d.mode === "throwing"
            ? "Throwing: emits this event and continues. Useful for signalling across pools."
            : "Catching: waits for this event before continuing."}
        </InfoBox>
      </Panel>
    );
  }

  // ── Annotation ────────────────────────────────────────────────────────────
  if (node.type === "annotation") {
    const d = draft as AnnotationData;
    return (
      <Panel {...panelProps} title="Annotation" onRemove={onRemoveNode} removeLabel="Remove Annotation">
        <Field label="Note Text">
          <textarea
            value={d.text ?? ""}
            onChange={(e) => update({ text: e.target.value })}
            placeholder="Add a note or comment…"
            className={textareaCls}
            rows={8}
          />
        </Field>
      </Panel>
    );
  }

  // ── Agent Task (WorkflowStepNode) ─────────────────────────────────────────
  if (node.type === "workflowStep") {
    const d = draft as WorkflowStepData;
    const hasIncoming = edges.some((e) => e.target === node.id);

    return (
      <Panel
        {...panelProps}
        title="Agent Task"
        onRemove={onRemoveNode}
        removeLabel="Remove Agent Task"
      >
        {/* Agent identity card */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 border border-border">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet to-violet-dim flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-1 truncate">{d.agentName}</p>
            <p className="text-xs text-text-3 truncate">{d.swarmName}</p>
          </div>
        </div>

        {/* System prompt — primary control */}
        <Field label="System Prompt">
          <textarea
            value={d.systemPrompt ?? ""}
            onChange={(e) => update({ systemPrompt: e.target.value })}
            placeholder="You are an expert sales analyst. Your job is to…"
            className={`${textareaCls} min-h-[280px]`}
            rows={12}
          />
          <p className="text-xs text-text-3">
            Instructs the agent how to behave for this step. Overrides the agent&apos;s default system prompt.
          </p>
        </Field>

        {/* Input type */}
        {hasIncoming ? (
          <InfoBox>
            <span className="block font-semibold text-violet/70 uppercase tracking-widest text-[10px] mb-1">Input</span>
            Receives output from the connected upstream step automatically.
          </InfoBox>
        ) : (
          <Field label="Input Type">
            <select
              value={d.inputType ?? "any"}
              onChange={(e) => update({ inputType: e.target.value as InputType })}
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
            <p className="text-xs text-text-3">Type of data accepted as input at this step</p>
          </Field>
        )}

        {/* Output */}
        <div className="rounded-xl bg-surface-2 border border-border px-3 py-2.5">
          <p className="text-[10px] font-semibold text-text-3 uppercase tracking-widest mb-1">Output</p>
          <p className="text-xs text-text-2">Passes result to the next connected step</p>
        </div>
      </Panel>
    );
  }

  return null;
}
