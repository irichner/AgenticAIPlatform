"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2, XCircle, Loader2, ArrowRight, Zap, X } from "lucide-react";
// ── Types ─────────────────────────────────────────────────────────────────────

export type ExecEventType =
  | "run_start"
  | "node_enter"
  | "node_token"
  | "node_exit"
  | "edge"
  | "run_done"
  | "run_error";

export interface ExecEvent {
  type: ExecEventType;
  node_id?: string;
  label?: string;
  node_type?: string;
  text?: string;
  output?: string;
  from_id?: string;
  to_id?: string;
  from_label?: string;
  to_label?: string;
  final_output?: string;
  error?: string;
  simulate?: boolean;
}

interface RunInputDialogProps {
  onRun: (message: string, simulate: boolean) => void;
  onClose: () => void;
}

// ── Run input dialog ──────────────────────────────────────────────────────────

export function RunInputDialog({ onRun, onClose }: RunInputDialogProps) {
  const textRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass border border-border rounded-2xl shadow-2xl w-96 p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-1 flex items-center gap-2">
            <Zap className="w-4 h-4 text-violet" />
            Run Workflow
          </h3>
          <button onClick={onClose} className="text-text-3 hover:text-text-2">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] text-text-3 font-medium">Initial input / trigger message</label>
          <textarea
            ref={textRef}
            autoFocus
            rows={4}
            placeholder="e.g. Qualify this lead: Acme Corp, $200k deal, EMEA…"
            className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-xs text-text-1 placeholder:text-text-3 outline-none focus:border-violet transition-colors resize-none"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => { onRun(textRef.current?.value ?? "", true); }}
            className="px-3 py-1.5 text-xs text-text-2 hover:text-text-1 hover:bg-surface-2 rounded-lg transition-colors border border-border"
          >
            Simulate
          </button>
          <button
            onClick={() => { onRun(textRef.current?.value ?? "", false); }}
            className="px-4 py-1.5 text-xs font-medium bg-violet text-white hover:bg-violet/90 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Zap className="w-3 h-3" />
            Run
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Execution panel ───────────────────────────────────────────────────────────

interface ExecutionPanelProps {
  events: ExecEvent[];
  isRunning: boolean;
  isSimulation: boolean;
  nodeLabels: Map<string, string>;
  onClose: () => void;
}

function EventRow({ ev, nodeLabels }: { ev: ExecEvent; nodeLabels: Map<string, string> }) {
  const label = ev.label || (ev.node_id ? nodeLabels.get(ev.node_id) : null) || ev.node_id;

  if (ev.type === "run_start") {
    return (
      <div className="flex items-center gap-2 py-1.5">
        <Zap className="w-3 h-3 text-violet shrink-0" />
        <span className="text-[11px] text-violet font-medium">
          {ev.simulate ? "Simulation started" : "Execution started"}
        </span>
      </div>
    );
  }

  if (ev.type === "node_enter") {
    return (
      <div className="flex items-center gap-2 py-1 pl-4">
        <div className="w-1.5 h-1.5 rounded-full bg-amber shrink-0 animate-pulse" />
        <span className="text-[11px] text-text-2">
          <span className="text-amber font-medium">→ {label}</span>
        </span>
      </div>
    );
  }

  if (ev.type === "node_token") {
    return null; // tokens handled by the aggregated output row
  }

  if (ev.type === "node_exit") {
    return (
      <div className="flex flex-col gap-0.5 py-1 pl-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3 h-3 text-emerald shrink-0" />
          <span className="text-[11px] text-emerald font-medium">{label} done</span>
        </div>
        {ev.output && (
          <div className="ml-5 max-h-20 overflow-y-auto">
            <p className="text-[10px] text-text-3 leading-relaxed whitespace-pre-wrap line-clamp-4">
              {ev.output}
            </p>
          </div>
        )}
      </div>
    );
  }

  if (ev.type === "edge") {
    const fromLabel = ev.from_label || (ev.from_id ? nodeLabels.get(ev.from_id) : null) || ev.from_id;
    const toLabel   = ev.to_label   || (ev.to_id   ? nodeLabels.get(ev.to_id)   : null) || ev.to_id;
    return (
      <div className="flex items-center gap-1.5 py-0.5 pl-4">
        <ArrowRight className="w-3 h-3 text-text-3 shrink-0" />
        <span className="text-[10px] text-text-3">{fromLabel} → {toLabel}</span>
      </div>
    );
  }

  if (ev.type === "run_done") {
    return (
      <div className="flex flex-col gap-1 py-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald shrink-0" />
          <span className="text-[11px] text-emerald font-semibold">Workflow complete</span>
        </div>
        {ev.final_output && (
          <div className="ml-5 p-2 rounded-lg bg-emerald/5 border border-emerald/20">
            <p className="text-[10px] text-text-2 leading-relaxed whitespace-pre-wrap">
              {ev.final_output}
            </p>
          </div>
        )}
      </div>
    );
  }

  if (ev.type === "run_error") {
    return (
      <div className="flex items-start gap-2 py-1.5">
        <XCircle className="w-3.5 h-3.5 text-rose shrink-0 mt-0.5" />
        <span className="text-[11px] text-rose leading-relaxed">{ev.error}</span>
      </div>
    );
  }

  return null;
}

export function ExecutionPanel({
  events,
  isRunning,
  isSimulation,
  nodeLabels,
  onClose,
}: ExecutionPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  // Aggregate: for each node_enter, collect all subsequent node_token events
  // until node_exit, then show them as part of the node_exit row.
  // We do this by building a display list that merges tokens into the exit row.
  const displayEvents: ExecEvent[] = [];
  const tokenBuffers = new Map<string, string>();

  for (const ev of events) {
    if (ev.type === "node_token" && ev.node_id) {
      tokenBuffers.set(ev.node_id, (tokenBuffers.get(ev.node_id) ?? "") + (ev.text ?? ""));
    } else if (ev.type === "node_exit" && ev.node_id) {
      const buffered = tokenBuffers.get(ev.node_id);
      displayEvents.push({ ...ev, output: ev.output ?? buffered ?? "" });
      tokenBuffers.delete(ev.node_id);
    } else {
      displayEvents.push(ev);
    }
  }

  // Show in-progress token output for currently active node
  const activeTokenEntry = Array.from(tokenBuffers.entries())[0];

  return (
    <div className="w-72 shrink-0 flex flex-col glass border-l border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Loader2 className="w-3.5 h-3.5 text-violet animate-spin" />
          ) : (
            <Zap className="w-3.5 h-3.5 text-violet" />
          )}
          <span className="text-xs font-semibold text-text-1">
            {isSimulation ? "Simulation" : "Execution"} Trace
          </span>
          {isRunning && (
            <span className="text-[10px] text-amber animate-pulse">running…</span>
          )}
        </div>
        <button onClick={onClose} className="text-text-3 hover:text-text-2 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Events */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {displayEvents.length === 0 ? (
          <p className="text-[11px] text-text-3 italic py-4 text-center">No events yet</p>
        ) : (
          displayEvents.map((ev, i) => (
            <EventRow key={i} ev={ev} nodeLabels={nodeLabels} />
          ))
        )}

        {/* Live token stream for in-progress node */}
        {activeTokenEntry && (
          <div className="flex flex-col gap-0.5 py-1 pl-4">
            <div className="flex items-center gap-2">
              <Loader2 className="w-3 h-3 text-amber animate-spin shrink-0" />
              <span className="text-[11px] text-amber font-medium">
                {nodeLabels.get(activeTokenEntry[0]) || activeTokenEntry[0]}
              </span>
            </div>
            <div className="ml-5">
              <p className="text-[10px] text-text-3 leading-relaxed whitespace-pre-wrap">
                {activeTokenEntry[1]}
                <span className="animate-pulse">▊</span>
              </p>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
