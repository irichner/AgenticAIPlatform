"use client";

import { useState } from "react";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import {
  DollarSign, TrendingUp, Target, Plus, Zap, ChevronDown, ChevronUp,
  Calculator, BarChart2, Briefcase, CheckCircle2,
} from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { api, type OpportunityStage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/contexts/auth";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, prefix = "$") {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${prefix}${(n / 1_000).toFixed(0)}K`;
  return `${prefix}${n.toFixed(0)}`;
}

function pct(n: number | null) {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CommissionPlan {
  id: string;
  name: string;
  plan_year: number;
  plan_type: string;
  is_active: boolean;
  definition: {
    tiers?: { from_pct: number; to_pct: number | null; rate: number }[];
    spif_rules?: { name: string; bonus_per_deal: number; min_arr: number }[];
    base_rate?: number;
    clawback_days?: number;
    draw_amount?: number;
  };
}

interface CommissionCalc {
  quota: number;
  attainment_amount: number;
  attainment_pct: number;
  base_commission: number;
  accelerator_bonus: number;
  spif_bonus: number;
  total_commission: number;
  tier_breakdown: { tier: string; arr_in_tier: number; rate: number; commission: number }[];
  deal_breakdown: { deal_name: string; arr: number; deal_type: string }[];
  notes: string[];
}

interface WhatIfResult {
  current: { attainment_pct: number; total_commission: number };
  with_hypothetical: { attainment_pct: number; total_commission: number; incremental_commission: number };
  hypothetical_deals: { name: string; arr: number }[];
}

// ── Attainment gauge ─────────────────────────────────────────────────────────

function AttainmentGauge({ pct: p, commission }: { pct: number; commission: number }) {
  const color = p >= 100 ? "text-emerald" : p >= 70 ? "text-amber" : "text-rose";
  const bgColor = p >= 100 ? "bg-emerald" : p >= 70 ? "bg-amber" : "bg-rose";
  const barWidth = Math.min(100, p);

  return (
    <div className="glass rounded-2xl p-6">
      <p className="text-xs text-text-3 uppercase tracking-widest mb-4">Current Period Attainment</p>
      <div className="flex items-end justify-between mb-3">
        <p className={cn("text-5xl font-black", color)}>{pct(p)}</p>
        <div className="text-right">
          <p className="text-xs text-text-3">Commission earned</p>
          <p className="text-2xl font-bold text-text-1">{fmt(commission)}</p>
        </div>
      </div>
      <div className="h-3 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${barWidth}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={cn("h-full rounded-full", bgColor)}
        />
      </div>
      {p >= 100 && (
        <div className="flex items-center gap-1.5 mt-3">
          <CheckCircle2 className="w-4 h-4 text-emerald" />
          <p className="text-sm text-emerald font-medium">Quota achieved — accelerators active!</p>
        </div>
      )}
    </div>
  );
}

// ── Tier breakdown ────────────────────────────────────────────────────────────

function TierBreakdown({ tiers }: { tiers: CommissionCalc["tier_breakdown"] }) {
  return (
    <div className="glass rounded-xl p-4 space-y-2">
      <p className="text-xs font-semibold text-text-2 uppercase tracking-wider mb-3">Tier Breakdown</p>
      {tiers.map((t, i) => (
        <div key={i} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-3 w-20">{t.tier}</span>
            <span className="text-xs text-text-3">{fmt(t.arr_in_tier)} @ {pct(t.rate * 100)}</span>
          </div>
          <span className="text-sm font-semibold text-text-1">{fmt(t.commission)}</span>
        </div>
      ))}
    </div>
  );
}

// ── What-If Copilot ───────────────────────────────────────────────────────────

function WhatIfCopilot({ planId, userId }: { planId: string; userId: string }) {
  const [deals, setDeals] = useState<{ name: string; arr: string; deal_type: string }[]>([
    { name: "", arr: "", deal_type: "new" },
  ]);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [loading, setLoading] = useState(false);

  const addDeal = () => setDeals([...deals, { name: "", arr: "", deal_type: "new" }]);
  const removeDeal = (i: number) => setDeals(deals.filter((_, idx) => idx !== i));
  const updateDeal = (i: number, k: string, v: string) =>
    setDeals(deals.map((d, idx) => (idx === i ? { ...d, [k]: v } : d)));

  const run = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const res = await fetch("/api/commission/what-if", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Org-Id": localStorage.getItem("lanara_org_id") || "",
        },
        body: JSON.stringify({
          user_id: userId,
          plan_id: planId,
          period_year: now.getFullYear(),
          period_month: now.getMonth() + 1,
          hypothetical_deals: deals
            .filter((d) => d.name && d.arr)
            .map((d, i) => ({
              id: `hypo_${i}`,
              name: d.name,
              arr: parseFloat(d.arr),
              deal_type: d.deal_type,
            })),
        }),
      });
      setResult(await res.json());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Calculator className="w-4 h-4 text-violet" />
        <p className="text-sm font-semibold text-text-1">Commission Copilot</p>
        <span className="text-xs text-text-3">— What if you closed these deals?</span>
      </div>

      <div className="space-y-2">
        {deals.map((deal, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              className="flex-1 bg-white/5 border border-border rounded-xl px-3 py-2 text-sm text-text-1 placeholder:text-text-3 focus:outline-none focus:border-violet/50"
              placeholder="Deal name"
              value={deal.name}
              onChange={(e) => updateDeal(i, "name", e.target.value)}
            />
            <input
              type="number"
              className="w-32 bg-white/5 border border-border rounded-xl px-3 py-2 text-sm text-text-1 placeholder:text-text-3 focus:outline-none focus:border-violet/50"
              placeholder="ARR ($)"
              value={deal.arr}
              onChange={(e) => updateDeal(i, "arr", e.target.value)}
            />
            <select
              className="bg-surface-1 border border-border rounded-xl px-2 py-2 text-sm text-text-1 focus:outline-none"
              value={deal.deal_type}
              onChange={(e) => updateDeal(i, "deal_type", e.target.value)}
            >
              <option value="new">New</option>
              <option value="expansion">Expansion</option>
              <option value="renewal">Renewal</option>
            </select>
            {deals.length > 1 && (
              <button onClick={() => removeDeal(i)} className="text-text-3 hover:text-rose transition-colors text-sm">✕</button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={addDeal}
          className="flex items-center gap-1.5 text-sm text-text-3 hover:text-violet transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add deal
        </button>
        <div className="flex-1" />
        <button
          onClick={run}
          disabled={loading || !deals.some((d) => d.name && d.arr)}
          className="px-4 py-2 text-sm bg-violet text-white rounded-xl hover:bg-violet/90 disabled:opacity-40 transition-colors flex items-center gap-2"
        >
          <Zap className="w-3.5 h-3.5" />
          {loading ? "Calculating…" : "Calculate"}
        </button>
      </div>

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 gap-3 pt-2 border-t border-border"
          >
            <div className="glass rounded-xl p-3 text-center">
              <p className="text-xs text-text-3 mb-1">Current</p>
              <p className="text-xl font-bold text-text-1">{fmt(result.current.total_commission)}</p>
              <p className="text-xs text-text-3">{pct(result.current.attainment_pct)} attainment</p>
            </div>
            <div className="glass rounded-xl p-3 text-center border border-emerald/30">
              <p className="text-xs text-text-3 mb-1">With these deals</p>
              <p className="text-xl font-bold text-emerald">{fmt(result.with_hypothetical.total_commission)}</p>
              <p className="text-xs text-emerald">+{fmt(result.with_hypothetical.incremental_commission)} incremental</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── New Plan Modal ────────────────────────────────────────────────────────────

function NewPlanModal({ onClose, onCreate }: { onClose: () => void; onCreate: () => void }) {
  const [name, setName] = useState("2026 AE Plan");
  const [year, setYear] = useState(2026);
  const [loading, setLoading] = useState(false);

  const create = async () => {
    setLoading(true);
    try {
      await fetch("/api/commission-plans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Org-Id": localStorage.getItem("lanara_org_id") || "",
        },
        body: JSON.stringify({
          name,
          plan_year: year,
          plan_type: "tiered",
          definition: {
            quota_type: "arr",
            currency: "USD",
            clawback_days: 90,
            tiers: [
              { from_pct: 0, to_pct: 100, rate: 0.10 },
              { from_pct: 100, to_pct: 125, rate: 0.12 },
              { from_pct: 125, to_pct: null, rate: 0.15 },
            ],
          },
        }),
      });
      onCreate();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="glass rounded-2xl p-6 w-full max-w-sm">
        <h2 className="text-base font-semibold text-text-1 mb-4">New Commission Plan</h2>
        <div className="space-y-3">
          <input className="w-full bg-white/5 border border-border rounded-xl px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-violet/50"
            placeholder="Plan name" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="number" className="w-full bg-white/5 border border-border rounded-xl px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-violet/50"
            placeholder="Year" value={year} onChange={(e) => setYear(parseInt(e.target.value))} />
          <p className="text-xs text-text-3">Creates with standard 3-tier plan (10% → 12% → 15%). Edit tiers after creation.</p>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-3 hover:text-text-1 transition-colors">Cancel</button>
          <button onClick={create} disabled={loading || !name} className="px-4 py-2 text-sm bg-violet text-white rounded-xl hover:bg-violet/90 disabled:opacity-40 transition-colors">
            {loading ? "Creating…" : "Create"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CommissionPage() {
  const { user } = useAuth();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [showNewPlan, setShowNewPlan] = useState(false);

  const { data: plans = [], mutate: mutatePlans } = useSWR<CommissionPlan[]>(
    "commission-plans",
    () => fetch("/api/commission-plans", { headers: { "X-Org-Id": localStorage.getItem("lanara_org_id") || "" } }).then((r) => r.json()),
  );

  const activePlan = plans.find((p) => p.id === selectedPlanId) ?? plans.find((p) => p.is_active) ?? plans[0];

  const now = new Date();
  const { data: calc } = useSWR<CommissionCalc>(
    activePlan && user ? `commission-calc-${activePlan.id}-${user.id}` : null,
    () =>
      fetch(
        `/api/commission/calculate?user_id=${user!.id}&plan_id=${activePlan!.id}&period_year=${now.getFullYear()}&period_month=${now.getMonth() + 1}`,
        { headers: { "X-Org-Id": localStorage.getItem("lanara_org_id") || "", Cookie: document.cookie } },
      ).then((r) => r.json()),
  );

  return (
    <div className="flex h-screen bg-surface-0 overflow-hidden">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 overflow-y-auto">
        <div className="p-6 space-y-6 max-w-5xl w-full mx-auto">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-text-1">Commission</h1>
              <p className="text-sm text-text-3 mt-0.5">Plans, quotas, attainment, and Commission Copilot</p>
            </div>
            <button
              onClick={() => setShowNewPlan(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-violet text-white rounded-xl hover:bg-violet/90 transition-colors"
            >
              <Plus className="w-4 h-4" /> New Plan
            </button>
          </div>

          {/* Plan selector */}
          {plans.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {plans.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlanId(p.id)}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-xl border transition-colors",
                    (activePlan?.id === p.id)
                      ? "bg-violet/10 border-violet/30 text-violet"
                      : "bg-white/5 border-border text-text-2 hover:border-violet/20",
                  )}
                >
                  {p.name} {p.is_active && <span className="text-xs text-emerald ml-1">active</span>}
                </button>
              ))}
            </div>
          )}

          {/* Attainment + Commission breakdown */}
          {calc && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <AttainmentGauge pct={calc.attainment_pct} commission={calc.total_commission} />

              <div className="glass rounded-2xl p-5 space-y-3">
                <p className="text-xs text-text-3 uppercase tracking-widest">Commission Summary</p>
                {[
                  { label: "Quota", value: fmt(calc.quota) },
                  { label: "Attainment", value: fmt(calc.attainment_amount) },
                  { label: "Base commission", value: fmt(calc.base_commission) },
                  ...(calc.accelerator_bonus > 0 ? [{ label: "Accelerator bonus", value: fmt(calc.accelerator_bonus) }] : []),
                  ...(calc.spif_bonus > 0 ? [{ label: "SPIF bonus", value: fmt(calc.spif_bonus), highlight: true }] : []),
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                    <span className="text-sm text-text-2">{row.label}</span>
                    <span className={cn("text-sm font-medium", (row as any).highlight ? "text-emerald" : "text-text-1")}>{row.value}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-sm font-bold text-text-1">Total</span>
                  <span className="text-xl font-black text-violet">{fmt(calc.total_commission)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Tier breakdown */}
          {calc && calc.tier_breakdown.length > 0 && (
            <TierBreakdown tiers={calc.tier_breakdown} />
          )}

          {/* Plan tiers (display) */}
          {activePlan && (
            <div className="glass rounded-2xl p-5 space-y-3">
              <p className="text-xs font-semibold text-text-2 uppercase tracking-wider">
                {activePlan.name} — Rate Schedule
              </p>
              {activePlan.definition.tiers ? (
                <div className="space-y-2">
                  {activePlan.definition.tiers.map((t, i) => (
                    <div key={i} className="flex items-center gap-4 py-2 border-b border-border last:border-0">
                      <span className="text-sm text-text-3 w-32">
                        {t.from_pct}% – {t.to_pct != null ? `${t.to_pct}%` : "∞"}
                      </span>
                      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-violet/60 rounded-full"
                          style={{ width: `${t.rate * 100 * 5}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-violet w-12 text-right">{pct(t.rate * 100)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-3">Base rate: {pct((activePlan.definition.base_rate ?? 0) * 100)}</p>
              )}
              {activePlan.definition.spif_rules && activePlan.definition.spif_rules.length > 0 && (
                <div className="pt-3 border-t border-border">
                  <p className="text-xs text-text-3 mb-2">SPIF Overlays</p>
                  {activePlan.definition.spif_rules.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-1">
                      <span className="text-text-2">{s.name}</span>
                      <span className="text-emerald font-semibold">+{fmt(s.bonus_per_deal)} / deal over {fmt(s.min_arr)} ARR</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Commission Copilot */}
          {activePlan && user && (
            <WhatIfCopilot planId={activePlan.id} userId={user.id} />
          )}

          {/* Empty state */}
          {plans.length === 0 && (
            <div className="text-center py-16 glass rounded-2xl">
              <DollarSign className="w-12 h-12 text-text-3 mx-auto mb-4" />
              <p className="text-base font-semibold text-text-1">No commission plans yet</p>
              <p className="text-sm text-text-3 mt-1 mb-4">Create your first plan to start tracking attainment</p>
              <button
                onClick={() => setShowNewPlan(true)}
                className="px-4 py-2 text-sm bg-violet text-white rounded-xl hover:bg-violet/90 transition-colors"
              >
                Create Plan
              </button>
            </div>
          )}
        </div>
      </div>

      {showNewPlan && (
        <NewPlanModal onClose={() => setShowNewPlan(false)} onCreate={() => mutatePlans()} />
      )}
    </div>
  );
}
