"use client";

import { useState } from "react";
import useSWR from "swr";
import { Globe, CheckCircle2, Loader2, ExternalLink, X, Sparkles, Trash2 } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { api } from "@/lib/api";

export default function IntegrationsPage() {
  return (
    <div className="flex h-screen bg-surface-0 overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full px-6 py-10 space-y-8">
          <div>
            <h1 className="text-xl font-semibold text-text-1">Integrations</h1>
            <p className="text-sm text-text-3 mt-1">Connect external services to power AI insights and automation.</p>
          </div>

          <section className="space-y-4">
            <h2 className="text-xs font-semibold text-text-3 uppercase tracking-widest">Google</h2>
            <GooglePanel />
          </section>

          <section className="space-y-4">
            <h2 className="text-xs font-semibold text-text-3 uppercase tracking-widest">AI Processing</h2>
            <EnrichPanel />
            <CleanupPanel />
          </section>
        </div>
      </div>
    </div>
  );
}

function GooglePanel() {
  const { data: status, mutate, isLoading } = useSWR(
    "google-status",
    () => api.integrations.google.status(),
    { refreshInterval: 0 },
  );
  const [connecting,    setConnecting]    = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connectError,  setConnectError]  = useState("");

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
          cleanup();
          setConnecting(false);
          mutate();
        } else if (event.data?.type === "google-drive-error") {
          cleanup();
          setConnecting(false);
          setConnectError(event.data.error || "Connection failed");
        }
      };

      const handleStorage = (event: StorageEvent) => {
        if (event.key !== "google-oauth-result" || !event.newValue) return;
        try {
          const result = JSON.parse(event.newValue);
          cleanup();
          localStorage.removeItem("google-oauth-result");
          if (result.type === "connected") {
            setConnecting(false);
            mutate();
          } else if (result.type === "error") {
            setConnecting(false);
            setConnectError(result.error || "Connection failed");
          }
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
            if (result.type === "error") {
              setConnecting(false);
              setConnectError(result.error || "Connection failed");
              return;
            }
          }
        } catch {}
        cleanup();
        setConnecting(false);
        mutate();
      }, 500);
    } catch (e: unknown) {
      setConnecting(false);
      setConnectError(e instanceof Error ? e.message : "Failed to start connection");
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await api.integrations.google.disconnect();
      mutate();
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="rounded-xl border border-emerald/20 bg-emerald/5 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-emerald/15 flex items-center justify-center shrink-0">
          <Globe className="w-5 h-5 text-emerald" />
        </div>
        <div>
          <p className="text-sm font-semibold text-text-1">Google Account</p>
          <p className="text-xs text-text-3">Connects Gmail + Drive — powers email intelligence and document access</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-text-3 text-xs">
          <Loader2 className="w-3 h-3 animate-spin" /> Checking…
        </div>
      ) : status?.connected ? (
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
            Requires <span className="font-mono text-text-2">GOOGLE_CLIENT_ID</span> and{" "}
            <span className="font-mono text-text-2">GOOGLE_CLIENT_SECRET</span> in your{" "}
            <span className="font-mono text-text-2">.env</span>.
          </p>
        </div>
      )}

      {connectError && <p className="text-xs text-rose-400">{connectError}</p>}
    </div>
  );
}

function CleanupPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const res = await api.crm.activities.cleanupSpam();
      setResult(res.message);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Cleanup failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-rose-500/15 flex items-center justify-center shrink-0">
          <Trash2 className="w-5 h-5 text-rose-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-text-1">Clean Up Spam</p>
          <p className="text-xs text-text-3">Remove marketing emails, automated notifications, and the contacts/companies created from them.</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={run}
          disabled={running}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/35 text-rose-400 text-sm font-medium disabled:opacity-40 transition-colors"
        >
          {running
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cleaning…</>
            : <><Trash2 className="w-3.5 h-3.5" /> Run Cleanup</>}
        </button>
        {result && <p className="text-xs text-emerald">{result}</p>}
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}

function EnrichPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const res = await api.crm.activities.enrich();
      setResult(res.message);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to start enrichment";
      setError(msg);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-text-1">Enrich Activities</p>
          <p className="text-xs text-text-3">Run the Comms model over existing emails to generate summaries and fill in contact details.</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={run}
          disabled={running}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-500/20 hover:bg-violet-500/35 text-violet-300 text-sm font-medium disabled:opacity-40 transition-colors"
        >
          {running
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing…</>
            : <><Sparkles className="w-3.5 h-3.5" /> Run Enrichment</>}
        </button>
        {result && <p className="text-xs text-emerald">{result}</p>}
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}
