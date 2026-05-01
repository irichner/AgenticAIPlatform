"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2, Users, TrendingUp, Plus, Search,
  Mail, Phone, Globe, Target, Activity, MapPin, Briefcase,
  ChevronUp, ChevronDown, ChevronRight, X, CheckCircle2, AlertCircle, Clock, Copy, Check, Pencil,
} from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { api, type Account, type Activity as ActivityType, type Contact, type Opportunity, type OpportunityStage } from "@/lib/api";
import { cn } from "@/lib/cn";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, prefix = "") {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${prefix}${(n / 1_000).toFixed(0)}K`;
  return `${prefix}${n}`;
}

function healthColor(score: number | null) {
  if (score == null) return "text-text-3";
  if (score >= 70) return "text-emerald";
  if (score >= 40) return "text-amber";
  return "text-rose";
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type SortDir = "asc" | "desc";
type Tab = "pipeline" | "contacts" | "activities";

// Tailwind grid matching the 7-column company header
const CO_GRID = "grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr]";

// ── Sort column header ────────────────────────────────────────────────────────

function SortTh({ label, sortKey, sort, onSort, className }: {
  label: string;
  sortKey: string;
  sort: { key: string; dir: SortDir };
  onSort: (k: string) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={cn(
        "flex items-center gap-1 text-xs font-semibold text-text-3 uppercase tracking-wider hover:text-text-1 select-none whitespace-nowrap",
        className,
      )}
    >
      {label}
      {active
        ? sort.dir === "asc"
          ? <ChevronUp className="w-3 h-3 text-violet" />
          : <ChevronDown className="w-3 h-3 text-violet" />
        : <ChevronUp className="w-3 h-3 opacity-20" />}
    </button>
  );
}

const selectCls = "bg-white/5 border border-border rounded-xl px-3 py-2 text-xs text-text-2 focus:outline-none focus:border-violet/50 cursor-pointer";

function filterChip(active: boolean) {
  return cn(
    "px-3 py-1.5 text-xs rounded-xl border transition-colors cursor-pointer select-none",
    active
      ? "bg-violet/20 border-violet/40 text-violet"
      : "bg-white/5 border-border text-text-3 hover:text-text-2 hover:border-white/20",
  );
}

// ── Pipeline Kanban ───────────────────────────────────────────────────────────

function PipelineKanban({
  stages, opportunities, onMoveStage,
}: {
  stages: OpportunityStage[];
  opportunities: Opportunity[];
  onMoveStage: (oppId: string, stageId: string) => void;
}) {
  const open = opportunities.filter((o) => !o.won_at && !o.lost_at);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {stages.filter((s) => !s.is_won && !s.is_lost).map((stage) => {
        const cards = open.filter((o) => o.stage_id === stage.id);
        const totalArr = cards.reduce((s, o) => s + (o.arr ?? 0), 0);
        return (
          <div key={stage.id} className="flex-none w-64">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-semibold text-text-2 uppercase tracking-wider">{stage.name}</p>
                <p className="text-xs text-text-3 mt-0.5">{cards.length} deals · {fmt(totalArr, "$")}</p>
              </div>
              <span className="text-xs text-text-3 bg-white/5 border border-border rounded-full px-2 py-0.5">
                {stage.probability}%
              </span>
            </div>
            <div className="space-y-2">
              {cards.map((opp) => (
                <motion.div
                  key={opp.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass rounded-xl p-3 cursor-pointer hover:border-violet/30 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-text-1 leading-snug">{opp.name}</p>
                    {opp.health_score != null && (
                      <span className={cn("text-xs font-bold shrink-0", healthColor(opp.health_score))}>
                        {opp.health_score}
                      </span>
                    )}
                  </div>
                  <p className="text-lg font-bold text-text-1 mt-1">{fmt(opp.arr, "$")}</p>
                  {opp.close_date && (
                    <div className="flex items-center gap-1 mt-2">
                      <Clock className="w-3 h-3 text-text-3" />
                      <span className="text-xs text-text-3">
                        {new Date(opp.close_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  )}
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {stages.filter((s) => s.id !== stage.id && !s.is_lost).map((s) => (
                      <button
                        key={s.id}
                        onClick={() => onMoveStage(opp.id, s.id)}
                        className="text-xs text-text-3 hover:text-violet transition-colors px-1.5 py-0.5 rounded bg-white/5 border border-border hover:border-violet/30"
                      >
                        → {s.is_won ? "Won" : s.name}
                      </button>
                    ))}
                  </div>
                </motion.div>
              ))}
              {cards.length === 0 && (
                <div className="text-center py-6 text-xs text-text-3 border border-dashed border-border rounded-xl">
                  No deals
                </div>
              )}
            </div>
          </div>
        );
      })}

      {[
        { label: "Won",  filter: (o: Opportunity) => !!o.won_at,  color: "text-emerald", icon: CheckCircle2 },
        { label: "Lost", filter: (o: Opportunity) => !!o.lost_at, color: "text-rose",    icon: AlertCircle },
      ].map(({ label, filter, color, icon: Icon }) => {
        const cards = opportunities.filter(filter);
        return (
          <div key={label} className="flex-none w-48">
            <div className="flex items-center gap-1.5 mb-3">
              <Icon className={cn("w-3.5 h-3.5", color)} />
              <p className="text-xs font-semibold text-text-2 uppercase tracking-wider">{label}</p>
              <span className="text-xs text-text-3">({cards.length})</span>
            </div>
            <div className="space-y-1">
              {cards.slice(0, 5).map((opp) => (
                <div key={opp.id} className="glass rounded-lg p-2">
                  <p className="text-xs text-text-2 truncate">{opp.name}</p>
                  <p className="text-xs text-text-3">{fmt(opp.arr, "$")}</p>
                </div>
              ))}
              {cards.length > 5 && <p className="text-xs text-text-3 text-center">+{cards.length - 5} more</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── New Opportunity Modal ─────────────────────────────────────────────────────

function NewOppModal({
  stages, accounts, onClose, onCreate,
}: {
  stages: OpportunityStage[];
  accounts: Account[];
  onClose: () => void;
  onCreate: (data: Partial<Opportunity>) => void;
}) {
  const [form, setForm] = useState<Partial<Opportunity>>({ deal_type: "new" });
  const set = (k: keyof Opportunity, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass rounded-2xl p-6 w-full max-w-md shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-text-1">New Opportunity</h2>
          <button onClick={onClose} className="text-text-3 hover:text-text-1 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-3">
          <input
            className="w-full bg-white/5 border border-border rounded-xl px-3 py-2 text-sm text-text-1 placeholder:text-text-3 focus:outline-none focus:border-violet/50"
            placeholder="Deal name *"
            value={form.name ?? ""}
            onChange={(e) => set("name", e.target.value)}
          />
          <select
            className="w-full bg-surface-1 border border-border rounded-xl px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-violet/50"
            value={form.account_id ?? ""}
            onChange={(e) => set("account_id", e.target.value || undefined)}
          >
            <option value="">Select company…</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select
            className="w-full bg-surface-1 border border-border rounded-xl px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-violet/50"
            value={form.stage_id ?? ""}
            onChange={(e) => set("stage_id", e.target.value || undefined)}
          >
            <option value="">Select stage…</option>
            {stages.filter((s) => !s.is_won && !s.is_lost).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              className="bg-white/5 border border-border rounded-xl px-3 py-2 text-sm text-text-1 placeholder:text-text-3 focus:outline-none focus:border-violet/50"
              placeholder="ARR ($)"
              value={form.arr ?? ""}
              onChange={(e) => set("arr", e.target.value ? parseFloat(e.target.value) : undefined)}
            />
            <input
              type="date"
              className="bg-surface-1 border border-border rounded-xl px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-violet/50"
              value={form.close_date ?? ""}
              onChange={(e) => set("close_date", e.target.value || undefined)}
            />
          </div>
          <select
            className="w-full bg-surface-1 border border-border rounded-xl px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-violet/50"
            value={form.deal_type ?? "new"}
            onChange={(e) => set("deal_type", e.target.value)}
          >
            <option value="new">New Business</option>
            <option value="renewal">Renewal</option>
            <option value="expansion">Expansion</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-3 hover:text-text-1 transition-colors">
            Cancel
          </button>
          <button
            disabled={!form.name}
            onClick={() => { onCreate(form); onClose(); }}
            className="px-4 py-2 text-sm bg-violet text-white rounded-xl hover:bg-violet/90 disabled:opacity-40 transition-colors"
          >
            Create
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Contact detail panel ──────────────────────────────────────────────────────

function ContactPanel({ contact, account, activities, onClose, onContactUpdate }: {
  contact: Contact;
  account: Account | undefined;
  activities: ActivityType[];
  onClose: () => void;
  onContactUpdate?: (updated: Contact) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [editingLinkedin, setEditingLinkedin] = useState(false);
  const [linkedinDraft, setLinkedinDraft] = useState(contact.linkedin_url ?? "");
  const [savingLinkedin, setSavingLinkedin] = useState(false);

  async function saveLinkedin() {
    setSavingLinkedin(true);
    try {
      const updated = await api.crm.contacts.update(contact.id, { linkedin_url: linkedinDraft || null });
      onContactUpdate?.(updated);
      setEditingLinkedin(false);
    } finally {
      setSavingLinkedin(false);
    }
  }

  const copyEmail = () => {
    if (!contact.email) return;
    navigator.clipboard.writeText(contact.email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const typeIcon: Record<string, React.ElementType> = {
    email: Mail, call: Phone, meeting: Users, note: Activity, task: Target,
  };
  const typeColor: Record<string, string> = {
    email:   "text-violet bg-violet/10",
    call:    "text-cyan bg-cyan/10",
    meeting: "text-amber bg-amber/10",
    note:    "text-emerald bg-emerald/10",
    task:    "text-rose bg-rose/10",
  };

  const initials = `${(contact.first_name[0] ?? "").toUpperCase()}${(contact.last_name[0] ?? "").toUpperCase()}`;
  const recentActs = activities.slice(0, 6);

  const metaRow = (label: string, value: string | null | undefined, icon?: React.ElementType) => {
    if (!value) return null;
    const Icon = icon;
    return (
      <div className="flex items-start gap-2">
        {Icon && <Icon className="w-3.5 h-3.5 text-text-3 mt-0.5 shrink-0" />}
        <div className="min-w-0">
          <p className="text-xs text-text-3">{label}</p>
          <p className="text-xs font-medium text-text-1 truncate">{value}</p>
        </div>
      </div>
    );
  };

  return (
    <motion.div
      key="ct-panel"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.18 }}
      className="w-72 shrink-0 glass rounded-2xl overflow-hidden sticky top-6 self-start"
    >
      {/* header */}
      <div className="p-4 border-b border-border/50 flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-cyan/10 flex items-center justify-center text-sm font-bold text-cyan shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-text-1">{contact.first_name} {contact.last_name}</p>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            {contact.title && <p className="text-xs text-text-3">{contact.title}</p>}
            {contact.seniority && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/5 border border-border text-text-3">
                {contact.seniority}
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="text-text-3 hover:text-text-1 transition-colors mt-0.5 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-5 overflow-y-auto max-h-[calc(100vh-96px)]">
        {/* quick actions */}
        <div className="flex flex-wrap gap-1.5">
          {contact.email && (
            <button
              onClick={copyEmail}
              className={cn(
                "text-xs px-2 py-1 rounded-lg border flex items-center gap-1.5 transition-colors",
                copied
                  ? "bg-emerald/10 border-emerald/30 text-emerald"
                  : "bg-violet/10 border-violet/30 text-violet hover:bg-violet/20",
              )}
            >
              {copied ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy Email</>}
            </button>
          )}
          {contact.phone && (
            <a href={`tel:${contact.phone}`} className="text-xs px-2 py-1 rounded-lg bg-cyan/10 border border-cyan/30 text-cyan flex items-center gap-1.5 hover:bg-cyan/20 transition-colors">
              <Phone className="w-3 h-3" /> Call
            </a>
          )}
          {editingLinkedin ? (
            <div className="flex items-center gap-1 w-full mt-1">
              <input
                autoFocus
                value={linkedinDraft}
                onChange={(e) => setLinkedinDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveLinkedin(); if (e.key === "Escape") setEditingLinkedin(false); }}
                placeholder="https://linkedin.com/in/..."
                className="flex-1 text-xs px-2 py-1 rounded-lg border border-border bg-surface-0 text-text-1 placeholder-text-3 outline-none focus:border-violet/50"
              />
              <button onClick={saveLinkedin} disabled={savingLinkedin} className="text-xs px-2 py-1 rounded-lg bg-violet/10 text-violet hover:bg-violet/20 transition-colors disabled:opacity-50">
                {savingLinkedin ? "…" : "Save"}
              </button>
              <button onClick={() => setEditingLinkedin(false)} className="text-xs px-2 py-1 rounded-lg text-text-3 hover:text-text-1 transition-colors">
                Cancel
              </button>
            </div>
          ) : contact.linkedin_url ? (
            <div className="flex items-center gap-1">
              <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-1 rounded-lg bg-white/5 border border-border text-text-3 flex items-center gap-1.5 hover:border-violet/30 hover:text-text-2 transition-colors">
                <Globe className="w-3 h-3" /> LinkedIn
              </a>
              <button onClick={() => { setLinkedinDraft(contact.linkedin_url ?? ""); setEditingLinkedin(true); }} className="text-xs text-text-3 hover:text-text-1 transition-colors px-1">
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button onClick={() => { setLinkedinDraft(""); setEditingLinkedin(true); }} className="text-xs px-2 py-1 rounded-lg bg-white/5 border border-dashed border-border text-text-3 flex items-center gap-1.5 hover:border-violet/30 hover:text-text-2 transition-colors">
              <Globe className="w-3 h-3" /> Add LinkedIn
            </button>
          )}
        </div>

        {/* company */}
        {account && (
          <div>
            <p className="text-xs font-semibold text-text-3 uppercase tracking-wider mb-1.5">Company</p>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-violet/10 flex items-center justify-center shrink-0">
                <Building2 className="w-3 h-3 text-violet" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-text-1">{account.name}</p>
                {account.industry && <p className="text-xs text-text-3">{account.industry}</p>}
              </div>
            </div>
          </div>
        )}

        {/* enrichment fields */}
        {(contact.department || contact.location || contact.buying_role || contact.lead_source) && (
          <div>
            <p className="text-xs font-semibold text-text-3 uppercase tracking-wider mb-2">Details</p>
            <div className="space-y-2">
              {metaRow("Department", contact.department, Briefcase)}
              {metaRow("Location", contact.location, MapPin)}
              {contact.buying_role && (
                <div className="flex items-start gap-2">
                  <Target className="w-3.5 h-3.5 text-text-3 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-text-3">Buying Role</p>
                    <span className={cn("text-xs px-1.5 py-0.5 rounded-full border font-medium",
                      contact.buying_role === "Decision Maker"   ? "bg-violet/10 border-violet/30 text-violet" :
                      contact.buying_role === "Champion"         ? "bg-emerald/10 border-emerald/30 text-emerald" :
                      contact.buying_role === "Economic Buyer"   ? "bg-amber/10 border-amber/30 text-amber" :
                      contact.buying_role === "Blocker"          ? "bg-rose/10 border-rose/30 text-rose" :
                      "bg-white/5 border-border text-text-2"
                    )}>
                      {contact.buying_role}
                    </span>
                  </div>
                </div>
              )}
              {metaRow("Lead Source", contact.lead_source)}
            </div>
          </div>
        )}

        {/* notes */}
        {contact.notes && (
          <div>
            <p className="text-xs font-semibold text-text-3 uppercase tracking-wider mb-1.5">Notes</p>
            <p className="text-xs text-text-2 leading-relaxed">{contact.notes}</p>
          </div>
        )}

        {/* recent activity */}
        <div>
          <p className="text-xs font-semibold text-text-3 uppercase tracking-wider mb-2">Recent Activity</p>
          {recentActs.length > 0 ? (
            <div className="space-y-2.5">
              {recentActs.map((a) => {
                const Icon  = typeIcon[a.type]  ?? Activity;
                const color = typeColor[a.type] ?? "text-text-3 bg-white/5";
                return (
                  <div key={a.id} className="flex items-start gap-2">
                    <div className={cn("w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5", color)}>
                      <Icon className="w-3 h-3" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-text-1 truncate">{a.subject ?? a.type}</p>
                      <p className="text-xs text-text-3">{relativeTime(a.occurred_at)}</p>
                      {a.ai_summary && <p className="text-xs text-text-2 mt-0.5 line-clamp-2">{a.ai_summary}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-text-3">No activity recorded yet.</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Contacts Tab (company-grouped expandable) ─────────────────────────────────

function ContactsTab({ accounts, contacts, opportunities }: {
  accounts: Account[];
  contacts: Contact[];
  opportunities: Opportunity[];
}) {
  const { data: activities = [] } = useSWR("crm-activities", () => api.crm.activities.list());

  // filters
  const [search, setSearch]               = useState("");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [healthFilter, setHealthFilter]   = useState("all");
  const [seniorityFilter, setSeniorityFilter] = useState("all");
  const [buyingRoleFilter, setBuyingRoleFilter] = useState("all");
  const [dealsOnly, setDealsOnly]         = useState(false);

  // sort (company rows only)
  const [sort, setSort] = useState<{ key: string; dir: SortDir }>({ key: "name", dir: "asc" });

  // expand / select
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Contact | null>(null);

  // ── derived maps ──

  const contactsBy = useMemo(() => {
    const m = new Map<string, Contact[]>();
    for (const c of contacts) {
      if (!c.account_id) continue;
      const list = m.get(c.account_id) ?? [];
      list.push(c);
      m.set(c.account_id, list);
    }
    return m;
  }, [contacts]);

  const openOppBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of opportunities)
      if (!o.won_at && !o.lost_at && o.account_id)
        m.set(o.account_id, (m.get(o.account_id) ?? 0) + 1);
    return m;
  }, [opportunities]);

  const openARRBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of opportunities)
      if (!o.won_at && !o.lost_at && o.account_id)
        m.set(o.account_id, (m.get(o.account_id) ?? 0) + (o.arr ?? 0));
    return m;
  }, [opportunities]);

  const accountMap = useMemo(() => {
    const m = new Map<string, Account>();
    for (const a of accounts) m.set(a.id, a);
    return m;
  }, [accounts]);

  const contactActivity = useMemo(() => {
    const map = new Map<string, ActivityType[]>();
    for (const a of activities) {
      if (!a.contact_id) continue;
      const list = map.get(a.contact_id) ?? [];
      list.push(a);
      map.set(a.contact_id, list);
    }
    for (const [id, list] of map)
      map.set(id, list.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()));
    return map;
  }, [activities]);

  // ── filter options ──

  const industries = useMemo(
    () => [...new Set(accounts.map((a) => a.industry).filter(Boolean) as string[])].sort(),
    [accounts],
  );
  const seniorities = useMemo(
    () => [...new Set(contacts.map((c) => c.seniority).filter(Boolean) as string[])].sort(),
    [contacts],
  );
  const buyingRoles = useMemo(
    () => [...new Set(contacts.map((c) => c.buying_role).filter(Boolean) as string[])].sort(),
    [contacts],
  );

  // ── contact-level filter ──

  const contactPassesFilter = useMemo(() => {
    const q = search.toLowerCase();
    return (c: Contact): boolean => {
      const name = `${c.first_name} ${c.last_name}`.toLowerCase();
      if (q && !name.includes(q) && !(c.email ?? "").toLowerCase().includes(q)) return false;
      if (seniorityFilter !== "all" && c.seniority !== seniorityFilter) return false;
      if (buyingRoleFilter !== "all" && c.buying_role !== buyingRoleFilter) return false;
      return true;
    };
  }, [search, seniorityFilter, buyingRoleFilter]);

  // ── sorted & filtered company rows ──

  const visibleAccounts = useMemo(() => {
    const q = search.toLowerCase();
    const list = accounts.filter((a) => {
      // company-level filters
      if (industryFilter !== "all" && a.industry !== industryFilter) return false;
      if (healthFilter !== "all") {
        const h = a.health_score;
        if (healthFilter === "strong" && (h == null || h < 70)) return false;
        if (healthFilter === "ok"     && (h == null || h < 40 || h >= 70)) return false;
        if (healthFilter === "risk"   && (h == null || h >= 40)) return false;
      }
      if (dealsOnly && (openOppBy.get(a.id) ?? 0) === 0) return false;

      // search: company name OR any contact name/email
      if (q) {
        const nameMatch = a.name.toLowerCase().includes(q) || (a.domain ?? "").toLowerCase().includes(q);
        const contactMatch = (contactsBy.get(a.id) ?? []).some(contactPassesFilter);
        if (!nameMatch && !contactMatch) return false;
      }

      // if contact-level filters active, company must have ≥1 matching contact
      if (seniorityFilter !== "all" || buyingRoleFilter !== "all") {
        const anyMatch = (contactsBy.get(a.id) ?? []).some(contactPassesFilter);
        if (!anyMatch) return false;
      }

      return true;
    });

    return [...list].sort((a, b) => {
      let av: string | number = 0;
      let bv: string | number = 0;
      switch (sort.key) {
        case "name":      av = a.name; bv = b.name; break;
        case "industry":  av = a.industry ?? ""; bv = b.industry ?? ""; break;
        case "employees": av = a.employee_count ?? -1; bv = b.employee_count ?? -1; break;
        case "openARR":   av = openARRBy.get(a.id) ?? 0; bv = openARRBy.get(b.id) ?? 0; break;
        case "deals":     av = openOppBy.get(a.id) ?? 0; bv = openOppBy.get(b.id) ?? 0; break;
        case "health":    av = a.health_score ?? -1; bv = b.health_score ?? -1; break;
        case "contacts":  av = (contactsBy.get(a.id) ?? []).length; bv = (contactsBy.get(b.id) ?? []).length; break;
      }
      const cmp = typeof av === "string" ? (av as string).localeCompare(bv as string) : (av as number) - (bv as number);
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [accounts, search, industryFilter, healthFilter, dealsOnly, seniorityFilter, buyingRoleFilter, sort, contactsBy, openOppBy, openARRBy, contactPassesFilter]);

  // contacts without a company that pass filters
  const unassigned = useMemo(
    () => contacts.filter((c) => !c.account_id && contactPassesFilter(c))
      .sort((a, b) => {
        const ad = contactActivity.get(a.id)?.[0]?.occurred_at ?? "";
        const bd = contactActivity.get(b.id)?.[0]?.occurred_at ?? "";
        return bd.localeCompare(ad);
      }),
    [contacts, contactPassesFilter, contactActivity],
  );

  const toggleSort  = (key: string) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));
  const toggleExpand = (id: string) =>
    setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // ── contact sub-row ──

  const ContactRow = ({ c, indent = true }: { c: Contact; indent?: boolean }) => {
    const acts    = contactActivity.get(c.id) ?? [];
    const last    = acts[0] ?? null;
    const initials = `${(c.first_name[0] ?? "").toUpperCase()}${(c.last_name[0] ?? "").toUpperCase()}`;
    const isSel   = selected?.id === c.id;
    return (
      <div
        onClick={(e) => { e.stopPropagation(); setSelected(isSel ? null : c); }}
        className={cn(
          "flex items-center gap-3 py-2.5 pr-4 cursor-pointer hover:bg-white/[0.04] transition-colors border-b border-border/20 last:border-0",
          indent ? "pl-14" : "pl-4",
          isSel && "bg-violet/[0.06]",
        )}
      >
        {/* avatar + name + title */}
        <div className="flex items-center gap-2.5 flex-[2] min-w-0">
          <div className="w-7 h-7 rounded-full bg-cyan/10 flex items-center justify-center text-xs font-bold text-cyan shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-1 truncate">{c.first_name} {c.last_name}</p>
            {c.title && <p className="text-xs text-text-3 truncate">{c.title}</p>}
          </div>
        </div>
        {/* seniority */}
        <div className="w-20 shrink-0">
          {c.seniority
            ? <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/5 border border-border text-text-3">{c.seniority}</span>
            : <span className="text-text-3 text-xs">—</span>}
        </div>
        {/* buying role */}
        <div className="w-28 shrink-0 hidden lg:block">
          <span className={cn(
            "text-xs truncate block",
            !c.buying_role && "text-text-3",
            c.buying_role === "Decision Maker"  && "text-violet",
            c.buying_role === "Champion"        && "text-emerald",
            c.buying_role === "Economic Buyer"  && "text-amber",
            c.buying_role === "Blocker"         && "text-rose",
          )}>
            {c.buying_role ?? "—"}
          </span>
        </div>
        {/* last contact */}
        <div className="w-20 shrink-0 text-xs text-text-2">
          {last ? relativeTime(last.occurred_at) : <span className="text-text-3">Never</span>}
        </div>
        {/* comms */}
        <div className="w-10 shrink-0 text-xs text-text-2 text-right">{acts.length || "—"}</div>
        {/* actions */}
        <div className="flex items-center gap-2 ml-2 shrink-0">
          {c.email && (
            <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()} className="text-text-3 hover:text-violet transition-colors">
              <Mail className="w-3.5 h-3.5" />
            </a>
          )}
          {c.phone && (
            <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()} className="text-text-3 hover:text-violet transition-colors">
              <Phone className="w-3.5 h-3.5" />
            </a>
          )}
          {c.linkedin_url && (
            <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-text-3 hover:text-violet transition-colors">
              <Globe className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex gap-4 items-start">
      {/* ── table side ── */}
      <div className="flex-1 min-w-0 space-y-3">

        {/* toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-44">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3" />
            <input
              className="w-full pl-9 pr-4 py-2 bg-white/5 border border-border rounded-xl text-sm text-text-1 placeholder:text-text-3 focus:outline-none focus:border-violet/50"
              placeholder="Search companies or contacts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {industries.length > 0 && (
            <select className={selectCls} value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)}>
              <option value="all">All Industries</option>
              {industries.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          )}
          <select className={selectCls} value={healthFilter} onChange={(e) => setHealthFilter(e.target.value)}>
            <option value="all">All Health</option>
            <option value="strong">Strong (70+)</option>
            <option value="ok">At-Risk (40–69)</option>
            <option value="risk">Critical (&lt;40)</option>
          </select>
          {seniorities.length > 0 && (
            <select className={selectCls} value={seniorityFilter} onChange={(e) => setSeniorityFilter(e.target.value)}>
              <option value="all">All Seniority</option>
              {seniorities.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {buyingRoles.length > 0 && (
            <select className={selectCls} value={buyingRoleFilter} onChange={(e) => setBuyingRoleFilter(e.target.value)}>
              <option value="all">All Roles</option>
              {buyingRoles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          <button onClick={() => setDealsOnly((v) => !v)} className={filterChip(dealsOnly)}>
            Has Open Deals
          </button>
        </div>

        {/* table */}
        <div className="glass rounded-2xl overflow-hidden">
          {/* company header */}
          <div className={cn(CO_GRID, "px-4 py-2.5 border-b border-border bg-white/[0.03] gap-3 items-center")}>
            <div className="pl-9">
              <SortTh label="Company" sortKey="name" sort={sort} onSort={toggleSort} />
            </div>
            <SortTh label="Industry"  sortKey="industry"  sort={sort} onSort={toggleSort} />
            <SortTh label="Employees" sortKey="employees" sort={sort} onSort={toggleSort} />
            <SortTh label="Open ARR"  sortKey="openARR"   sort={sort} onSort={toggleSort} />
            <SortTh label="Deals"     sortKey="deals"     sort={sort} onSort={toggleSort} />
            <SortTh label="Health"    sortKey="health"    sort={sort} onSort={toggleSort} />
            <SortTh label="Contacts"  sortKey="contacts"  sort={sort} onSort={toggleSort} />
          </div>

          {/* company rows */}
          {visibleAccounts.map((account) => {
            const isExp = expanded.has(account.id);
            const companyContacts = (contactsBy.get(account.id) ?? []).filter(contactPassesFilter)
              .sort((a, b) => {
                const ad = contactActivity.get(a.id)?.[0]?.occurred_at ?? "";
                const bd = contactActivity.get(b.id)?.[0]?.occurred_at ?? "";
                return bd.localeCompare(ad);
              });

            return (
              <div key={account.id} className="border-b border-border/40 last:border-0">
                {/* company row */}
                <div
                  onClick={() => toggleExpand(account.id)}
                  className={cn(
                    CO_GRID,
                    "px-4 py-3 gap-3 items-center cursor-pointer hover:bg-white/[0.03] transition-colors",
                    isExp && "bg-white/[0.02]",
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronRight
                      className={cn("w-3.5 h-3.5 text-text-3 transition-transform duration-200 shrink-0", isExp && "rotate-90")}
                    />
                    <div className="w-7 h-7 rounded-lg bg-violet/10 flex items-center justify-center shrink-0">
                      <Building2 className="w-3.5 h-3.5 text-violet" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-1 truncate">{account.name}</p>
                      {account.domain && <p className="text-xs text-text-3">{account.domain}</p>}
                    </div>
                  </div>
                  <div className="text-xs text-text-3 truncate">{account.industry ?? "—"}</div>
                  <div className="text-sm text-text-2">{fmt(account.employee_count)}</div>
                  <div className="text-sm font-medium text-violet">{fmt(openARRBy.get(account.id) ?? 0, "$")}</div>
                  <div className="text-sm text-text-2">{openOppBy.get(account.id) ?? 0}</div>
                  <div>
                    {account.health_score != null
                      ? <span className={cn("text-sm font-bold", healthColor(account.health_score))}>{account.health_score}</span>
                      : <span className="text-text-3 text-sm">—</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-text-2">{companyContacts.length}</span>
                    {companyContacts.length > 0 && (
                      <span className="text-xs text-text-3">contacts</span>
                    )}
                  </div>
                </div>

                {/* expandable contacts */}
                <AnimatePresence initial={false}>
                  {isExp && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden border-t border-border/30 bg-white/[0.015]"
                    >
                      {/* contact sub-header */}
                      <div className="flex items-center gap-3 pl-14 pr-4 py-1.5 border-b border-border/20">
                        <div className="flex-[2] text-xs font-semibold text-text-3 uppercase tracking-wider">Name</div>
                        <div className="w-20 shrink-0 text-xs font-semibold text-text-3 uppercase tracking-wider">Seniority</div>
                        <div className="w-28 shrink-0 hidden lg:block text-xs font-semibold text-text-3 uppercase tracking-wider">Buying Role</div>
                        <div className="w-20 shrink-0 text-xs font-semibold text-text-3 uppercase tracking-wider">Last Contact</div>
                        <div className="w-10 shrink-0 text-xs font-semibold text-text-3 uppercase tracking-wider text-right">Comms</div>
                        <div className="w-16 shrink-0" />
                      </div>
                      {companyContacts.length > 0
                        ? companyContacts.map((c) => <ContactRow key={c.id} c={c} indent />)
                        : <p className="pl-14 pr-4 py-3 text-xs text-text-3 italic">No contacts match current filters.</p>
                      }
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}

          {/* unassigned contacts */}
          {unassigned.length > 0 && (
            <div className="border-t border-border/40">
              <div
                onClick={() => toggleExpand("__unassigned__")}
                className={cn(
                  CO_GRID,
                  "px-4 py-3 gap-3 items-center cursor-pointer hover:bg-white/[0.03] transition-colors",
                  expanded.has("__unassigned__") && "bg-white/[0.02]",
                )}
              >
                <div className="flex items-center gap-2">
                  <ChevronRight
                    className={cn("w-3.5 h-3.5 text-text-3 transition-transform duration-200 shrink-0", expanded.has("__unassigned__") && "rotate-90")}
                  />
                  <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                    <Users className="w-3.5 h-3.5 text-text-3" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-3">No Company</p>
                    <p className="text-xs text-text-3">{unassigned.length} contacts</p>
                  </div>
                </div>
                <div className="text-xs text-text-3">—</div>
                <div className="text-text-3 text-sm">—</div>
                <div className="text-text-3 text-sm">—</div>
                <div className="text-text-3 text-sm">—</div>
                <div className="text-text-3 text-sm">—</div>
                <div className="text-sm text-text-2">{unassigned.length}</div>
              </div>
              <AnimatePresence initial={false}>
                {expanded.has("__unassigned__") && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="overflow-hidden border-t border-border/30 bg-white/[0.015]"
                  >
                    <div className="flex items-center gap-3 pl-14 pr-4 py-1.5 border-b border-border/20">
                      <div className="flex-[2] text-xs font-semibold text-text-3 uppercase tracking-wider">Name</div>
                      <div className="w-20 shrink-0 text-xs font-semibold text-text-3 uppercase tracking-wider">Seniority</div>
                      <div className="w-28 shrink-0 hidden lg:block text-xs font-semibold text-text-3 uppercase tracking-wider">Buying Role</div>
                      <div className="w-20 shrink-0 text-xs font-semibold text-text-3 uppercase tracking-wider">Last Contact</div>
                      <div className="w-10 shrink-0 text-xs font-semibold text-text-3 uppercase tracking-wider text-right">Comms</div>
                      <div className="w-16 shrink-0" />
                    </div>
                    {unassigned.map((c) => <ContactRow key={c.id} c={c} indent />)}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {visibleAccounts.length === 0 && unassigned.length === 0 && (
            <p className="text-center py-12 text-sm text-text-3">No results match your filters.</p>
          )}
        </div>
      </div>

      {/* ── contact detail panel ── */}
      <AnimatePresence>
        {selected && (
          <ContactPanel
            contact={selected}
            account={accountMap.get(selected.account_id ?? "")}
            activities={contactActivity.get(selected.id) ?? []}
            onClose={() => setSelected(null)}
            onContactUpdate={(updated) => setSelected(updated)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Activities Tab ────────────────────────────────────────────────────────────

function ActivitiesTab() {
  const { data: activities = [] } = useSWR("crm-activities", () => api.crm.activities.list());
  const typeIcon: Record<string, React.ElementType> = {
    email: Mail, call: Phone, meeting: Users, note: Activity, task: Target,
  };
  const typeColor: Record<string, string> = {
    email:   "text-violet bg-violet/10",
    call:    "text-cyan bg-cyan/10",
    meeting: "text-amber bg-amber/10",
    note:    "text-emerald bg-emerald/10",
    task:    "text-rose bg-rose/10",
  };

  return (
    <div className="space-y-2">
      {activities.map((a) => {
        const Icon  = typeIcon[a.type]  ?? Activity;
        const color = typeColor[a.type] ?? "text-text-3 bg-white/5";
        return (
          <div key={a.id} className="glass rounded-xl p-4 flex items-start gap-3">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", color)}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-1">{a.subject ?? a.type}</p>
              {a.ai_summary && <p className="text-xs text-text-3 mt-0.5 line-clamp-2">{a.ai_summary}</p>}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-text-3">
                  {new Date(a.occurred_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-white/5 border border-border text-text-3 capitalize">{a.source}</span>
              </div>
            </div>
          </div>
        );
      })}
      {activities.length === 0 && (
        <div className="text-center py-12 text-sm text-text-3">
          No activities yet. Connect your email to start auto-logging.
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CrmPage() {
  const [tab, setTab] = useState<Tab>("pipeline");
  const [showNewOpp, setShowNewOpp] = useState(false);

  const { data: stages = [],        mutate: mutateStages } = useSWR("crm-stages",   () => api.crm.stages.list());
  const { data: opportunities = [], mutate: mutateOpps  } = useSWR("crm-opps",     () => api.crm.opportunities.list());
  const { data: accounts = []  }                          = useSWR("crm-accounts", () => api.crm.accounts.list(), { refreshInterval: 30_000 });
  const { data: contacts = []  }                          = useSWR("crm-contacts", () => api.crm.contacts.list(), { refreshInterval: 30_000 });

  const seedStages = async () => {
    const defaults = [
      { name: "Prospecting",   order: 0, probability: 10 },
      { name: "Qualification", order: 1, probability: 20 },
      { name: "Discovery",     order: 2, probability: 30 },
      { name: "Proposal",      order: 3, probability: 60 },
      { name: "Negotiation",   order: 4, probability: 80 },
      { name: "Closed Won",    order: 5, probability: 100, is_won: true },
      { name: "Closed Lost",   order: 6, probability: 0,   is_lost: true },
    ];
    for (const s of defaults) await api.crm.stages.create(s);
    mutateStages();
  };

  const handleMoveStage = async (oppId: string, stageId: string) => {
    await api.crm.opportunities.update(oppId, { stage_id: stageId });
    mutateOpps();
  };

  const handleCreateOpp = async (data: Partial<Opportunity>) => {
    await api.crm.opportunities.create(data);
    mutateOpps();
  };

  const openARR   = opportunities.filter((o) => !o.won_at && !o.lost_at).reduce((s, o) => s + (o.arr ?? 0), 0);
  const wonARR    = opportunities.filter((o) => !!o.won_at).reduce((s, o) => s + (o.arr ?? 0), 0);
  const openCount = opportunities.filter((o) => !o.won_at && !o.lost_at).length;

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "pipeline",   label: "Pipeline",   icon: TrendingUp },
    { id: "contacts",   label: "Contacts",   icon: Users      },
    { id: "activities", label: "Activities", icon: Activity   },
  ];

  return (
    <div className="flex h-screen bg-surface-0 overflow-hidden">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 overflow-y-auto">
        <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">

          {/* header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-text-1">CRM</h1>
              <p className="text-sm text-text-3 mt-0.5">Pipeline, companies, contacts, and activities</p>
            </div>
            <div className="flex items-center gap-2">
              {stages.length === 0 && (
                <button
                  onClick={seedStages}
                  className="px-4 py-2 text-sm bg-white/5 border border-border rounded-xl text-text-2 hover:border-violet/30 transition-colors"
                >
                  Seed Pipeline Stages
                </button>
              )}
              <button
                onClick={() => setShowNewOpp(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-violet text-white rounded-xl hover:bg-violet/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Deal
              </button>
            </div>
          </div>

          {/* stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Open Pipeline", value: fmt(openARR, "$"), sub: `${openCount} deals`, icon: TrendingUp,   color: "bg-violet/10 text-violet"  },
              { label: "Closed Won",    value: fmt(wonARR, "$"),  sub: "this period",        icon: CheckCircle2, color: "bg-emerald/10 text-emerald" },
              { label: "Companies",     value: accounts.length,   sub: "total",              icon: Building2,    color: "bg-cyan/10 text-cyan"       },
              { label: "Contacts",      value: contacts.length,   sub: "total",              icon: Users,        color: "bg-amber/10 text-amber"     },
            ].map((s) => (
              <div key={s.label} className="glass rounded-2xl p-5 flex items-start gap-4">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", s.color)}>
                  <s.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-text-3 uppercase tracking-widest">{s.label}</p>
                  <p className="text-2xl font-bold text-text-1 mt-0.5 leading-none">{s.value}</p>
                  <p className="text-xs text-text-3 mt-1">{s.sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* tabs */}
          <div className="flex items-center gap-1 border-b border-border">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                  tab === t.id
                    ? "border-violet text-violet"
                    : "border-transparent text-text-3 hover:text-text-2",
                )}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </div>

          {/* tab content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {tab === "pipeline"   && <PipelineKanban stages={stages} opportunities={opportunities} onMoveStage={handleMoveStage} />}
              {tab === "contacts"   && <ContactsTab accounts={accounts} contacts={contacts} opportunities={opportunities} />}
              {tab === "activities" && <ActivitiesTab />}
            </motion.div>
          </AnimatePresence>

        </div>
      </div>

      {showNewOpp && (
        <NewOppModal
          stages={stages}
          accounts={accounts}
          onClose={() => setShowNewOpp(false)}
          onCreate={handleCreateOpp}
        />
      )}
    </div>
  );
}
