"use client";

import { useState } from "react";
import useSWR from "swr";
import { CheckCircle2, Loader2, ExternalLink, X, Clock } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { api } from "@/lib/api";

const POLL_OPTIONS = [
  { label: "5 minutes",  value: 5 },
  { label: "15 minutes", value: 15 },
  { label: "30 minutes", value: 30 },
  { label: "1 hour",     value: 60 },
];

// ── Logo SVGs ─────────────────────────────────────────────────────────────────

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

function OutlookLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className}>
      <rect width="48" height="48" rx="6" fill="#0078D4"/>
      <rect x="6" y="12" width="22" height="24" rx="2" fill="#50E6FF" opacity="0.3"/>
      <path d="M6 14a2 2 0 012-2h18a2 2 0 012 2v20a2 2 0 01-2 2H8a2 2 0 01-2-2V14z" fill="white" opacity="0.15"/>
      <ellipse cx="17" cy="24" rx="7" ry="8" fill="white"/>
      <ellipse cx="17" cy="24" rx="5" ry="6" fill="#0078D4"/>
      <path d="M28 16h14v16H28z" fill="#28A8E8" opacity="0.8"/>
      <path d="M28 16l7 8 7-8" fill="none" stroke="white" strokeWidth="1.5"/>
    </svg>
  );
}

function SlackLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className}>
      <path fill="#E01E5A" d="M13 30a4 4 0 110-8 4 4 0 010 8zm0 4a4 4 0 01-4-4v-4a4 4 0 018 0v4a4 4 0 01-4 4z"/>
      <path fill="#36C5F0" d="M30 13a4 4 0 11-8 0 4 4 0 018 0zm4 0a4 4 0 01-4 4h-4a4 4 0 110-8h4a4 4 0 014 4z"/>
      <path fill="#2EB67D" d="M35 18a4 4 0 110 8 4 4 0 010-8zm0-4a4 4 0 014 4v4a4 4 0 01-8 0v-4a4 4 0 014-4z"/>
      <path fill="#ECB22E" d="M18 35a4 4 0 118 0 4 4 0 01-8 0zm-4 0a4 4 0 014-4h4a4 4 0 110 8h-4a4 4 0 01-4-4z"/>
    </svg>
  );
}

function TeamsLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className}>
      <path fill="#5059C9" d="M31 20h8a3 3 0 013 3v9a5 5 0 01-5 5h-1a5 5 0 01-5-5v-9a3 3 0 012-3z"/>
      <circle cx="35" cy="13" r="4" fill="#5059C9"/>
      <path fill="#7B83EB" d="M26 21H8a3 3 0 00-3 3v11a8 8 0 008 8h8a8 8 0 008-8V24a3 3 0 00-3-3z"/>
      <circle cx="17" cy="13" r="6" fill="#7B83EB"/>
      <path fill="white" opacity="0.1" d="M17 21h9a3 3 0 013 3v11a8 8 0 01-4 7H17V21z"/>
      <path fill="white" d="M21 30h-8v-2h8v2zm0-4h-8v-2h8v2z" opacity="0.9"/>
    </svg>
  );
}

function ZoomLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className}>
      <rect width="48" height="48" rx="10" fill="#2196F3" opacity="0.15"/>
      <rect width="48" height="48" rx="10" fill="#2D8CFF"/>
      <path fill="white" d="M8 17a4 4 0 014-4h16a4 4 0 014 4v14a4 4 0 01-4 4H12a4 4 0 01-4-4V17z"/>
      <path fill="#2D8CFF" d="M32 20l8-5v18l-8-5V20z"/>
    </svg>
  );
}

function LinkedInLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className}>
      <rect width="48" height="48" rx="8" fill="#0077B5"/>
      <path fill="white" d="M12 18h6v18h-6V18zm3-9a3 3 0 110 6 3 3 0 010-6zm10 9h5.5v2.5h.1C31.9 18.9 34 18 36.5 18c5.3 0 6.5 3.5 6.5 8v10h-6V27c0-2-.1-4.5-2.7-4.5-2.8 0-3.2 2.1-3.2 4.4V36H25V18z"/>
    </svg>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  return (
    <div className="flex h-screen bg-surface-0 overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-4xl mx-auto w-full px-6 py-10 space-y-10">
          <div>
            <h1 className="text-xl font-semibold text-text-1">Integrations</h1>
            <p className="text-sm text-text-3 mt-1">Connect external services to power AI insights and automation.</p>
          </div>

          <section className="space-y-4">
            <h2 className="text-xs font-semibold text-text-3 uppercase tracking-widest">Email</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <GooglePanel />
              <ComingSoonCard
                logo={<OutlookLogo className="w-5 h-5" />}
                color="blue"
                name="Microsoft Outlook"
                description="Monitor Outlook and Exchange mailboxes for deal activity and rep coaching signals."
              />
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xs font-semibold text-text-3 uppercase tracking-widest">Communication</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <ComingSoonCard
                logo={<SlackLogo className="w-5 h-5" />}
                color="pink"
                name="Slack"
                description="Surface deal signals and coaching alerts in your team's channels."
              />
              <ComingSoonCard
                logo={<TeamsLogo className="w-5 h-5" />}
                color="indigo"
                name="Microsoft Teams"
                description="Deliver rep briefings and manager alerts inside Teams."
              />
              <ComingSoonCard
                logo={<ZoomLogo className="w-5 h-5" />}
                color="blue"
                name="Zoom"
                description="Analyze call recordings for deal intelligence and coaching."
              />
              <ComingSoonCard
                logo={<LinkedInLogo className="w-5 h-5" />}
                color="sky"
                name="LinkedIn"
                description="Enrich contacts and accounts with LinkedIn profiles."
              />
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

// ── Coming Soon card ──────────────────────────────────────────────────────────

type CardColor = "blue" | "pink" | "indigo" | "sky" | "emerald";

const COLOR_MAP: Record<CardColor, { border: string; bg: string; badge: string }> = {
  blue:    { border: "border-blue-500/20",   bg: "bg-blue-500/5",   badge: "bg-blue-500/15 text-blue-400" },
  pink:    { border: "border-pink-500/20",   bg: "bg-pink-500/5",   badge: "bg-pink-500/15 text-pink-400" },
  indigo:  { border: "border-indigo-500/20", bg: "bg-indigo-500/5", badge: "bg-indigo-500/15 text-indigo-400" },
  sky:     { border: "border-sky-500/20",    bg: "bg-sky-500/5",    badge: "bg-sky-500/15 text-sky-400" },
  emerald: { border: "border-emerald/20",    bg: "bg-emerald/5",    badge: "bg-emerald/15 text-emerald" },
};

function ComingSoonCard({
  logo,
  color,
  name,
  description,
}: {
  logo: React.ReactNode;
  color: CardColor;
  name: string;
  description: string;
}) {
  const c = COLOR_MAP[color];
  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-5 flex flex-col gap-3 opacity-70`}>
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">
          {logo}
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.badge}`}>
          Coming soon
        </span>
      </div>
      <div>
        <p className="text-sm font-semibold text-text-1">{name}</p>
        <p className="text-xs text-text-3 mt-0.5">{description}</p>
      </div>
    </div>
  );
}

// ── Google panel ──────────────────────────────────────────────────────────────

function GooglePanel() {
  const { data: status, mutate, isLoading } = useSWR(
    "google-status",
    () => api.integrations.google.status(),
    { refreshInterval: 0 },
  );
  const [connecting,     setConnecting]     = useState(false);
  const [disconnecting,  setDisconnecting]  = useState(false);
  const [connectError,   setConnectError]   = useState("");
  const [savingInterval, setSavingInterval] = useState(false);

  const connect = async () => {
    setConnecting(true);
    setConnectError("");
    try { localStorage.removeItem("google-oauth-result"); } catch {}
    try {
      const { auth_url } = await api.integrations.google.authUrl();
      const popup = window.open(auth_url, "google-auth", "width=600,height=700,left=200,top=100");

      const cleanup = () => {
        window.removeEventListener("message", handleMsg);
        window.removeEventListener("storage", handleStorage);
        clearInterval(closed);
      };

      const handleMsg = (event: MessageEvent) => {
        if (event.data?.type === "google-drive-connected") {
          cleanup(); setConnecting(false); mutate();
        } else if (event.data?.type === "google-drive-error") {
          cleanup(); setConnecting(false); setConnectError(event.data.error || "Connection failed");
        }
      };

      const handleStorage = (event: StorageEvent) => {
        if (event.key !== "google-oauth-result" || !event.newValue) return;
        try {
          const result = JSON.parse(event.newValue);
          cleanup();
          localStorage.removeItem("google-oauth-result");
          if (result.type === "connected") { setConnecting(false); mutate(); }
          else if (result.type === "error") { setConnecting(false); setConnectError(result.error || "Connection failed"); }
        } catch {}
      };

      window.addEventListener("message", handleMsg);
      window.addEventListener("storage", handleStorage);

      const closed = setInterval(() => {
        if (!popup?.closed) return;
        try {
          const stored = localStorage.getItem("google-oauth-result");
          if (stored) {
            const result = JSON.parse(stored);
            localStorage.removeItem("google-oauth-result");
            cleanup();
            if (result.type === "error") { setConnecting(false); setConnectError(result.error || "Connection failed"); return; }
          }
        } catch {}
        cleanup(); setConnecting(false); mutate();
      }, 500);
    } catch (e: unknown) {
      setConnecting(false);
      setConnectError(e instanceof Error ? e.message : "Failed to start connection");
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try { await api.integrations.google.disconnect(); mutate(); }
    finally { setDisconnecting(false); }
  };

  const saveInterval = async (minutes: number) => {
    setSavingInterval(true);
    try { await api.integrations.google.updateSettings({ poll_interval_minutes: minutes }); mutate(); }
    finally { setSavingInterval(false); }
  };

  const currentInterval = status?.poll_interval_minutes ?? 5;

  return (
    <div className="rounded-xl border border-emerald/20 bg-emerald/5 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">
          <GoogleLogo className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-text-1">Google — Gmail + Drive</p>
          <p className="text-xs text-text-3">Monitor email activity and access documents for AI insights</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-text-3 text-xs">
          <Loader2 className="w-3 h-3 animate-spin" /> Checking…
        </div>
      ) : status?.connected ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald" />
              <div>
                <p className="text-xs font-medium text-emerald">Connected</p>
                {status.email && <p className="text-xs text-text-3">{status.email}</p>}
              </div>
            </div>
            <button
              onClick={disconnect}
              disabled={disconnecting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-rose-400 hover:bg-rose-400/10 disabled:opacity-40 transition-colors"
            >
              {disconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
              Disconnect
            </button>
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-3.5 h-3.5 text-text-3" />
              <p className="text-xs font-medium text-text-2">Check for new emails every</p>
              {savingInterval && <Loader2 className="w-3 h-3 animate-spin text-text-3" />}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {POLL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => saveInterval(opt.value)}
                  disabled={savingInterval}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                    currentInterval === opt.value
                      ? "bg-emerald/20 text-emerald border border-emerald/30"
                      : "bg-surface-2 text-text-2 hover:bg-surface-1 border border-border"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            onClick={connect}
            disabled={connecting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald/20 hover:bg-emerald/35 text-emerald text-sm font-medium disabled:opacity-40 transition-colors"
          >
            {connecting
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Waiting for authorization…</>
              : <><ExternalLink className="w-3.5 h-3.5" /> Connect Google</>}
          </button>
          <p className="text-xs text-text-3">
            Configure credentials in <span className="font-medium text-text-2">Admin → Settings → Platform</span>.
          </p>
        </div>
      )}

      {connectError && <p className="text-xs text-rose-400">{connectError}</p>}
    </div>
  );
}

