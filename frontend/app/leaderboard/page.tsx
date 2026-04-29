"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Zap, TrendingUp, Calendar, RefreshCw } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";

interface LeaderboardEntry {
  rank: number;
  user_id: string;
  name: string;
  email: string;
  attainment_arr: number;
}

interface LiveUpdate {
  user_id: string;
  arr_delta: number;
  new_score: number;
  year: number;
  month: number | null;
}

const CURRENT_YEAR = new Date().getFullYear();
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const fetcher = (url: string) =>
  fetch(url, {
    credentials: "include",
    headers: { "X-Org-Id": localStorage.getItem("lanara_org_id") || "" },
  }).then((r) => r.json());

function formatArr(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return <span className="text-xl">🥇</span>;
  if (rank === 2)
    return <span className="text-xl">🥈</span>;
  if (rank === 3)
    return <span className="text-xl">🥉</span>;
  return (
    <span className="w-7 h-7 flex items-center justify-center rounded-full bg-surface-2 text-text-3 text-xs font-bold">
      {rank}
    </span>
  );
}

function RepCard({ entry, isNew }: { entry: LeaderboardEntry; isNew: boolean }) {
  const maxBar = 100;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.25 }}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
        isNew
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-border bg-surface-1/50 hover:bg-surface-1"
      }`}
    >
      <div className="w-8 flex items-center justify-center shrink-0">
        <RankBadge rank={entry.rank} />
      </div>

      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet/60 to-cyan/60 flex items-center justify-center text-xs font-bold text-white shrink-0">
        {(entry.name || entry.email || "?").charAt(0).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-1 truncate">
          {entry.name || entry.email}
        </p>
        {entry.name && (
          <p className="text-xs text-text-3 truncate">{entry.email}</p>
        )}
        <div className="mt-1 h-1 bg-surface-2 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet to-cyan rounded-full"
            style={{ width: `${Math.min((entry.attainment_arr / maxBar) * 100, 100)}%` }}
          />
        </div>
      </div>

      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-text-1">{formatArr(entry.attainment_arr)}</p>
        <p className="text-[10px] text-text-3">ARR closed</p>
      </div>

      {isNew && (
        <Zap className="w-3.5 h-3.5 text-emerald-400 animate-pulse shrink-0" />
      )}
    </motion.div>
  );
}

export default function LeaderboardPage() {
  const currentMonth = new Date().getMonth() + 1;
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState<number | null>(currentMonth);
  const [liveEntries, setLiveEntries] = useState<LeaderboardEntry[] | null>(null);
  const [recentUpdates, setRecentUpdates] = useState<Set<string>>(new Set());
  const [connected, setConnected] = useState(false);
  const sseRef = useRef<AbortController | null>(null);

  const queryStr = month
    ? `?year=${year}&month=${month}`
    : `?year=${year}`;

  const { data: initialData, isLoading, mutate } = useSWR<LeaderboardEntry[]>(
    `/api/leaderboard${queryStr}`,
    fetcher,
    { refreshInterval: 60_000 },
  );

  // Merge live updates into display — guard against error responses (non-array)
  const entries = liveEntries ?? (Array.isArray(initialData) ? initialData : []);

  // Highlight newly updated rep for 4 seconds
  const flashUser = useCallback((userId: string) => {
    setRecentUpdates((prev) => new Set([...prev, userId]));
    setTimeout(() => {
      setRecentUpdates((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }, 4000);
  }, []);

  // SSE connection
  useEffect(() => {
    const ctrl = new AbortController();
    sseRef.current = ctrl;

    async function connect() {
      try {
        const res = await fetch("/api/leaderboard/stream", {
          credentials: "include",
          signal: ctrl.signal,
          headers: {
            Accept: "text/event-stream",
            "X-Org-Id": localStorage.getItem("lanara_org_id") || "",
          },
        });

        if (!res.ok || !res.body) return;
        setConnected(true);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const update: LiveUpdate = JSON.parse(line.slice(6));
              // Re-fetch the full leaderboard to get sorted ranking
              mutate();
              flashUser(update.user_id);
            } catch {
              // malformed line — ignore
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          setConnected(false);
          // Reconnect after 5s on unexpected disconnect
          setTimeout(connect, 5000);
        }
      }
    }

    connect();
    return () => {
      ctrl.abort();
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset live entries when period changes
  useEffect(() => {
    setLiveEntries(null);
  }, [year, month]);

  const periodLabel = month
    ? `${MONTHS[month - 1]} ${year}`
    : `Full Year ${year}`;

  return (
    <div className="flex h-screen bg-surface-0 overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
            <Trophy className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-text-1">Sales Leaderboard</h1>
            <p className="text-xs text-text-3">{periodLabel} · {entries.length} reps</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Live indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2">
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-text-3"}`} />
            <span className="text-[10px] text-text-3">{connected ? "Live" : "Offline"}</span>
          </div>

          <button
            onClick={() => mutate()}
            className="p-1.5 rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-2 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-border shrink-0 overflow-x-auto">
        <Calendar className="w-3.5 h-3.5 text-text-3 shrink-0" />

        {/* Year */}
        <div className="flex items-center gap-1 shrink-0">
          {[CURRENT_YEAR - 1, CURRENT_YEAR].map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                year === y
                  ? "bg-violet/15 text-violet"
                  : "text-text-3 hover:text-text-1 hover:bg-surface-2"
              }`}
            >
              {y}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-border shrink-0" />

        {/* Annual toggle */}
        <button
          onClick={() => setMonth(null)}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors shrink-0 ${
            month === null
              ? "bg-violet/15 text-violet"
              : "text-text-3 hover:text-text-1 hover:bg-surface-2"
          }`}
        >
          Annual
        </button>

        {/* Monthly */}
        {MONTHS.map((label, i) => (
          <button
            key={i}
            onClick={() => setMonth(i + 1)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors shrink-0 ${
              month === i + 1
                ? "bg-violet/15 text-violet"
                : "text-text-3 hover:text-text-1 hover:bg-surface-2"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Board */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading && !entries.length ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-surface-1 animate-pulse" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
            <TrendingUp className="w-10 h-10 text-text-3" />
            <p className="text-sm text-text-3">No closed deals yet for this period.</p>
            <p className="text-xs text-text-3">
              Close a won deal to appear on the board.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <AnimatePresence mode="popLayout">
              {entries.map((entry) => (
                <RepCard
                  key={entry.user_id}
                  entry={entry}
                  isNew={recentUpdates.has(entry.user_id)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
