"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, ShieldCheck, Zap, Mail, MessageSquare, ArrowUpRight,
  Newspaper, RefreshCw, ExternalLink, Bell, Clock, Building2,
  TrendingUp, ChevronRight,
} from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { api, type Run } from "@/lib/api";
import { cn } from "@/lib/cn";

// ── helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ── types ─────────────────────────────────────────────────────────────────────

interface HnHit {
  objectID: string;
  title: string;
  url: string | null;
  author: string;
  points: number;
  num_comments: number;
  created_at: string;
  story_text: string | null;
}

// ── stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; color: string;
}) {
  return (
    <div className="glass rounded-2xl p-5 flex items-start gap-4">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-text-3 uppercase tracking-widest">{label}</p>
        <p className="text-2xl font-bold text-text-1 mt-0.5 leading-none">{value}</p>
        {sub && <p className="text-xs text-text-3 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ── run status badge ──────────────────────────────────────────────────────────

function RunBadge({ status }: { status: Run["status"] }) {
  const map: Record<string, string> = {
    completed:          "bg-emerald/10 text-emerald border-emerald/20",
    running:            "bg-violet/10 text-violet border-violet/20",
    pending:            "bg-amber/10 text-amber border-amber/20",
    failed:             "bg-rose/10 text-rose border-rose/20",
    awaiting_approval:  "bg-cyan/10 text-cyan border-cyan/20",
  };
  return (
    <span className={cn("text-xs px-1.5 py-0.5 rounded-full border font-medium", map[status] ?? "bg-white/5 text-text-3 border-white/10")}>
      {status.replace("_", " ")}
    </span>
  );
}

// ── placeholder integration card ─────────────────────────────────────────────

function IntegrationCard({ icon: Icon, title, description, color }: {
  icon: React.ElementType; title: string; description: string; color: string;
}) {
  return (
    <div className="glass rounded-xl px-4 py-3 flex items-center gap-3">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-2">{title}</p>
        <p className="text-xs text-text-3">{description}</p>
      </div>
      <button className="shrink-0 text-xs text-violet hover:text-violet/80 transition-colors flex items-center gap-1">
        Connect <ChevronRight className="w-3 h-3" />
      </button>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  // ── agent runs ───────────────────────────────────────────────
  const { data: runs = [], isLoading: runsLoading } = useSWR(
    "runs-dashboard",
    () => api.runs.list(),
    { refreshInterval: 15000 },
  );

  // ── approvals ────────────────────────────────────────────────
  const { data: approvals = [] } = useSWR(
    "approvals-dashboard",
    () => api.approvals.list("pending"),
    { refreshInterval: 15000 },
  );

  // ── stats derived ────────────────────────────────────────────
  const activeRuns    = runs.filter((r) => r.status === "running").length;
  const todayRuns     = runs.filter((r) => {
    const d = new Date(r.created_at);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }).length;

  // ── news feed ─────────────────────────────────────────────────
  const NEWS_INTERVAL = 5 * 60 * 1000; // 5 min

  const { data: newsData, mutate: mutateNews } = useSWR(
    "/api/news",
    (url) => fetch(url).then((r) => r.json()),
    { refreshInterval: NEWS_INTERVAL, revalidateOnFocus: false },
  );

  const hits: HnHit[] = useMemo(() => newsData?.hits ?? [], [newsData]);

  // Track new articles since last view
  const seenIds   = useRef<Set<string>>(new Set());
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    if (!hits.length) return;
    if (seenIds.current.size === 0) {
      hits.forEach((h) => seenIds.current.add(h.objectID));
      return;
    }
    const unseen = hits.filter((h) => !seenIds.current.has(h.objectID));
    if (unseen.length > 0) setNewCount(unseen.length);
  }, [hits]);

  const handleShowNew = () => {
    hits.forEach((h) => seenIds.current.add(h.objectID));
    setNewCount(0);
  };

  return (
    <div className="flex h-screen bg-surface-0 overflow-hidden">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 overflow-y-auto">
        <div className="p-6 space-y-8 max-w-6xl w-full mx-auto">

          {/* Header */}
          <div>
            <h1 className="text-xl font-bold text-text-1">
              {greeting()}
            </h1>
            <p className="text-sm text-text-3 mt-0.5">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Zap}        label="Active runs"       value={activeRuns}        sub="right now"               color="bg-violet/10 text-violet" />
            <StatCard icon={Bot}        label="Runs today"        value={todayRuns}          sub="across all agents"       color="bg-cyan/10 text-cyan" />
            <StatCard icon={ShieldCheck} label="Pending approvals" value={approvals.length}  sub="awaiting your review"    color="bg-amber/10 text-amber" />
            <StatCard icon={TrendingUp} label="Total runs"        value={runs.length}        sub="all time"                color="bg-emerald/10 text-emerald" />
          </div>

          {/* Activity + integrations */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Recent AI activity */}
            <div className="lg:col-span-2 glass rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-text-3" />
                  <p className="text-sm font-semibold text-text-1">Recent AI Activity</p>
                </div>
                {runsLoading && <RefreshCw className="w-3.5 h-3.5 text-text-3 animate-spin" />}
              </div>

              {runs.length === 0 ? (
                <p className="text-sm text-text-3 text-center py-6">No runs yet. Deploy an agent to get started.</p>
              ) : (
                <div className="space-y-2">
                  {runs.slice(0, 8).map((run) => (
                    <div key={run.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                      <div className={cn("w-1.5 h-1.5 rounded-full shrink-0",
                        run.status === "completed"         ? "bg-emerald" :
                        run.status === "running"           ? "bg-violet animate-pulse" :
                        run.status === "failed"            ? "bg-rose" :
                        run.status === "awaiting_approval" ? "bg-cyan" : "bg-amber"
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-text-2 font-mono truncate">{run.id.slice(0, 16)}…</p>
                        {run.input?.message != null && (
                          <p className="text-xs text-text-3 truncate mt-0.5">
                            {String(run.input.message).slice(0, 60)}
                          </p>
                        )}
                      </div>
                      <RunBadge status={run.status} />
                      <span className="text-xs text-text-3 shrink-0">{timeAgo(run.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Integrations */}
            <div className="glass rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-text-3" />
                <p className="text-sm font-semibold text-text-1">Integrations</p>
              </div>
              <div className="space-y-2">
                <IntegrationCard icon={Mail}         title="Email"   description="Not connected" color="bg-violet/10 text-violet" />
                <IntegrationCard icon={MessageSquare} title="Slack"   description="Not connected" color="bg-cyan/10 text-cyan" />
                <IntegrationCard icon={Building2}    title="CRM"     description="Not connected" color="bg-amber/10 text-amber" />
              </div>
              <p className="text-xs text-text-3 pt-2 border-t border-border">
                Connect integrations so Lanara can surface email follow-ups, chat signals, and CRM updates automatically.
              </p>
            </div>
          </div>

          {/* Company news + live feed */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Company news */}
            <div className="glass rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-text-3" />
                <p className="text-sm font-semibold text-text-1">Company News</p>
              </div>
              <div className="space-y-3">
                {[
                  { title: "Q2 quota targets updated in the SPM dashboard", time: "2h ago", tag: "SPM" },
                  { title: "New commission plan effective May 1st", time: "1d ago", tag: "Comp" },
                  { title: "EMEA pipeline review scheduled for Friday", time: "2d ago", tag: "Pipeline" },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-text-2 leading-relaxed">{item.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="w-3 h-3 text-text-3" />
                        <span className="text-xs text-text-3">{item.time}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-text-3">{item.tag}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-text-3 border-t border-border pt-3">
                Company news will be populated from your connected knowledge sources.
              </p>
            </div>

            {/* Live news feed */}
            <div className="lg:col-span-2 glass rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Newspaper className="w-4 h-4 text-text-3" />
                  <p className="text-sm font-semibold text-text-1">Industry News</p>
                  <span className="text-xs text-text-3">via Hacker News</span>
                </div>
                <button
                  onClick={() => mutateNews()}
                  className="text-text-3 hover:text-text-2 transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* New articles banner */}
              <AnimatePresence>
                {newCount > 0 && (
                  <motion.button
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    onClick={handleShowNew}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-violet/10 border border-violet/20 text-violet text-xs font-medium hover:bg-violet/15 transition-colors"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    {newCount} new article{newCount !== 1 ? "s" : ""} — click to load
                  </motion.button>
                )}
              </AnimatePresence>

              {hits.length === 0 ? (
                <div className="flex items-center gap-2 text-text-3 text-sm py-6 justify-center">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Loading news…
                </div>
              ) : (
                <div className="space-y-0 divide-y divide-border overflow-y-auto max-h-96">
                  {hits.map((hit) => (
                    <div key={hit.objectID} className="py-3 flex items-start gap-3 group">
                      <div className="flex-1 min-w-0">
                        <a
                          href={hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-text-2 group-hover:text-text-1 transition-colors leading-snug line-clamp-2"
                        >
                          {hit.title}
                        </a>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-text-3">{hit.points} pts</span>
                          <span className="text-xs text-text-3">{hit.num_comments} comments</span>
                          <span className="text-xs text-text-3">{timeAgo(hit.created_at)}</span>
                        </div>
                      </div>
                      {hit.url && (
                        <a
                          href={hit.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-text-3 hover:text-text-2 opacity-0 group-hover:opacity-100 transition-all mt-0.5"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-text-3 border-t border-border pt-3">
                Refreshes every 5 minutes · Stories with 10+ points
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
