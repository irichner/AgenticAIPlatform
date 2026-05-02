"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import useSWR from "swr";
import {
  Zap, CheckCircle2, XCircle, Wrench, ArrowRight, Loader2,
  MessageSquare, Square, ChevronRight, History, ChevronDown,
} from "lucide-react";
import { api, type Run } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { AgentEvent } from "./agentConsoleTypes";

// ── Input styles ──────────────────────────────────────────────────────────────

const inputCls =
  "w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-xs text-text-1 placeholder:text-text-3 outline-none focus:border-violet resize-none";

// ── Approval card ─────────────────────────────────────────────────────────────

interface ApprovalCardProps {
  approvalId: string;
  toolName: string | undefined;
  toolArgs: Record<string, unknown> | undefined;
  message: string | undefined;
  onDecided: () => void;
}

function ApprovalCard({ approvalId, toolName, toolArgs, message, onDecided }: ApprovalCardProps) {
  const [deciding, setDeciding] = useState(false);
  const [decided, setDecided]   = useState<"approve" | "reject" | null>(null);

  const decide = async (decision: "approve" | "reject") => {
    setDeciding(true);
    try {
      await api.approvals.decide(approvalId, decision);
      setDecided(decision);
      onDecided();
    } catch {
      setDeciding(false);
    }
  };

  return (
    <div
      className="rounded-xl border border-amber/30 bg-amber/5 p-3 my-1 flex flex-col gap-2"
      data-testid="approval-card"
    >
      <div className="flex items-start gap-2">
        <ChevronRight className="w-3.5 h-3.5 text-amber shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-amber">Approval required</p>
          {(message || toolName) && (
            <p className="text-[10px] text-text-2 mt-0.5">
              {message ?? `Agent wants to call ${toolName}`}
            </p>
          )}
          {toolArgs && Object.keys(toolArgs).length > 0 && (
            <pre className="text-[9px] text-text-3 mt-1 bg-surface-2 rounded-lg px-2 py-1 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(toolArgs, null, 2)}
            </pre>
          )}
        </div>
      </div>
      {decided ? (
        <p className={cn("text-[10px] font-medium", decided === "approve" ? "text-emerald" : "text-rose")}>
          {decided === "approve" ? "✓ Approved" : "✗ Rejected"}
        </p>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => decide("approve")}
            disabled={deciding}
            data-testid="btn-approve"
            className="flex-1 py-1 rounded-lg bg-emerald/15 hover:bg-emerald/25 text-emerald text-[11px] font-medium transition-colors disabled:opacity-40"
          >
            Approve
          </button>
          <button
            onClick={() => decide("reject")}
            disabled={deciding}
            data-testid="btn-reject"
            className="flex-1 py-1 rounded-lg bg-rose/15 hover:bg-rose/25 text-rose text-[11px] font-medium transition-colors disabled:opacity-40"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

// ── Event row ─────────────────────────────────────────────────────────────────

interface EventRowProps {
  ev: AgentEvent;
  startedAt: number | null;
  onApprovalDecided: () => void;
}

function EventRow({ ev, startedAt, onApprovalDecided }: EventRowProps) {
  const ts = startedAt != null
    ? `+${((Date.now() - startedAt) / 1000).toFixed(2)}s`
    : null;
  void ts; // used in Trace tab only

  if (ev.event === "start") {
    return (
      <div className="flex items-center gap-2 py-1.5">
        <Zap className="w-3 h-3 text-violet shrink-0" />
        <span className="text-[11px] text-violet font-medium">Run started</span>
      </div>
    );
  }

  if (ev.event === "node_enter") {
    return (
      <div className="flex items-center gap-1.5 py-0.5 pl-3">
        <ArrowRight className="w-2.5 h-2.5 text-text-3 shrink-0" />
        <span className="text-[10px] text-text-3">→ {ev.node}</span>
      </div>
    );
  }

  if (ev.event === "node_exit") {
    return (
      <div className="flex items-center gap-1.5 py-0.5 pl-3">
        <ArrowRight className="w-2.5 h-2.5 text-text-3 shrink-0 rotate-180" />
        <span className="text-[10px] text-text-3 flex-1">← {ev.node}</span>
        {(ev.latency_ms != null || ev.cost_usd != null) && (
          <span className="text-[9px] font-mono text-text-3 shrink-0">
            {ev.latency_ms != null && `${ev.latency_ms}ms`}
            {ev.cost_usd != null && ` · $${ev.cost_usd.toFixed(5)}`}
            {ev.tokens_used != null && ` · ${ev.tokens_used} tok`}
          </span>
        )}
      </div>
    );
  }

  if (ev.event === "tool_call") {
    const argsStr = ev.tool_args
      ? Object.entries(ev.tool_args)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join(", ")
          .slice(0, 80)
      : "";
    return (
      <div className="flex items-start gap-2 py-1 pl-3">
        <Wrench className="w-3 h-3 text-amber shrink-0 mt-0.5" />
        <span className="text-[11px] text-text-1 font-mono">
          {ev.tool_name}
          {argsStr && <span className="text-text-3">({argsStr})</span>}
        </span>
      </div>
    );
  }

  if (ev.event === "tool_response") {
    const preview = (ev.tool_result ?? ev.content ?? "").slice(0, 120);
    return (
      <div className="flex items-start gap-2 py-1 pl-3">
        <CheckCircle2 className="w-3 h-3 text-emerald shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <span className="text-[10px] text-text-3 font-mono">{ev.tool_name}</span>
          {preview && (
            <p className="text-[10px] text-text-2 mt-0.5 truncate">{preview}</p>
          )}
        </div>
        {ev.latency_ms != null && (
          <span className="text-[9px] font-mono text-text-3 shrink-0">{ev.latency_ms}ms</span>
        )}
      </div>
    );
  }

  if (ev.event === "message") {
    const isAI = ev.type?.toLowerCase().includes("ai") || ev.type?.toLowerCase().includes("assistant");
    return (
      <div className="flex items-start gap-2 py-1.5 pl-3">
        <MessageSquare className={cn("w-3 h-3 shrink-0 mt-0.5", isAI ? "text-violet" : "text-text-3")} />
        <p className={cn("text-[11px] leading-relaxed whitespace-pre-wrap", isAI ? "text-text-1" : "text-text-2")}>
          {ev.content}
        </p>
      </div>
    );
  }

  if (ev.event === "llm_chunk") {
    return null; // tokens shown live via streaming state, not in history
  }

  if (ev.event === "approval_request") {
    return (
      <ApprovalCard
        approvalId={ev.approval_id ?? ""}
        toolName={ev.tool_name}
        toolArgs={ev.tool_args}
        message={ev.message}
        onDecided={onApprovalDecided}
      />
    );
  }

  if (ev.event === "complete") {
    const output = ev.output as Record<string, unknown> | null | undefined;
    const content = typeof output?.content === "string" ? output.content : null;
    const tokens  = typeof output?.usage === "object" && output.usage
      ? (output.usage as Record<string, number>).total_tokens
      : null;
    return (
      <div className="flex flex-col gap-1 py-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald shrink-0" />
          <span className="text-[11px] text-emerald font-semibold">Run complete</span>
          {tokens != null && (
            <span className="text-[9px] font-mono text-text-3">{tokens} tokens</span>
          )}
        </div>
        {content && (
          <div className="ml-5 p-2 rounded-lg bg-emerald/5 border border-emerald/20">
            <p className="text-[11px] text-text-1 leading-relaxed whitespace-pre-wrap">{content}</p>
          </div>
        )}
      </div>
    );
  }

  if (ev.event === "error") {
    return (
      <div className="flex items-start gap-2 py-1.5">
        <XCircle className="w-3.5 h-3.5 text-rose shrink-0 mt-0.5" />
        <span className="text-[11px] text-rose leading-relaxed">{ev.error ?? ev.message ?? "Unknown error"}</span>
      </div>
    );
  }

  return null;
}

// ── Trace row ─────────────────────────────────────────────────────────────────

const TRACE_EVENT_COLORS: Record<string, string> = {
  start:            "bg-violet/15 text-violet",
  node_enter:       "bg-surface-2 text-text-3",
  node_exit:        "bg-surface-2 text-text-3",
  tool_call:        "bg-amber/15 text-amber",
  tool_response:    "bg-emerald/15 text-emerald",
  message:          "bg-violet/10 text-violet",
  approval_request: "bg-amber/20 text-amber",
  state_snapshot:   "bg-surface-2 text-text-3",
  complete:         "bg-emerald/15 text-emerald",
  error:            "bg-rose/15 text-rose",
};

function TraceRow({ ev, index, startedAt }: { ev: AgentEvent; index: number; startedAt: number | null }) {
  const rel = startedAt != null ? `+${((Date.now() - startedAt) / 1000).toFixed(3)}s` : `#${index}`;
  const color = TRACE_EVENT_COLORS[ev.event] ?? "bg-surface-2 text-text-3";
  const detail =
    ev.event === "tool_call" ? ev.tool_name ?? ""
    : ev.event === "tool_response" ? (ev.tool_result ?? ev.content ?? "").slice(0, 60)
    : ev.event === "message" ? (ev.content ?? "").slice(0, 60)
    : ev.error ?? ev.content ?? "";

  return (
    <tr className="border-t border-border even:bg-surface-2/30">
      <td className="px-2 py-1 text-[9px] font-mono text-text-3 whitespace-nowrap">{rel}</td>
      <td className="px-2 py-1">
        <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide", color)}>
          {ev.event}
        </span>
      </td>
      <td className="px-2 py-1 text-[10px] text-text-3 font-mono">{ev.node ?? ""}</td>
      <td className="px-2 py-1 text-[10px] text-text-2 max-w-[200px] truncate">{detail}</td>
      <td className="px-2 py-1 text-[9px] font-mono text-text-3 whitespace-nowrap text-right">
        {ev.latency_ms != null ? `${ev.latency_ms}ms` : ""}
      </td>
    </tr>
  );
}

// ── AgentConsole ──────────────────────────────────────────────────────────────

type ConsoleTab = "console" | "trace" | "state";

interface AgentConsoleProps {
  activeAgentId: string | null;
  onRunComplete?: () => void;
  onActiveNodeChange?: (nodeId: string | null) => void;
  onRunStarted?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  triggerRun?: { message: string; seq: number } | null;
}

export function AgentConsole({ activeAgentId, onRunComplete, onActiveNodeChange, onRunStarted, isCollapsed, onToggleCollapse, triggerRun }: AgentConsoleProps) {
  const [activeTab, setActiveTab]     = useState<ConsoleTab>("console");
  const [events, setEvents]           = useState<AgentEvent[]>([]);
  const [isRunning, setIsRunning]     = useState(false);

  const lastRunSeqRef    = useRef<number | undefined>(undefined);
  const autoLoadedRef    = useRef<string | null>(null);
  const [startedAt, setStartedAt]     = useState<number | null>(null);
  const [latestState, setLatestState] = useState<Record<string, unknown> | null>(null);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [historyRunId, setHistoryRunId] = useState<string | null>(null);

  const { data: pastRuns = [] } = useSWR<Run[]>(
    activeAgentId ? ["runs", activeAgentId] : null,
    () => api.runs.list(activeAgentId!),
    { refreshInterval: isRunning ? 0 : 5000 },
  );

  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef  = useRef<AbortController | null>(null);

  // Clear console and reset auto-load flag when the active agent changes
  useEffect(() => {
    setEvents([]);
    setLatestState(null);
    setCurrentRunId(null);
    setHistoryRunId(null);
    autoLoadedRef.current = null;
  }, [activeAgentId]);

  // Auto-load the most recent completed run on first mount / agent switch
  useEffect(() => {
    if (!activeAgentId || autoLoadedRef.current === activeAgentId) return;
    if (isRunning || pastRuns.length === 0) return;
    const latest = pastRuns.find((r) => r.status === "completed");
    if (latest) {
      autoLoadedRef.current = activeAgentId;
      setHistoryRunId(latest.id);
    }
  }, [activeAgentId, pastRuns, isRunning]);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  // Update active graph node for the graph tab
  useEffect(() => {
    if (!onActiveNodeChange) return;
    const lastEnter = [...events].reverse().find((e) => e.event === "node_enter");
    const lastExit  = [...events].reverse().find((e) => e.event === "node_exit");
    if (lastEnter && lastEnter !== lastExit) {
      onActiveNodeChange(lastEnter.node ?? null);
    } else {
      onActiveNodeChange(null);
    }
  }, [events, onActiveNodeChange]);

  // Track latest state snapshot
  useEffect(() => {
    const snap = [...events].reverse().find((e) => e.event === "state_snapshot" && e.state);
    if (snap?.state) setLatestState(snap.state);
    const complete = [...events].reverse().find((e) => e.event === "complete" && e.output);
    if (complete?.output) setLatestState(complete.output);
  }, [events]);

  const stopRun = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsRunning(false);
    onActiveNodeChange?.(null);
  }, [onActiveNodeChange]);

  const startRun = useCallback(async (message: string) => {
    if (!activeAgentId || isRunning) return;
    setEvents([]);
    setLatestState(null);
    setIsRunning(true);
    setStartedAt(Date.now());
    setCurrentRunId(null);
    setHistoryRunId(null);
    onRunStarted?.();

    autoLoadedRef.current = activeAgentId; // prevent auto-load from overwriting live run
    const startEv: AgentEvent = { event: "start", run_id: "" };
    setEvents([startEv]);

    try {
      const run = await api.runs.create(activeAgentId, message.trim());
      setCurrentRunId(run.id);

      const ac = new AbortController();
      abortRef.current = ac;

      // Use fetch instead of EventSource so we can send X-Org-Id and auth headers
      (async () => {
        try {
          const orgId = typeof window !== "undefined" ? localStorage.getItem("lanara_org_id") : null;
          const headers: Record<string, string> = { Accept: "text/event-stream", "Cache-Control": "no-cache" };
          if (orgId) headers["X-Org-Id"] = orgId;

          const res = await fetch(`/api/runs/${run.id}/stream`, { headers, signal: ac.signal });
          if (!res.ok || !res.body) {
            throw new Error(`Stream ${res.status}: ${await res.text().catch(() => res.statusText)}`);
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";

          const SSE_SEP = /\r\n\r\n|\n\n/;

          const processChunk = (chunk: string) => {
            const dataLine = chunk.split(/\r?\n/).find((l) => l.startsWith("data: "));
            if (!dataLine) return false;
            const raw = dataLine.slice(6).trim();
            if (!raw) return false;
            try {
              const data: AgentEvent = JSON.parse(raw);
              setEvents((prev) => [...prev, data]);
              if (data.event === "complete" || data.event === "error") {
                setIsRunning(false);
                abortRef.current = null;
                onRunComplete?.();
                return true; // signal: done
              }
            } catch { /* ignore parse errors */ }
            return false;
          };

          while (true) {
            const { done, value } = await reader.read();
            if (value) buf += decoder.decode(value, { stream: !done });

            const parts = buf.split(SSE_SEP);
            buf = done ? "" : (parts.pop() ?? "");

            for (const chunk of parts) {
              if (processChunk(chunk)) return;
            }

            if (done) break;
          }
        } catch (err) {
          if ((err as Error).name === "AbortError") return;
          setEvents((prev) => [...prev, { event: "error", run_id: run.id, error: String(err) }]);
          setIsRunning(false);
          abortRef.current = null;
        }
      })();
    } catch (err) {
      setEvents((prev) => [...prev, { event: "error", run_id: "", error: String(err) }]);
      setIsRunning(false);
    }
  }, [activeAgentId, isRunning, onRunComplete]);

  // Fire a run when the parent requests one
  useEffect(() => {
    if (!triggerRun || triggerRun.seq === lastRunSeqRef.current) return;
    lastRunSeqRef.current = triggerRun.seq;
    startRun(triggerRun.message);
  }, [triggerRun, startRun]);

  // Load a past run's output in read-only mode
  useEffect(() => {
    if (!historyRunId || isRunning) return;
    api.runs.get(historyRunId).then((run) => {
      const out = run.output as Record<string, unknown> | null;
      if (!out) return;
      setEvents([
        { event: "start", run_id: run.id },
        { event: "complete", run_id: run.id, output: out },
      ]);
      setLatestState(out);
      setStartedAt(null);
    }).catch(() => { /* ignore */ });
  }, [historyRunId, isRunning]);

  // Cleanup on unmount
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const tabs: ConsoleTab[] = ["console", "trace", "state"];

  return (
    <div className="flex flex-col h-full bg-surface-0 border-t border-border">
      {/* ── Enterprise header bar ─────────────────────────────────────────── */}
      <div className="flex items-center border-b border-border shrink-0 h-10 px-3 gap-2 bg-surface-1/60">

        {/* Status dot + section label */}
        <div className="flex items-center gap-2 shrink-0">
          <div className={cn(
            "w-2 h-2 rounded-full shrink-0 transition-colors",
            isRunning ? "bg-violet animate-pulse" : events.length > 0 ? "bg-emerald" : "bg-border",
          )} />
          <span className="text-[10px] font-bold text-text-3 uppercase tracking-widest select-none">
            Console
          </span>
        </div>

        <div className="w-px h-4 bg-border/60 shrink-0" />

        {/* Tabs */}
        <div className="flex items-center gap-0.5">
          {tabs.map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium rounded transition-colors capitalize",
                activeTab === tab
                  ? "text-violet bg-violet/10"
                  : "text-text-3 hover:text-text-2 hover:bg-surface-2",
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Run ID */}
        {currentRunId && !historyRunId && (
          <span className="text-[9px] font-mono text-text-3 hidden sm:block opacity-60">
            {currentRunId.slice(0, 8)}
          </span>
        )}

        {/* History dropdown */}
        {!isRunning && pastRuns.length > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            <History className="w-3 h-3 text-text-3" />
            <select
              value={historyRunId ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setHistoryRunId(val || null);
                if (!val) { setEvents([]); setLatestState(null); }
              }}
              className="bg-surface-2 border border-border rounded px-1.5 py-0.5 text-[9px] text-text-2 outline-none max-w-[110px]"
            >
              <option value="">History</option>
              {pastRuns.filter((r) => r.status === "completed").slice(0, 10).map((r) => (
                <option key={r.id} value={r.id}>
                  {new Date(r.created_at).toLocaleTimeString()}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Stop */}
        {isRunning && (
          <button
            onClick={stopRun}
            className="flex items-center gap-1 px-2 py-1 rounded bg-rose/10 hover:bg-rose/20 text-rose text-[10px] font-semibold transition-colors shrink-0"
          >
            <Square className="w-2.5 h-2.5" />
            Stop
          </button>
        )}

        <div className="w-px h-4 bg-border/60 shrink-0" />

        {/* Collapse button */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title="Collapse console"
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border border-border bg-surface-2/50 text-text-3 hover:text-text-2 hover:bg-surface-2 transition-colors shrink-0"
          >
            <ChevronDown className="w-3 h-3" />
            <span className="hidden sm:inline">Collapse</span>
          </button>
        )}
      </div>

      {/* Console tab */}
      {activeTab === "console" && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Event list */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
            {events.length === 0 ? (
              <p className="text-[11px] text-text-3 italic py-4 text-center">
                {activeAgentId ? "Enter a message and click Run to start" : "Select an agent to use the console"}
              </p>
            ) : (
              events.map((ev, i) => (
                <EventRow
                  key={i}
                  ev={ev}
                  startedAt={startedAt}
                  onApprovalDecided={() => {
                    // Approval decided — run will resume, keep listening
                  }}
                />
              ))
            )}
            {isRunning && (
              <div className="flex items-center gap-2 py-1 pl-3">
                <Loader2 className="w-3 h-3 text-violet animate-spin" />
                <span className="text-[11px] text-text-3 animate-pulse">running…</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

        </div>
      )}

      {/* Trace tab */}
      {activeTab === "trace" && (
        <div className="flex-1 overflow-auto">
          {events.length === 0 ? (
            <p className="text-[11px] text-text-3 italic p-4 text-center">No events yet</p>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-2/50">
                  <th className="px-2 py-1.5 text-[9px] font-medium text-text-3 uppercase tracking-wide">Time</th>
                  <th className="px-2 py-1.5 text-[9px] font-medium text-text-3 uppercase tracking-wide">Event</th>
                  <th className="px-2 py-1.5 text-[9px] font-medium text-text-3 uppercase tracking-wide">Node</th>
                  <th className="px-2 py-1.5 text-[9px] font-medium text-text-3 uppercase tracking-wide">Detail</th>
                  <th className="px-2 py-1.5 text-[9px] font-medium text-text-3 uppercase tracking-wide text-right">Latency</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev, i) => (
                  <TraceRow key={i} ev={ev} index={i} startedAt={startedAt} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* State tab */}
      {activeTab === "state" && (
        <div className="flex-1 overflow-auto p-3">
          {latestState ? (
            <pre className="text-[11px] font-mono text-text-2 whitespace-pre-wrap leading-relaxed">
              {JSON.stringify(latestState, null, 2)}
            </pre>
          ) : (
            <p className="text-[11px] text-text-3 italic text-center py-4">
              State will appear after the first run completes
            </p>
          )}
        </div>
      )}
    </div>
  );
}
