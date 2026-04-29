"use client";

import { useState } from "react";
import useSWR from "swr";
import { motion } from "framer-motion";
import {
  Brain, TrendingUp, AlertTriangle, Target, Zap,
  ChevronRight, RefreshCw, Star, CheckCircle2,
} from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/cn";

interface CoachingInsights {
  summary: string;
  strengths: string[];
  focus_areas: string[];
  deal_coaching: { deal: string; action: string }[];
  weekly_goal: string;
  motivation_score: number;
  generated_at: string;
  source: "cache" | "generated";
  context: {
    period: string;
    quota: number;
    won_arr_mtd: number;
    attainment_pct: number;
    open_deals: { name: string; arr: number; health_score: number; close_date: string | null }[];
    activity_count_30d: number;
    risk_signals: { deal_id: string; type: string; severity: string; title: string }[];
  };
}

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then((r) => {
    if (!r.ok) throw new Error("Not found");
    return r.json();
  });

function formatArr(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

function MotivationMeter({ score }: { score: number }) {
  const pct = (score / 10) * 100;
  const color = score >= 7 ? "from-emerald-500 to-emerald-400"
    : score >= 4 ? "from-amber-500 to-amber-400"
    : "from-rose-500 to-rose-400";

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-bold text-text-1 w-6 text-right">{score}</span>
    </div>
  );
}

function AttainmentRing({ pct }: { pct: number }) {
  const clamp = Math.min(pct, 200);
  const color = pct >= 100 ? "text-emerald-400" : pct >= 70 ? "text-amber-400" : "text-rose-400";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn("text-2xl font-black tabular-nums", color)}>
        {pct.toFixed(0)}%
      </div>
      <p className="text-[10px] text-text-3 uppercase tracking-widest">Attainment</p>
    </div>
  );
}

export default function CoachingPage() {
  const { user } = useAuth();
  const userId = user?.id;

  const { data, isLoading, error, mutate } = useSWR<CoachingInsights>(
    userId ? `/api/coaching/${userId}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    if (!userId) return;
    setRefreshing(true);
    try {
      await fetch(`/api/coaching/${userId}/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      // Refetch after 2s to give background task time to complete
      setTimeout(() => { mutate(); setRefreshing(false); }, 2000);
    } catch {
      setRefreshing(false);
    }
  }

  const ctx = data?.context;

  return (
    <div className="flex h-screen bg-surface-0 overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-y-auto">
        <div className="p-6 space-y-6 max-w-4xl w-full mx-auto">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet/20 to-cyan/20 flex items-center justify-center">
                <Brain className="w-5 h-5 text-violet" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-text-1">AI Coach</h1>
                <p className="text-xs text-text-3">
                  {data ? `${ctx?.period} · Last updated ${new Date(data.generated_at).toLocaleTimeString()}` : "Personalized rep coaching"}
                </p>
              </div>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing || isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-2 hover:text-text-1 hover:bg-surface-2 border border-border transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {isLoading && (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-32 rounded-2xl bg-surface-1 animate-pulse" />
              ))}
            </div>
          )}

          {error && (
            <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 p-6 text-center">
              <p className="text-sm text-rose-400">No coaching data available. Make sure you have quota + deals set up.</p>
            </div>
          )}

          {data && ctx && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-5"
            >
              {/* Summary + Stats row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Summary */}
                <div className="md:col-span-2 glass rounded-2xl border border-border p-5">
                  <p className="text-xs font-medium text-text-3 uppercase tracking-widest mb-3">Performance Summary</p>
                  <p className="text-sm text-text-1 leading-relaxed">{data.summary}</p>
                </div>

                {/* KPIs */}
                <div className="glass rounded-2xl border border-border p-5 flex flex-col gap-4">
                  <AttainmentRing pct={ctx.attainment_pct} />
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-text-3">Closed MTD</span>
                      <span className="text-text-1 font-medium">{formatArr(ctx.won_arr_mtd)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-text-3">Quota</span>
                      <span className="text-text-1 font-medium">{formatArr(ctx.quota)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-text-3">Activities (30d)</span>
                      <span className="text-text-1 font-medium">{ctx.activity_count_30d}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-3 mb-1.5">Momentum</p>
                    <MotivationMeter score={data.motivation_score} />
                  </div>
                </div>
              </div>

              {/* Weekly goal */}
              <div className="glass rounded-2xl border border-violet/20 bg-violet/5 p-5">
                <div className="flex items-start gap-3">
                  <Target className="w-4 h-4 text-violet shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-violet uppercase tracking-widest mb-1">Weekly Goal</p>
                    <p className="text-sm font-medium text-text-1">{data.weekly_goal}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Strengths */}
                <div className="glass rounded-2xl border border-border p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Star className="w-4 h-4 text-amber-400" />
                    <p className="text-xs font-medium text-text-2 uppercase tracking-widest">Strengths</p>
                  </div>
                  <ul className="space-y-2">
                    {data.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-text-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        {s}
                      </li>
                    ))}
                    {data.strengths.length === 0 && (
                      <p className="text-xs text-text-3 italic">Close more deals to unlock strength analysis</p>
                    )}
                  </ul>
                </div>

                {/* Focus areas */}
                <div className="glass rounded-2xl border border-border p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4 text-cyan" />
                    <p className="text-xs font-medium text-text-2 uppercase tracking-widest">Focus Areas</p>
                  </div>
                  <ul className="space-y-2">
                    {data.focus_areas.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-text-1">
                        <ChevronRight className="w-3.5 h-3.5 text-cyan shrink-0 mt-0.5" />
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Deal coaching */}
              {data.deal_coaching.length > 0 && (
                <div className="glass rounded-2xl border border-border p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Zap className="w-4 h-4 text-violet" />
                    <p className="text-xs font-medium text-text-2 uppercase tracking-widest">Deal Coaching</p>
                  </div>
                  <div className="space-y-3">
                    {data.deal_coaching.map((dc, i) => (
                      <div key={i} className="flex gap-3 p-3 rounded-xl bg-surface-2">
                        <div className="w-1.5 rounded-full bg-gradient-to-b from-violet to-cyan shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-text-2 mb-0.5">{dc.deal}</p>
                          <p className="text-sm text-text-1">{dc.action}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Risk signals */}
              {ctx.risk_signals.length > 0 && (
                <div className="glass rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <p className="text-xs font-medium text-amber-400 uppercase tracking-widest">Active Risk Signals</p>
                  </div>
                  <div className="space-y-2">
                    {ctx.risk_signals.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
                          s.severity === "critical" ? "bg-rose-500/20 text-rose-400" : "bg-amber-500/20 text-amber-400",
                        )}>
                          {s.severity}
                        </span>
                        <span className="text-text-1">{s.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
