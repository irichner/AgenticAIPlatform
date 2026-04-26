"use client";

import { useState } from "react";
import useSWR from "swr";
import { ShieldCheck, CheckCircle2, XCircle, Clock, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/layout/Sidebar";
import { api, type ApprovalRequest } from "@/lib/api";
import { cn } from "@/lib/cn";

type FilterStatus = "pending" | "approved" | "rejected" | "";

function StatusPill({ status }: { status: ApprovalRequest["status"] }) {
  const cfg = {
    pending: { label: "Pending", cls: "bg-amber-400/10 text-amber-400 border-amber-400/20", icon: Clock },
    approved: { label: "Approved", cls: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20", icon: CheckCircle2 },
    rejected: { label: "Rejected", cls: "bg-rose-400/10 text-rose-400 border-rose-400/20", icon: XCircle },
  }[status];
  const Icon = cfg.icon;
  return (
    <span className={cn("flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border", cfg.cls)}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

function ApprovalCard({
  approval,
  onDecide,
}: {
  approval: ApprovalRequest;
  onDecide: (id: string, d: "approve" | "reject") => Promise<void>;
}) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [expanded, setExpanded] = useState(false);

  const decide = async (d: "approve" | "reject") => {
    setLoading(d);
    try {
      await onDecide(approval.id, d);
    } finally {
      setLoading(null);
    }
  };

  const hasArgs = approval.tool_args && Object.keys(approval.tool_args).length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="glass rounded-2xl p-4 space-y-3"
    >
      <div className="flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-violet shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-text-1 font-mono">
              {approval.tool_name ?? "unknown tool"}
            </span>
            <StatusPill status={approval.status} />
          </div>
          <p className="text-xs text-text-3 mt-0.5">
            Run <span className="font-mono">{approval.run_id.slice(0, 8)}…</span>
            {" · "}
            {new Date(approval.created_at).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Collapsible args */}
      {hasArgs && (
        <div>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="flex items-center gap-1 text-xs text-text-3 hover:text-text-2 transition-colors"
          >
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Tool arguments
          </button>
          <AnimatePresence>
            {expanded && (
              <motion.pre
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 bg-surface-2 rounded-xl p-3 text-xs text-text-2 font-mono overflow-x-auto"
              >
                {JSON.stringify(approval.tool_args, null, 2)}
              </motion.pre>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Decision buttons */}
      {approval.status === "pending" && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => decide("approve")}
            disabled={loading !== null}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-sm font-medium bg-emerald-400/15 hover:bg-emerald-400/30 text-emerald-400 border border-emerald-400/20 transition-colors disabled:opacity-40"
          >
            {loading === "approve" ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Approve
          </button>
          <button
            onClick={() => decide("reject")}
            disabled={loading !== null}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-sm font-medium bg-rose-400/15 hover:bg-rose-400/30 text-rose-400 border border-rose-400/20 transition-colors disabled:opacity-40"
          >
            {loading === "reject" ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
            Reject
          </button>
        </div>
      )}

      {approval.status !== "pending" && approval.decided_at && (
        <p className="text-xs text-text-3">
          {approval.status === "approved" ? "Approved" : "Rejected"} at{" "}
          {new Date(approval.decided_at).toLocaleString()}
        </p>
      )}
    </motion.div>
  );
}

export default function ApprovalsPage() {
  const [filter, setFilter] = useState<FilterStatus>("pending");

  const { data: approvals = [], mutate, isLoading } = useSWR(
    ["approvals", filter],
    ([, f]) => api.approvals.list(f || undefined),
    { refreshInterval: 6000 },
  );

  const handleDecide = async (approvalId: string, decision: "approve" | "reject") => {
    await api.approvals.decide(approvalId, decision);
    mutate();
  };

  const tabs: { label: string; value: FilterStatus }[] = [
    { label: "Pending", value: "pending" },
    { label: "Approved", value: "approved" },
    { label: "Rejected", value: "rejected" },
    { label: "All", value: "" },
  ];

  const pendingCount = approvals.filter((a) => a.status === "pending").length;

  return (
    <div className="flex h-screen bg-surface-0 overflow-hidden">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6">
          {(
            <div className="max-w-3xl space-y-5">

              {/* Header */}
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-violet" />
                <h2 className="text-base font-semibold text-text-1">Human-in-the-Loop Queue</h2>
                {pendingCount > 0 && filter === "pending" && (
                  <span className="bg-amber-400/20 text-amber-400 text-xs font-semibold px-2 py-0.5 rounded-full border border-amber-400/20">
                    {pendingCount} pending
                  </span>
                )}
                <button onClick={() => mutate()} className="ml-auto text-text-3 hover:text-text-2 transition-colors">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Filter tabs */}
              <div className="flex gap-1 bg-surface-2 rounded-xl p-1 w-fit">
                {tabs.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => setFilter(tab.value)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      filter === tab.value
                        ? "bg-violet/20 text-violet"
                        : "text-text-3 hover:text-text-2",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* List */}
              {isLoading ? (
                <div className="flex items-center gap-2 text-text-3 text-sm">
                  <RefreshCw className="w-4 h-4 animate-spin" />Loading…
                </div>
              ) : approvals.length === 0 ? (
                <EmptyState
                  message={
                    filter === "pending"
                      ? "No pending approvals. Agents will pause here when they need sign-off on a high-stakes action."
                      : "No approvals found."
                  }
                />
              ) : (
                <div className="space-y-3">
                  <AnimatePresence mode="popLayout">
                    {approvals.map((approval) => (
                      <ApprovalCard
                        key={approval.id}
                        approval={approval}
                        onDecide={handleDecide}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center h-40 glass rounded-2xl text-center px-6"
    >
      <p className="text-text-3 text-sm">{message}</p>
    </motion.div>
  );
}
