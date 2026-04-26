"use client";

import { useRef, useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  BookOpen, Upload, Trash2, Search, RefreshCw,
  FileText, AlertCircle, CheckCircle2, Loader2,
  Plus, Pencil, Check, X, Eye, EyeOff, Cpu, KeyRound, Download,
  Globe, ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/layout/Sidebar";
import { api, type BusinessUnit, type Document, type SearchResult, type McpServer, type AiModel } from "@/lib/api";
import { cn } from "@/lib/cn";

const TABS = [
  { id: "ai",        label: "AI" },
  { id: "mcp",       label: "MCP Servers" },
  { id: "knowledge", label: "Knowledge Sources" },
  { id: "settings",  label: "Settings" },
];

export default function AdminPage() {
  return (
    <Suspense>
      <AdminPageInner />
    </Suspense>
  );
}

function AdminPageInner() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") ?? "ai");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  return (
    <div className="flex h-screen bg-surface-0 overflow-hidden">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-end gap-1 px-6 border-b border-border shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === tab.id
                  ? "border-violet text-violet"
                  : "border-transparent text-text-3 hover:text-text-2",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <main className="flex-1 overflow-y-auto p-6">
          {activeTab === "knowledge" && <KnowledgeSourcesTab />}
          {activeTab === "mcp"       && <McpServersTab />}
          {activeTab === "ai"        && <AiModelsTab />}
          {activeTab === "settings"  && <SettingsTab />}
        </main>
      </div>
    </div>
  );
}

function KnowledgeSourcesTab() {
  const [selectedBuId, setSelectedBuId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: units = [] } = useSWR(
    "business-units-admin",
    () => api.businessUnits.list(),
  );

  const activeBuId = selectedBuId || units[0]?.id || "";

  const { data: documents = [], mutate: mutateDocs, isLoading } = useSWR(
    activeBuId ? ["documents-admin", activeBuId] : null,
    ([, buId]) => api.documents.list(buId),
    { refreshInterval: 5000 },
  );

  const handleUpload = async (files: FileList | null) => {
    if (!files || !activeBuId) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await api.documents.upload(file, activeBuId);
      }
      mutateDocs();
    } catch (e) {
      console.error("Upload failed:", e);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    try {
      await api.documents.delete(docId);
      mutateDocs();
    } catch (e) {
      console.error("Delete failed:", e);
    }
  };

  const handleSearch = async () => {
    if (!activeBuId || !searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await api.documents.search(searchQuery, activeBuId);
      setSearchResults(results);
    } catch (e) {
      console.error("Search failed:", e);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* BU selector */}
      <div className="flex items-center gap-3">
        <BookOpen className="w-4 h-4 text-text-3" />
        <select
          value={activeBuId}
          onChange={(e) => { setSelectedBuId(e.target.value); setSearchResults([]); }}
          className="bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-sm text-text-1 outline-none focus:border-violet"
        >
          {units.map((bu: BusinessUnit) => (
            <option key={bu.id} value={bu.id}>{bu.name}</option>
          ))}
        </select>
        <span className="text-xs text-text-3">
          {documents.length} document{documents.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Semantic search */}
      <div className="glass rounded-2xl p-4 space-y-3">
        <p className="text-xs font-medium text-text-2 uppercase tracking-widest">Semantic Search</p>
        <div className="flex gap-2">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search the knowledge base…"
            className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-violet"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet/20 hover:bg-violet/35 disabled:opacity-40 text-violet text-sm transition-colors"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Search
          </button>
        </div>

        <AnimatePresence>
          {searchResults.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-2 pt-1"
            >
              {searchResults.map((r, i) => (
                <div key={i} className="bg-surface-2 rounded-xl p-3 border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-text-3">Result {i + 1}</span>
                    <span className="text-xs font-mono text-violet">
                      {(r.similarity * 100).toFixed(1)}% match
                    </span>
                  </div>
                  <p className="text-sm text-text-1 line-clamp-3">{r.content}</p>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Upload zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleUpload(e.dataTransfer.files); }}
        className={cn(
          "glass rounded-2xl border-2 border-dashed border-border p-8",
          "flex flex-col items-center justify-center gap-3 cursor-pointer",
          "hover:border-violet/50 hover:bg-violet/5 transition-colors",
          uploading && "opacity-60 pointer-events-none",
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.md,.pdf"
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
        {uploading ? (
          <Loader2 className="w-8 h-8 text-violet animate-spin" />
        ) : (
          <Upload className="w-8 h-8 text-text-3" />
        )}
        <div className="text-center">
          <p className="text-sm text-text-2 font-medium">
            {uploading ? "Uploading & embedding…" : "Drop files or click to upload"}
          </p>
          <p className="text-xs text-text-3 mt-1">PDF, TXT, Markdown — auto-chunked and embedded</p>
        </div>
      </div>

      {/* Document list */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-text-3 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" />Loading…
        </div>
      ) : documents.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-2 uppercase tracking-widest px-1">Documents</p>
          <AnimatePresence>
            {documents.map((doc: Document) => (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="flex items-center gap-3 glass rounded-xl px-4 py-3"
              >
                <FileText className="w-4 h-4 text-text-3 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-1 truncate">{doc.filename}</p>
                  <p className="text-xs text-text-3">{doc.content_type ?? "text"}</p>
                </div>
                <StatusIcon status={doc.status} />
                <span className={cn(
                  "text-xs px-2 py-0.5 rounded-full border",
                  doc.status === "ready" && "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
                  doc.status === "processing" && "bg-amber-400/10 text-amber-400 border-amber-400/20",
                  doc.status === "error" && "bg-rose-400/10 text-rose-400 border-rose-400/20",
                )}>
                  {doc.status}
                </span>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="text-text-3 hover:text-rose-400 transition-colors ml-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <EmptyState message="No documents yet. Upload a comp plan, playbook, or CRM export to ground your agents." />
      )}
    </div>
  );
}

const LOCAL_PROVIDERS = ["Ollama", "LM Studio", "LocalAI", "Other"];
const API_PROVIDERS   = ["OpenAI", "Anthropic", "xAI", "Groq", "Together AI", "Mistral", "Cohere", "Custom"];
const FETCHABLE_PROVIDERS = new Set(
  [...LOCAL_PROVIDERS, ...API_PROVIDERS.filter((p) => p !== "Custom")].map((p) => p.toLowerCase()),
);

function AiModelForm({
  values, onChange, showKey, onToggleKey, error, onSubmit, onCancel, saving, submitLabel,
}: {
  values: { name: string; type: string; provider: string; model_id: string; base_url: string; api_key: string; description: string };
  onChange: (k: string, v: string) => void;
  showKey: boolean; onToggleKey: () => void;
  error: string; onSubmit: () => void; onCancel: () => void;
  saving: boolean; submitLabel: string;
}) {
  const isLocal = values.type === "local";
  const isXai   = values.provider.toLowerCase() === "xai";
  const providers = isLocal ? LOCAL_PROVIDERS : API_PROVIDERS;

  const [availableModels, setAvailableModels] = useState<{ id: string; name: string }[]>([]);
  const [fetchingModels, setFetchingModels]   = useState(false);
  const [fetchError, setFetchError]           = useState("");
  const fetchTokenRef = useRef(0);

  const [pullName,    setPullName]    = useState("");
  const [pulling,     setPulling]     = useState(false);
  const [pullStatus,  setPullStatus]  = useState("");
  const [pullPct,     setPullPct]     = useState<number | null>(null);
  const [pullDone,    setPullDone]    = useState(false);
  const [pullError,   setPullError]   = useState("");

  const isOllama = values.provider.toLowerCase() === "ollama";

  const handlePull = async () => {
    if (!pullName.trim() || !values.base_url) return;
    setPulling(true); setPullStatus("Starting…"); setPullPct(null);
    setPullDone(false); setPullError("");
    await api.aiModels.pullOllama(
      pullName.trim(),
      values.base_url,
      (status, pct) => { setPullStatus(status); if (pct !== null) setPullPct(pct); },
      async () => {
        const pulled = pullName.trim();
        setPulling(false); setPullDone(true); setPullName("");
        onChange("model_id", pulled);
        if (!values.name) onChange("name", pulled);
        await fetchModels();
      },
      (err) => { setPulling(false); setPullError(err); },
    );
  };

  const canFetch = values.provider && FETCHABLE_PROVIDERS.has(values.provider.toLowerCase());
  const isLocalProvider = LOCAL_PROVIDERS.map((p) => p.toLowerCase()).includes(values.provider.toLowerCase());

  const fetchModels = async (overrideBaseUrl?: string, liveKey?: string) => {
    if (!canFetch) return;

    const token = ++fetchTokenRef.current;

    // xAI with an explicit key → live fetch from the provider API
    if (isXai && liveKey) {
      setFetchingModels(true);
      setFetchError("");
      try {
        const models = await api.aiModels.providerModelsWithKey("xAI", liveKey);
        if (fetchTokenRef.current !== token) return;
        setAvailableModels(models);
        if (models.length > 0 && !values.model_id) {
          onChange("model_id", models[0].id);
          if (!values.name) onChange("name", models[0].name);
        }
      } catch (e: unknown) {
        if (fetchTokenRef.current !== token) return;
        let msg = e instanceof Error ? e.message : "Failed to fetch models";
        const jsonMatch = msg.match(/: (\{.*\})/);
        if (jsonMatch) {
          try { const p = JSON.parse(jsonMatch[1]); if (p.detail) msg = p.detail; } catch { /* keep */ }
        }
        setFetchError(msg);
        setAvailableModels([]);
      } finally {
        if (fetchTokenRef.current === token) setFetchingModels(false);
      }
      return;
    }

    // All other cases (including xAI with no key) use the static/local GET endpoint
    let baseUrl = (overrideBaseUrl ?? values.base_url).trim();
    if (isLocalProvider) {
      if (!baseUrl) {
        setFetchError("Enter an endpoint URL first (e.g. http://localhost:11434)");
        return;
      }
      if (!/^https?:\/\//i.test(baseUrl)) {
        baseUrl = `http://${baseUrl}`;
        onChange("base_url", baseUrl);
      }
    }

    setFetchingModels(true);
    setFetchError("");
    try {
      const models = await api.aiModels.providerModels(
        values.provider,
        isLocalProvider ? baseUrl || undefined : undefined,
      );
      if (fetchTokenRef.current !== token) return;
      setAvailableModels(models);
      if (models.length > 0 && !values.model_id) {
        onChange("model_id", models[0].id);
        if (!values.name) onChange("name", models[0].name);
      }
    } catch (e: unknown) {
      if (fetchTokenRef.current !== token) return;
      let msg = e instanceof Error ? e.message : "Failed to fetch models";
      const jsonMatch = msg.match(/: (\{.*\})/);
      if (jsonMatch) {
        try { const p = JSON.parse(jsonMatch[1]); if (p.detail) msg = p.detail; } catch { /* keep */ }
      }
      setFetchError(msg);
      setAvailableModels([]);
    } finally {
      if (fetchTokenRef.current === token) setFetchingModels(false);
    }
  };

  // Auto-fetch when provider or type changes
  useEffect(() => {
    setAvailableModels([]);
    setFetchError("");

    if (!values.provider) return;

    let cancelled = false;

    if (!isLocalProvider) {
      // Clear any leftover local endpoint URL so it doesn't bleed into API providers
      onChange("base_url", "");
      if (canFetch) {
        fetchModels();
      }
    } else if (values.provider.toLowerCase() === "ollama" && canFetch) {
      api.config().then((cfg) => {
        if (cancelled) return;
        onChange("base_url", cfg.ollama_url);
        fetchModels(cfg.ollama_url);
      }).catch(() => {
        if (cancelled) return;
        if (values.base_url) fetchModels();
      });
    } else if (canFetch && values.base_url) {
      fetchModels();
    }

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.provider, values.type]);

  return (
    <div className="space-y-3">
      {/* Type toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => { onChange("type", "api"); onChange("base_url", ""); setAvailableModels([]); }}
          className={cn("flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors",
            !isLocal ? "border-violet/50 bg-violet/10 text-violet" : "border-border text-text-3 hover:text-text-2")}
        >
          <KeyRound className="w-3 h-3" /> API Key
        </button>
        <button
          onClick={() => { onChange("type", "local"); onChange("base_url", ""); setAvailableModels([]); }}
          className={cn("flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors",
            isLocal ? "border-cyan/50 bg-cyan/10 text-cyan" : "border-border text-text-3 hover:text-text-2")}
        >
          <Cpu className="w-3 h-3" /> Local / Open Source
        </button>
      </div>

      {/* Name + Provider */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-text-3">Name</label>
          <input value={values.name} onChange={(e) => onChange("name", e.target.value)}
            placeholder={isLocal ? "Llama 3.1 70B" : "GPT-4o"}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-violet" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-text-3">Provider</label>
          <select value={values.provider} onChange={(e) => onChange("provider", e.target.value)}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-1 outline-none focus:border-violet">
            <option value="">Select…</option>
            {providers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {/* Endpoint URL (local providers) — shown before model picker so fetch uses the URL */}
      {isLocal && (
        <div className="space-y-1">
          <label className="text-xs text-text-3">Endpoint URL</label>
          <input value={values.base_url} onChange={(e) => onChange("base_url", e.target.value)}
            placeholder="http://localhost:11434"
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-violet font-mono" />
        </div>
      )}

      {/* Model selector */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs text-text-3">Model</label>
          {canFetch && (
            <button
              onClick={() => fetchModels(undefined, isXai ? values.api_key.trim() || undefined : undefined)}
              disabled={fetchingModels}
              className="flex items-center gap-1 text-xs text-violet hover:text-violet/80 disabled:opacity-40 transition-colors"
            >
              {fetchingModels
                ? <><Loader2 className="w-3 h-3 animate-spin" /> Fetching…</>
                : <><RefreshCw className="w-3 h-3" /> {availableModels.length ? "Refresh" : "Fetch models"}</>}
            </button>
          )}
        </div>

        {availableModels.length > 0 ? (
          <select
            value={values.model_id}
            onChange={(e) => {
              onChange("model_id", e.target.value);
              if (!values.name && e.target.value) {
                const m = availableModels.find((m) => m.id === e.target.value);
                if (m) onChange("name", m.name);
              }
            }}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-1 outline-none focus:border-violet font-mono"
          >
            <option value="">Select a model…</option>
            {values.model_id && !availableModels.some((m) => m.id === values.model_id) && (
              <option value={values.model_id}>{values.model_id}</option>
            )}
            {availableModels.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        ) : (
          <input
            value={values.model_id}
            onChange={(e) => onChange("model_id", e.target.value)}
            placeholder={isLocal ? "llama3.1:70b" : "gpt-4o"}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-violet font-mono"
          />
        )}
        {fetchError && <p className="text-xs text-rose-400">{fetchError}</p>}
      </div>

      {/* Pull a model (Ollama only) */}
      {isOllama && (
        <div className="space-y-2 rounded-xl border border-border p-3 bg-surface-2/40">
          <p className="text-xs font-medium text-text-2">Pull a model</p>
          <div className="flex gap-2">
            <input
              value={pullName}
              onChange={(e) => { setPullName(e.target.value); setPullDone(false); setPullError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handlePull()}
              placeholder="llama3.2"
              disabled={pulling}
              className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-violet font-mono disabled:opacity-50"
            />
            <button
              onClick={handlePull}
              disabled={!pullName.trim() || pulling || !values.base_url}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan/20 hover:bg-cyan/35 text-cyan text-xs font-medium disabled:opacity-40 transition-colors shrink-0"
            >
              {pulling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {pulling ? "Pulling…" : "Pull"}
            </button>
          </div>
          {pulling && (
            <div className="space-y-1.5">
              <p className="text-xs text-text-3 font-mono">{pullStatus}</p>
              {pullPct !== null && (
                <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet to-cyan rounded-full transition-all duration-300"
                    style={{ width: `${pullPct}%` }}
                  />
                </div>
              )}
              {pullPct !== null && (
                <p className="text-xs text-text-3 text-right font-mono">{pullPct}%</p>
              )}
            </div>
          )}
          {pullDone && <p className="text-xs text-emerald-400">Pulled successfully — select it from the dropdown above.</p>}
          {pullError && <p className="text-xs text-rose-400">{pullError}</p>}
        </div>
      )}

      {/* Base URL for API providers */}
      {!isLocal && (
        <div className="space-y-1">
          <label className="text-xs text-text-3">Base URL (optional)</label>
          <input value={values.base_url} onChange={(e) => onChange("base_url", e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-violet font-mono" />
        </div>
      )}

      {/* API Key */}
      {!isLocal && (
        <div className="space-y-1">
          <label className="text-xs text-text-3">API Key</label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={values.api_key}
              onChange={(e) => onChange("api_key", e.target.value)}
              placeholder="sk-…"
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 pr-10 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-violet font-mono"
            />
            <button onClick={onToggleKey} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3 hover:text-text-2 transition-colors">
              {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}

      {/* Description */}
      <div className="space-y-1">
        <label className="text-xs text-text-3">Description (optional)</label>
        <input value={values.description} onChange={(e) => onChange("description", e.target.value)}
          placeholder="Primary reasoning model"
          className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-violet" />
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="flex gap-2">
        <button onClick={onSubmit} disabled={saving || !values.name.trim() || !values.model_id.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet/20 hover:bg-violet/35 text-violet text-sm font-medium disabled:opacity-40 transition-colors">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {submitLabel}
        </button>
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-text-3 hover:text-text-2 hover:bg-surface-2 text-sm transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

const EMPTY_FORM = { name: "", type: "api", provider: "", model_id: "", base_url: "", api_key: "", description: "" };

function AiModelsTab() {
  const { data: models = [], mutate, isLoading } = useSWR("ai-models", () => api.aiModels.list());

  const local = models.filter((m) => m.type === "local");
  const api_  = models.filter((m) => m.type === "api");

  // ── Create ────────────────────────────────────────────────────
  const [creating, setCreating] = useState(false);
  const [form, setForm]         = useState({ ...EMPTY_FORM });
  const [showKey, setShowKey]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [createError, setCreateError] = useState("");

  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleCreate = async () => {
    setSaving(true); setCreateError("");
    try {
      await api.aiModels.create({
        name: form.name.trim(), type: form.type, provider: form.provider,
        model_id: form.model_id.trim(),
        base_url: form.base_url.trim() || undefined,
        api_key: form.api_key.trim() || undefined,
        description: form.description.trim() || undefined,
      });
      mutate(); setCreating(false); setForm({ ...EMPTY_FORM }); setShowKey(false);
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : "Failed to add model");
    } finally { setSaving(false); }
  };

  // ── Edit ──────────────────────────────────────────────────────
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editForm, setEditForm]     = useState({ ...EMPTY_FORM });
  const [showEditKey, setShowEditKey] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError]   = useState("");

  const setEditField = (k: string, v: string) => setEditForm((f) => ({ ...f, [k]: v }));

  const startEdit = (m: AiModel) => {
    setEditingId(m.id);
    setEditForm({ name: m.name, type: m.type, provider: m.provider, model_id: m.model_id,
      base_url: m.base_url ?? "", api_key: "", description: m.description ?? "" });
    setEditError(""); setShowEditKey(false);
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    setEditSaving(true); setEditError("");
    try {
      const patch: Record<string, unknown> = {
        name: editForm.name.trim(), type: editForm.type, provider: editForm.provider,
        model_id: editForm.model_id.trim(),
        base_url: editForm.base_url.trim() || undefined,
        description: editForm.description.trim() || undefined,
      };
      if (editForm.api_key.trim()) patch.api_key = editForm.api_key.trim();
      await api.aiModels.update(editingId, patch);
      mutate(); setEditingId(null);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : "Failed to update model");
    } finally { setEditSaving(false); }
  };

  // ── Delete / toggle ───────────────────────────────────────────
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try { await api.aiModels.delete(id); mutate(); }
    catch (e) { console.error(e); }
    finally { setDeletingId(null); }
  };

  const handleToggle = async (m: AiModel) => {
    try { await api.aiModels.update(m.id, { enabled: !m.enabled }); mutate(); }
    catch (e) { console.error(e); }
  };

  const renderModelRow = (m: AiModel) => (
    <motion.div key={m.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
      className="glass rounded-xl px-4 py-3">
      {editingId === m.id ? (
        <AiModelForm values={editForm} onChange={setEditField} showKey={showEditKey}
          onToggleKey={() => setShowEditKey((v) => !v)} error={editError}
          onSubmit={handleUpdate} onCancel={() => setEditingId(null)}
          saving={editSaving} submitLabel="Save" />
      ) : (
        <div className="flex items-start gap-4">
          <button onClick={() => handleToggle(m)} title={m.enabled ? "Disable" : "Enable"}
            className={cn("relative mt-0.5 w-9 h-5 rounded-full transition-colors shrink-0",
              m.enabled ? "bg-emerald/60" : "bg-white/10")}>
            <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
              m.enabled ? "translate-x-4" : "translate-x-0.5")} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-text-1">{m.name}</p>
              <span className={cn("text-xs px-1.5 py-0.5 rounded border font-mono",
                m.type === "local" ? "bg-cyan/10 text-cyan border-cyan/20" : "bg-violet/10 text-violet border-violet/20")}>
                {m.type === "local" ? "local" : "api"}
              </span>
              <span className="text-xs text-text-3">{m.provider}</span>
              {m.api_key_set && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-emerald/10 text-emerald border border-emerald/20">key set</span>
              )}
            </div>
            <p className="text-xs text-text-3 font-mono mt-0.5">{m.model_id}</p>
            {m.base_url && <p className="text-xs text-text-3 font-mono mt-0.5 truncate">{m.base_url}</p>}
            {m.description && <p className="text-xs text-text-3 mt-0.5">{m.description}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => startEdit(m)} title="Edit"
              className="p-1.5 rounded-lg text-text-3 hover:text-text-2 hover:bg-surface-2 transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => handleDelete(m.id)} disabled={deletingId === m.id} title="Delete"
              className="p-1.5 rounded-lg text-text-3 hover:text-rose-400 disabled:opacity-40 transition-colors">
              {deletingId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );

  return (
    <div className="max-w-4xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-1">AI Models</h2>
          <p className="text-xs text-text-3 mt-0.5">
            {models.length} model{models.length !== 1 ? "s" : ""} configured
          </p>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet/20 hover:bg-violet/35 text-violet text-sm font-medium transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add model
          </button>
        )}
      </div>

      {/* Create form */}
      <AnimatePresence>
        {creating && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="glass rounded-2xl p-5 space-y-4">
            <p className="text-xs font-medium text-text-2 uppercase tracking-widest">Add Model</p>
            <AiModelForm values={form} onChange={setField} showKey={showKey}
              onToggleKey={() => setShowKey((v) => !v)} error={createError}
              onSubmit={handleCreate} onCancel={() => { setCreating(false); setForm({ ...EMPTY_FORM }); setCreateError(""); }}
              saving={saving} submitLabel="Add" />
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex items-center gap-2 text-text-3 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" />Loading…
        </div>
      ) : models.length === 0 ? (
        <EmptyState message="No AI models configured. Add an API key or a local model endpoint to get started." />
      ) : (
        <div className="space-y-6">
          {/* Local / open-source */}
          {local.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Cpu className="w-3.5 h-3.5 text-cyan" />
                <p className="text-xs font-medium text-text-2 uppercase tracking-widest">Local / Open Source</p>
              </div>
              <AnimatePresence>{local.map((m) => renderModelRow(m))}</AnimatePresence>
            </div>
          )}

          {/* API-key models */}
          {api_.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <KeyRound className="w-3.5 h-3.5 text-violet" />
                <p className="text-xs font-medium text-text-2 uppercase tracking-widest">API Key Models</p>
              </div>
              <AnimatePresence>{api_.map((m) => renderModelRow(m))}</AnimatePresence>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SettingsTab() {
  return (
    <div className="max-w-2xl space-y-8">
      {/* Platform */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-text-1">Platform</h2>
          <p className="text-xs text-text-3 mt-0.5">Read-only system information.</p>
        </div>
        <div className="glass rounded-2xl divide-y divide-border">
          {[
            { label: "API base",  value: "/api" },
            { label: "Version",   value: "0.2.0" },
            { label: "LLM model", value: "claude-sonnet-4-6" },
            { label: "Transport", value: "streamable_http" },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-text-3">{label}</span>
              <span className="text-xs text-text-2 font-mono">{value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Danger zone */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-rose-400">Danger Zone</h2>
          <p className="text-xs text-text-3 mt-0.5">Irreversible actions — proceed carefully.</p>
        </div>
        <div className="glass rounded-2xl px-4 py-3 border border-rose-400/20 flex items-center justify-between">
          <div>
            <p className="text-sm text-text-1 font-medium">Clear chat history</p>
            <p className="text-xs text-text-3 mt-0.5">Removes all threads stored in this browser.</p>
          </div>
          <button
            onClick={() => { localStorage.removeItem("lanara_threads"); window.location.reload(); }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 border border-rose-400/30 hover:bg-rose-400/10 transition-colors"
          >
            Clear
          </button>
        </div>
      </section>
    </div>
  );
}

// ── MCP Marketplace catalog ───────────────────────────────────────────────────

interface McpCatalogItem {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  transport: "streamable_http" | "sse" | "stdio";
  defaultUrl: string;
  githubUrl: string;
  tags: string[];
}

const CATALOG_CATEGORIES = ["All", "CRM", "Data", "Productivity", "Dev", "Search", "Communication", "AI"];

const CATEGORY_STYLES: Record<string, string> = {
  CRM:           "bg-violet/10 text-violet border-violet/20",
  Data:          "bg-cyan/10 text-cyan border-cyan/20",
  Productivity:  "bg-amber-400/10 text-amber-400 border-amber-400/20",
  Dev:           "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  Search:        "bg-white/5 text-text-2 border-white/10",
  Communication: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  AI:            "bg-rose-400/10 text-rose-400 border-rose-400/20",
};

const MCP_CATALOG: McpCatalogItem[] = [
  {
    id: "salesforce",
    name: "Salesforce",
    description: "Query CRM objects, opportunities, accounts, leads, and run SOQL against your Salesforce org.",
    category: "CRM",
    icon: "☁️",
    transport: "streamable_http",
    defaultUrl: "http://localhost:8010/mcp",
    githubUrl: "https://github.com/modelcontextprotocol/servers",
    tags: ["crm", "opportunities", "accounts"],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "Access deals, contacts, companies, and marketing pipelines from HubSpot CRM.",
    category: "CRM",
    icon: "🟠",
    transport: "streamable_http",
    defaultUrl: "http://localhost:8011/mcp",
    githubUrl: "https://github.com/hubspot/hubspot-mcp-server",
    tags: ["crm", "deals", "contacts"],
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "Query your PostgreSQL database using natural language — tables, views, and aggregations.",
    category: "Data",
    icon: "🐘",
    transport: "streamable_http",
    defaultUrl: "http://localhost:8012/mcp",
    githubUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres",
    tags: ["database", "sql", "analytics"],
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    description: "Read and write spreadsheets — comp plans, territory splits, and quota targets.",
    category: "Data",
    icon: "📊",
    transport: "streamable_http",
    defaultUrl: "http://localhost:8013/mcp",
    githubUrl: "https://github.com/modelcontextprotocol/servers",
    tags: ["spreadsheets", "comp plans", "quotas"],
  },
  {
    id: "sqlite",
    name: "SQLite",
    description: "Lightweight local database access for SPM prototyping and test datasets.",
    category: "Data",
    icon: "🗄️",
    transport: "stdio",
    defaultUrl: "http://localhost:8014/mcp",
    githubUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite",
    tags: ["database", "local"],
  },
  {
    id: "slack",
    name: "Slack",
    description: "Send quota alerts, clawback notices, and SPIF updates to Slack channels.",
    category: "Communication",
    icon: "💬",
    transport: "streamable_http",
    defaultUrl: "http://localhost:8015/mcp",
    githubUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/slack",
    tags: ["notifications", "messaging", "alerts"],
  },
  {
    id: "linear",
    name: "Linear",
    description: "Manage RevOps issues, sprints, and projects. Track comp plan changes and rollout tasks.",
    category: "Dev",
    icon: "📋",
    transport: "streamable_http",
    defaultUrl: "http://localhost:8016/mcp",
    githubUrl: "https://github.com/linear/linear-mcp-server",
    tags: ["issues", "projects", "planning"],
  },
  {
    id: "github",
    name: "GitHub",
    description: "Search repos, read files, manage issues, and review pull requests via the GitHub API.",
    category: "Dev",
    icon: "🐙",
    transport: "streamable_http",
    defaultUrl: "http://localhost:8017/mcp",
    githubUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/github",
    tags: ["code", "repos", "pull requests"],
  },
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Search and read files from Google Drive — comp plan docs, policies, territory maps.",
    category: "Productivity",
    icon: "📁",
    transport: "streamable_http",
    defaultUrl: "http://localhost:8018/mcp",
    githubUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive",
    tags: ["documents", "files", "google"],
  },
  {
    id: "notion",
    name: "Notion",
    description: "Query Notion pages and databases — runbooks, sales playbooks, onboarding docs.",
    category: "Productivity",
    icon: "📝",
    transport: "streamable_http",
    defaultUrl: "http://localhost:8019/mcp",
    githubUrl: "https://github.com/makenotion/notion-mcp-server",
    tags: ["docs", "knowledge", "wiki"],
  },
  {
    id: "brave-search",
    name: "Brave Search",
    description: "Real-time web search for market data, competitor intel, and industry benchmarks.",
    category: "Search",
    icon: "🔍",
    transport: "streamable_http",
    defaultUrl: "http://localhost:8020/mcp",
    githubUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search",
    tags: ["search", "web", "research"],
  },
  {
    id: "fetch",
    name: "Fetch",
    description: "Make HTTP requests to any REST API — CRM webhooks, payment processors, ERPs.",
    category: "Search",
    icon: "🌐",
    transport: "stdio",
    defaultUrl: "http://localhost:8021/mcp",
    githubUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
    tags: ["http", "api", "webhooks"],
  },
  {
    id: "memory",
    name: "Memory",
    description: "Persistent key-value store for agent memory — preferences, learned patterns, context.",
    category: "AI",
    icon: "🧠",
    transport: "stdio",
    defaultUrl: "http://localhost:8022/mcp",
    githubUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
    tags: ["memory", "persistence", "context"],
  },
  {
    id: "filesystem",
    name: "Filesystem",
    description: "Read, write, and search local files — attach comp plans, CSVs, and reports for analysis.",
    category: "Dev",
    icon: "📂",
    transport: "streamable_http",
    defaultUrl: "http://mcp-filesystem:8023/mcp",
    githubUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    tags: ["files", "local", "documents"],
  },
];

const TRANSPORTS = ["streamable_http", "sse", "stdio"];

function McpServersTab() {
  const { data: servers = [], mutate, isLoading } = useSWR(
    "mcp-servers",
    () => api.mcpServers.list(),
  );

  // ── Sub-view & marketplace ────────────────────────────────────
  const [mcpView, setMcpView] = useState<"marketplace" | "installed">("marketplace");
  const [categoryFilter, setCategoryFilter] = useState("All");

  const filteredCatalog = categoryFilter === "All"
    ? MCP_CATALOG
    : MCP_CATALOG.filter((item) => item.category === categoryFilter);

  const isInstalled = (item: McpCatalogItem) =>
    servers.some((s) => s.name.toLowerCase() === item.name.toLowerCase());

  // ── Create ────────────────────────────────────────────────────
  const [creating, setCreating]     = useState(false);
  const [newName,  setNewName]      = useState("");
  const [newUrl,   setNewUrl]       = useState("");
  const [newTransport, setNewTransport] = useState("streamable_http");
  const [newDesc,  setNewDesc]      = useState("");
  const [saving,   setSaving]       = useState(false);
  const [createError, setCreateError] = useState("");

  const applyPreset = (item: McpCatalogItem) => {
    setNewName(item.name);
    setNewUrl(item.defaultUrl);
    setNewTransport(item.transport);
    setNewDesc(item.description);
    setCreateError("");
    setCreating(true);
    setMcpView("installed");
  };

  const handleCreate = async () => {
    const name = newName.trim();
    const url  = newUrl.trim();
    if (!name || !url) return;
    setSaving(true);
    setCreateError("");
    try {
      await api.mcpServers.create({ name, url, transport: newTransport, description: newDesc.trim() || undefined });
      mutate();
      setCreating(false);
      setNewName(""); setNewUrl(""); setNewTransport("streamable_http"); setNewDesc("");
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : "Failed to create server");
    } finally {
      setSaving(false);
    }
  };

  const cancelCreate = () => {
    setCreating(false);
    setNewName(""); setNewUrl(""); setNewTransport("streamable_http"); setNewDesc("");
    setCreateError("");
  };

  // ── Edit ──────────────────────────────────────────────────────
  const [editingId,     setEditingId]    = useState<string | null>(null);
  const [editName,      setEditName]     = useState("");
  const [editUrl,       setEditUrl]      = useState("");
  const [editTransport, setEditTransport]= useState("");
  const [editDesc,      setEditDesc]     = useState("");
  const [editEnabled,   setEditEnabled]  = useState(true);
  const [editSaving,    setEditSaving]   = useState(false);
  const [editError,     setEditError]    = useState("");

  const startEdit = (s: McpServer) => {
    setEditingId(s.id);
    setEditName(s.name);
    setEditUrl(s.url);
    setEditTransport(s.transport);
    setEditDesc(s.description ?? "");
    setEditEnabled(s.enabled);
    setEditError("");
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    setEditSaving(true);
    setEditError("");
    try {
      await api.mcpServers.update(editingId, {
        name: editName.trim(),
        url: editUrl.trim(),
        transport: editTransport,
        description: editDesc.trim() || undefined,
        enabled: editEnabled,
      });
      mutate();
      setEditingId(null);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : "Failed to update server");
    } finally {
      setEditSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.mcpServers.delete(id);
      mutate();
    } catch (e) {
      console.error("Delete failed:", e);
    } finally {
      setDeletingId(null);
    }
  };

  // ── Toggle enabled ────────────────────────────────────────────
  const handleToggle = async (s: McpServer) => {
    try {
      await api.mcpServers.update(s.id, { enabled: !s.enabled });
      mutate();
    } catch (e) {
      console.error("Toggle failed:", e);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-1">MCP Servers</h2>
          <p className="text-xs text-text-3 mt-0.5">
            {servers.length} server{servers.length !== 1 ? "s" : ""} installed
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Sub-tab pills */}
          <div className="flex items-center bg-surface-2 rounded-lg p-0.5 border border-border">
            <button
              onClick={() => setMcpView("marketplace")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                mcpView === "marketplace" ? "bg-violet/20 text-violet" : "text-text-3 hover:text-text-2",
              )}
            >
              <Globe className="w-3 h-3" />
              Marketplace
            </button>
            <button
              onClick={() => setMcpView("installed")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                mcpView === "installed" ? "bg-white/10 text-text-1" : "text-text-3 hover:text-text-2",
              )}
            >
              Installed
              {servers.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-text-2 text-[10px] font-mono leading-none">
                  {servers.length}
                </span>
              )}
            </button>
          </div>
          {/* Add button — installed view only */}
          {mcpView === "installed" && !creating && (
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet/20 hover:bg-violet/35 text-violet text-sm font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add server
            </button>
          )}
        </div>
      </div>

      {/* ── Marketplace view ──────────────────────────────────────── */}
      {mcpView === "marketplace" && (
        <div className="space-y-5">
          {/* Category filter chips */}
          <div className="flex gap-2 flex-wrap">
            {CATALOG_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                  categoryFilter === cat
                    ? "bg-violet/20 border-violet/40 text-violet"
                    : "border-border text-text-3 hover:text-text-2 hover:border-white/20",
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Card grid */}
          <div className="grid grid-cols-2 gap-3">
            <AnimatePresence mode="popLayout">
              {filteredCatalog.map((item) => (
                <CatalogCard
                  key={item.id}
                  item={item}
                  installed={isInstalled(item)}
                  onInstall={() => applyPreset(item)}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* ── Installed view ────────────────────────────────────────── */}
      {mcpView === "installed" && (
        <div className="space-y-4">
          {/* Create form */}
          <AnimatePresence>
            {creating && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="glass rounded-2xl p-5 space-y-4"
              >
                <p className="text-xs font-medium text-text-2 uppercase tracking-widest">Configure Server</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-text-3">Name</label>
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="SPM Tools"
                      className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-violet"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-text-3">Transport</label>
                    <select
                      value={newTransport}
                      onChange={(e) => setNewTransport(e.target.value)}
                      className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-1 outline-none focus:border-violet"
                    >
                      {TRANSPORTS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-text-3">URL</label>
                  <input
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="http://mcp-spm:8001/mcp"
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-violet font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-text-3">Description (optional)</label>
                  <input
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Sales Performance Management tools"
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-violet"
                  />
                </div>
                {createError && <p className="text-xs text-rose-400">{createError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={handleCreate}
                    disabled={saving || !newName.trim() || !newUrl.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet/20 hover:bg-violet/35 text-violet text-sm font-medium disabled:opacity-40 transition-colors"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Add
                  </button>
                  <button onClick={cancelCreate} className="px-4 py-2 rounded-lg text-text-3 hover:text-text-2 hover:bg-surface-2 text-sm transition-colors">
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Google Drive connection panel */}
          {servers.some((s) => s.name.toLowerCase() === "google drive") && (
            <GoogleDrivePanel />
          )}

          {/* Server list */}
          {isLoading ? (
            <div className="flex items-center gap-2 text-text-3 text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" />Loading…
            </div>
          ) : servers.length === 0 && !creating ? (
            <EmptyState message="No MCP servers installed. Browse the Marketplace to discover and add open-source servers." />
          ) : (
            <div className="space-y-2">
              {servers.map((s) => (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  className="glass rounded-xl px-4 py-3"
                >
                  {editingId === s.id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs text-text-3">Name</label>
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-sm text-text-1 outline-none focus:border-violet"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-text-3">Transport</label>
                          <select
                            value={editTransport}
                            onChange={(e) => setEditTransport(e.target.value)}
                            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-sm text-text-1 outline-none focus:border-violet"
                          >
                            {TRANSPORTS.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-text-3">URL</label>
                        <input
                          value={editUrl}
                          onChange={(e) => setEditUrl(e.target.value)}
                          className="w-full bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-sm text-text-1 outline-none focus:border-violet font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-text-3">Description</label>
                        <input
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          className="w-full bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-sm text-text-1 outline-none focus:border-violet"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditEnabled((v) => !v)}
                          className={cn(
                            "relative w-9 h-5 rounded-full transition-colors shrink-0",
                            editEnabled ? "bg-emerald/60" : "bg-white/10",
                          )}
                        >
                          <span className={cn(
                            "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                            editEnabled ? "translate-x-4" : "translate-x-0.5",
                          )} />
                        </button>
                        <span className="text-xs text-text-3">{editEnabled ? "Enabled" : "Disabled"}</span>
                      </div>
                      {editError && <p className="text-xs text-rose-400">{editError}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={handleUpdate}
                          disabled={editSaving}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet/20 hover:bg-violet/35 text-violet text-xs font-medium disabled:opacity-40 transition-colors"
                        >
                          {editSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          Save
                        </button>
                        <button onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-lg text-text-3 hover:text-text-2 hover:bg-surface-2 text-xs transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-4">
                      <button
                        onClick={() => handleToggle(s)}
                        title={s.enabled ? "Disable" : "Enable"}
                        className={cn(
                          "relative mt-0.5 w-9 h-5 rounded-full transition-colors shrink-0",
                          s.enabled ? "bg-emerald/60" : "bg-white/10",
                        )}
                      >
                        <span className={cn(
                          "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                          s.enabled ? "translate-x-4" : "translate-x-0.5",
                        )} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-text-1">{s.name}</p>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-text-3 font-mono">
                            {s.transport}
                          </span>
                        </div>
                        <p className="text-xs text-text-3 font-mono mt-0.5 truncate">{s.url}</p>
                        {s.description && <p className="text-xs text-text-3 mt-0.5">{s.description}</p>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => startEdit(s)}
                          title="Edit"
                          className="p-1.5 rounded-lg text-text-3 hover:text-text-2 hover:bg-surface-2 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          disabled={deletingId === s.id}
                          title="Delete"
                          className="p-1.5 rounded-lg text-text-3 hover:text-rose-400 disabled:opacity-40 transition-colors"
                        >
                          {deletingId === s.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GoogleDrivePanel() {
  const { data: status, mutate, isLoading } = useSWR(
    "gdrive-status",
    () => api.integrations.googleDrive.status(),
    { refreshInterval: 0 },
  );
  const [connecting,    setConnecting]    = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connectError,  setConnectError]  = useState("");

  const connect = async () => {
    setConnecting(true);
    setConnectError("");
    try {
      const { auth_url } = await api.integrations.googleDrive.authUrl();
      const popup = window.open(auth_url, "google-drive-auth", "width=600,height=700,left=200,top=100");

      const handleMsg = (event: MessageEvent) => {
        if (event.data?.type === "google-drive-connected") {
          window.removeEventListener("message", handleMsg);
          clearInterval(closed);
          setConnecting(false);
          mutate();
        } else if (event.data?.type === "google-drive-error") {
          window.removeEventListener("message", handleMsg);
          clearInterval(closed);
          setConnecting(false);
          setConnectError(event.data.error || "Connection failed");
        }
      };
      window.addEventListener("message", handleMsg);

      const closed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(closed);
          window.removeEventListener("message", handleMsg);
          setConnecting(false);
          mutate();
        }
      }, 1000);
    } catch (e: unknown) {
      setConnecting(false);
      setConnectError(e instanceof Error ? e.message : "Failed to start connection");
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await api.integrations.googleDrive.disconnect();
      mutate();
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="rounded-xl border border-emerald/20 bg-emerald/5 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald/15 flex items-center justify-center shrink-0">
          <Globe className="w-4 h-4 text-emerald" />
        </div>
        <div>
          <p className="text-sm font-medium text-text-1">Google Drive Connection</p>
          <p className="text-xs text-text-3">Grant AI access to read your Drive documents</p>
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
              : <><ExternalLink className="w-3.5 h-3.5" /> Connect Google Drive</>}
          </button>
          <p className="text-xs text-text-3">
            Requires <span className="font-mono text-text-2">GOOGLE_CLIENT_ID</span> and{" "}
            <span className="font-mono text-text-2">GOOGLE_CLIENT_SECRET</span> to be set in your{" "}
            <span className="font-mono text-text-2">.env</span> file.
          </p>
        </div>
      )}

      {connectError && <p className="text-xs text-rose-400">{connectError}</p>}
    </div>
  );
}

function CatalogCard({
  item, installed, onInstall,
}: {
  item: McpCatalogItem;
  installed: boolean;
  onInstall: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="glass rounded-2xl p-4 flex flex-col gap-3"
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="text-xl shrink-0 mt-0.5">{item.icon}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-text-1">{item.name}</p>
              {installed && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 font-medium">
                  Installed
                </span>
              )}
            </div>
            <span className={cn(
              "inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded border font-medium",
              CATEGORY_STYLES[item.category] ?? "bg-white/5 text-text-2 border-white/10",
            )}>
              {item.category}
            </span>
          </div>
        </div>
        <a
          href={item.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="View on GitHub"
          className="text-text-3 hover:text-text-2 transition-colors shrink-0 mt-1"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Description */}
      <p className="text-xs text-text-3 leading-relaxed flex-1">{item.description}</p>

      {/* Bottom row */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-text-3 font-mono">
          {item.transport}
        </span>
        <button
          onClick={onInstall}
          disabled={installed}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
            installed
              ? "text-emerald-400 cursor-default"
              : "bg-violet/20 hover:bg-violet/35 text-violet",
          )}
        >
          {installed
            ? <><CheckCircle2 className="w-3 h-3" /> Installed</>
            : <><Plus className="w-3 h-3" /> Install</>}
        </button>
      </div>
    </motion.div>
  );
}

function StatusIcon({ status }: { status: Document["status"] }) {
  if (status === "ready") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
  if (status === "error") return <AlertCircle className="w-3.5 h-3.5 text-rose-400" />;
  return <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />;
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
