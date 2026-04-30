"use client";

import { useRef, useState, useEffect, useReducer, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  BookOpen, Upload, Trash2, Search, RefreshCw,
  FileText, AlertCircle, CheckCircle2, Loader2,
  Plus, Pencil, Check, X, Eye, EyeOff, Cpu, KeyRound, Download,
  Globe, ExternalLink, Sparkles, HardDrive,
  ChevronDown, ChevronRight, Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/layout/Sidebar";
import { api, type BusinessUnit, type Document, type SearchResult, type McpServer, type McpTool, type AiModel, type ApiProvider } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/contexts/auth";
import { removeOrgItem } from "@/lib/org-storage";
import { MembersTab } from "@/components/admin/MembersTab";
import { RolesTab } from "@/components/admin/RolesTab";
import { AuditLogTab } from "@/components/admin/AuditLogTab";
import { SessionsTab } from "@/components/admin/SessionsTab";
import { SsoTab } from "@/components/admin/SsoTab";
import { OrgSettingsTab } from "@/components/admin/OrgSettingsTab";
import { PlatformSettingsTab } from "@/components/admin/PlatformSettingsTab";

type GroupId = "intelligence" | "knowledge" | "settings" | "team" | "security";

const GROUPS: { id: GroupId; label: string }[] = [
  { id: "intelligence", label: "Intelligence" },
  { id: "knowledge",    label: "Knowledge" },
  { id: "settings",     label: "Settings" },
  { id: "team",         label: "Team" },
  { id: "security",     label: "Security" },
];

const SUB_TABS: Record<GroupId, { id: string; label: string }[]> = {
  intelligence: [
    { id: "ai",  label: "AI Models" },
    { id: "mcp", label: "MCP Servers" },
  ],
  knowledge: [],
  settings: [
    { id: "org",        label: "Organization" },
    { id: "workspaces", label: "Workspaces" },
    { id: "platform",   label: "Platform" },
  ],
  team: [
    { id: "members", label: "Members" },
    { id: "roles",   label: "Roles" },
  ],
  security: [
    { id: "sso",      label: "SSO" },
    { id: "sessions", label: "Sessions" },
    { id: "audit",    label: "Audit Log" },
  ],
};

const DEFAULT_SUB: Record<GroupId, string> = {
  intelligence: "ai",
  knowledge:    "",
  settings:     "org",
  team:         "members",
  security:     "sso",
};

const TAB_PARAM_MAP: Record<string, { group: GroupId; sub: string }> = {
  ai:           { group: "intelligence", sub: "ai" },
  mcp:          { group: "intelligence", sub: "mcp" },
  knowledge:    { group: "knowledge",    sub: "" },
  settings:     { group: "settings",     sub: "platform" },
  org:          { group: "settings",     sub: "org" },
  workspaces:   { group: "settings",     sub: "workspaces" },
  members:      { group: "team",         sub: "members" },
  roles:        { group: "team",         sub: "roles" },
  sso:          { group: "security",     sub: "sso" },
  sessions:     { group: "security",     sub: "sessions" },
  audit:        { group: "security",     sub: "audit" },
  intelligence: { group: "intelligence", sub: "ai" },
  team:         { group: "team",         sub: "members" },
  security:     { group: "security",     sub: "sso" },
};

export default function AdminPage() {
  return (
    <Suspense>
      <AdminPageInner />
    </Suspense>
  );
}

function AdminPageInner() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialNav = TAB_PARAM_MAP[tabParam ?? ""] ?? { group: "intelligence" as GroupId, sub: "ai" };

  const [activeGroup, setActiveGroup] = useState<GroupId>(initialNav.group);
  const [activeSubTab, setActiveSubTab] = useState(initialNav.sub);

  useEffect(() => {
    const param = searchParams.get("tab");
    const nav = TAB_PARAM_MAP[param ?? ""] ?? { group: "intelligence" as GroupId, sub: "ai" };
    setActiveGroup(nav.group);
    setActiveSubTab(nav.sub);
  }, [searchParams]);

  const subTabs = SUB_TABS[activeGroup];

  return (
    <div className="flex h-screen bg-surface-0 overflow-hidden">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Main tab bar */}
        <div className="flex items-end gap-1 px-6 border-b border-border shrink-0">
          {GROUPS.map((group) => (
            <button
              key={group.id}
              onClick={() => {
                setActiveGroup(group.id);
                setActiveSubTab(DEFAULT_SUB[group.id]);
              }}
              className={cn(
                "px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeGroup === group.id
                  ? "border-violet text-violet"
                  : "border-transparent text-text-3 hover:text-text-2",
              )}
            >
              {group.label}
            </button>
          ))}
        </div>

        {/* Sub-tab pill row */}
        {subTabs.length > 0 && (
          <div className="flex items-center gap-1 px-6 py-2 border-b border-border shrink-0">
            {subTabs.map((sub) => (
              <button
                key={sub.id}
                onClick={() => setActiveSubTab(sub.id)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                  activeSubTab === sub.id
                    ? "bg-surface-2 text-text-1"
                    : "text-text-3 hover:text-text-2",
                )}
              >
                {sub.label}
              </button>
            ))}
          </div>
        )}

        {/* Tab content */}
        <main className="flex-1 overflow-y-auto">
          {activeGroup === "intelligence" && activeSubTab === "ai"  && <div className="p-6"><AiModelsTab /></div>}
          {activeGroup === "intelligence" && activeSubTab === "mcp" && <div className="p-6"><McpServersTab /></div>}
          {activeGroup === "knowledge"                                   && <div className="p-6"><KnowledgeSourcesTab /></div>}
          {activeGroup === "settings"     && activeSubTab === "org"        && <OrgSettingsTab />}
          {activeGroup === "settings"     && activeSubTab === "workspaces" && <div className="p-6"><WorkspacesTab /></div>}
          {activeGroup === "settings"     && activeSubTab === "platform"   && <div className="p-6"><PlatformSettingsTab /></div>}
          {activeGroup === "team"         && activeSubTab === "members"  && <MembersTab />}
          {activeGroup === "team"         && activeSubTab === "roles"    && <RolesTab />}
          {activeGroup === "security"     && activeSubTab === "sso"      && <SsoTab />}
          {activeGroup === "security"     && activeSubTab === "sessions" && <SessionsTab />}
          {activeGroup === "security"     && activeSubTab === "audit"    && <AuditLogTab />}
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
  const { currentOrg: knowledgeOrg } = useAuth();

  const { data: units = [] } = useSWR(
    knowledgeOrg ? ["business-units-admin", knowledgeOrg.id] : null,
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
const API_PROVIDERS   = ["OpenAI", "Anthropic", "xAI", "Groq", "OpenRouter", "Mistral", "Fireworks AI", "DeepSeek", "Cerebras", "NVIDIA NIM", "Scaleway", "GitHub Models", "Together AI", "Cohere", "Custom"];
const FETCHABLE_PROVIDERS = new Set(
  [...LOCAL_PROVIDERS, ...API_PROVIDERS.filter((p) => p !== "Custom")].map((p) => p.toLowerCase()),
);

// ── Open-source model catalog ─────────────────────────────────────────────

interface ModelCatalogItem {
  id: string;
  name: string;
  family: string;
  ollamaId: string;
  params: string;
  size: string;
  description: string;
  category: string;
  tags: string[];
  recommended?: boolean;
}

const MODEL_CATEGORIES = ["All", "Chat", "Coding", "Reasoning", "Vision", "Embedding"];

const MODEL_CATEGORY_STYLES: Record<string, string> = {
  Chat:      "bg-violet/10 text-violet border-violet/20",
  Coding:    "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  Reasoning: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  Vision:    "bg-cyan/10 text-cyan border-cyan/20",
  Embedding: "bg-white/5 text-text-2 border-white/10",
};

const MODEL_CATALOG: ModelCatalogItem[] = [
  {
    id: "llama32-1b", name: "Llama 3.2 1B", family: "Meta",
    ollamaId: "llama3.2:1b", params: "1B", size: "1.3 GB",
    description: "Meta's smallest Llama — ultra-fast for classification, Q&A, and lightweight summarization. Ideal for edge or CPU-only setups.",
    category: "Chat", tags: ["Fast", "Small"],
  },
  {
    id: "llama32-3b", name: "Llama 3.2 3B", family: "Meta",
    ollamaId: "llama3.2:3b", params: "3B", size: "2.0 GB",
    description: "Best balance of speed and quality for everyday tasks. Runs comfortably on consumer GPUs and Apple Silicon.",
    category: "Chat", tags: ["Fast", "Balanced"], recommended: true,
  },
  {
    id: "llama31-8b", name: "Llama 3.1 8B", family: "Meta",
    ollamaId: "llama3.1:8b", params: "8B", size: "4.7 GB",
    description: "Meta's flagship efficient model. Strong reasoning, code, and conversation with 128k context support.",
    category: "Chat", tags: ["Balanced"], recommended: true,
  },
  {
    id: "llama31-70b", name: "Llama 3.1 70B", family: "Meta",
    ollamaId: "llama3.1:70b", params: "70B", size: "40 GB",
    description: "Near frontier-level quality for complex reasoning, long context, and enterprise workloads. Requires 48 GB+ VRAM.",
    category: "Chat", tags: ["Large", "Powerful"],
  },
  {
    id: "mistral-7b", name: "Mistral 7B", family: "Mistral AI",
    ollamaId: "mistral:7b", params: "7B", size: "4.1 GB",
    description: "Efficient and capable general-purpose model with excellent instruction following and coding ability.",
    category: "Chat", tags: ["Balanced"],
  },
  {
    id: "mixtral-8x7b", name: "Mixtral 8x7B", family: "Mistral AI",
    ollamaId: "mixtral:8x7b", params: "47B (MoE)", size: "26 GB",
    description: "Mixture-of-experts model — activates only 13B params per token, delivering high quality at efficient inference.",
    category: "Chat", tags: ["Large", "MoE"],
  },
  {
    id: "qwen25-7b", name: "Qwen 2.5 7B", family: "Alibaba",
    ollamaId: "qwen2.5:7b", params: "7B", size: "4.4 GB",
    description: "Strong multilingual model excelling at math, coding, and structured reasoning across 29+ languages.",
    category: "Chat", tags: ["Multilingual", "Balanced"],
  },
  {
    id: "qwen25-14b", name: "Qwen 2.5 14B", family: "Alibaba",
    ollamaId: "qwen2.5:14b", params: "14B", size: "9.0 GB",
    description: "Larger Qwen with improved reasoning across all domains. Great multilingual coverage.",
    category: "Chat", tags: ["Large", "Multilingual"],
  },
  {
    id: "gemma2-2b", name: "Gemma 2 2B", family: "Google",
    ollamaId: "gemma2:2b", params: "2B", size: "1.6 GB",
    description: "Google's lightweight model for edge deployment. Surprisingly capable for its tiny footprint.",
    category: "Chat", tags: ["Fast", "Small"],
  },
  {
    id: "gemma2-9b", name: "Gemma 2 9B", family: "Google",
    ollamaId: "gemma2:9b", params: "9B", size: "5.5 GB",
    description: "Google's balanced open model with strong performance across language tasks and instruction following.",
    category: "Chat", tags: ["Balanced"],
  },
  {
    id: "phi35-mini", name: "Phi 3.5 Mini", family: "Microsoft",
    ollamaId: "phi3.5:3.8b", params: "3.8B", size: "2.2 GB",
    description: "Microsoft's compact reasoning specialist. Exceptional math and logic performance given its tiny footprint.",
    category: "Reasoning", tags: ["Fast", "Small"],
  },
  {
    id: "phi4-14b", name: "Phi 4", family: "Microsoft",
    ollamaId: "phi4:14b", params: "14B", size: "9.1 GB",
    description: "Microsoft's best open reasoning model. Tops benchmarks in STEM, math, and complex problem-solving.",
    category: "Reasoning", tags: ["Large"], recommended: true,
  },
  {
    id: "deepseek-r1-7b", name: "DeepSeek R1 7B", family: "DeepSeek",
    ollamaId: "deepseek-r1:7b", params: "7B", size: "4.7 GB",
    description: "Reasoning model with visible chain-of-thought. Strong at math, logic, and multi-step analytical tasks.",
    category: "Reasoning", tags: ["Balanced"],
  },
  {
    id: "deepseek-r1-14b", name: "DeepSeek R1 14B", family: "DeepSeek",
    ollamaId: "deepseek-r1:14b", params: "14B", size: "9.0 GB",
    description: "Larger reasoning model delivering frontier-quality chain-of-thought for complex problems.",
    category: "Reasoning", tags: ["Large"], recommended: true,
  },
  {
    id: "codellama-7b", name: "Code Llama 7B", family: "Meta",
    ollamaId: "codellama:7b", params: "7B", size: "3.8 GB",
    description: "Specialized code model fine-tuned from Llama. Supports Python, JS, Go, Rust, and 10+ languages.",
    category: "Coding", tags: ["Fast"],
  },
  {
    id: "qwen25-coder-7b", name: "Qwen 2.5 Coder 7B", family: "Alibaba",
    ollamaId: "qwen2.5-coder:7b", params: "7B", size: "4.7 GB",
    description: "State-of-the-art open code model. Tops coding benchmarks in completion, debugging, and review.",
    category: "Coding", tags: ["Balanced"], recommended: true,
  },
  {
    id: "deepseek-coder-67b", name: "DeepSeek Coder 6.7B", family: "DeepSeek",
    ollamaId: "deepseek-coder:6.7b", params: "6.7B", size: "3.8 GB",
    description: "Fast code specialist trained on 2T tokens. Excellent at completion and fill-in-the-middle tasks.",
    category: "Coding", tags: ["Fast"],
  },
  {
    id: "llava-7b", name: "LLaVA 7B", family: "Liu et al.",
    ollamaId: "llava:7b", params: "7B", size: "4.5 GB",
    description: "Visual language model that understands images alongside text. Great for document and chart analysis.",
    category: "Vision", tags: ["Balanced"],
  },
  {
    id: "llava-13b", name: "LLaVA 13B", family: "Liu et al.",
    ollamaId: "llava:13b", params: "13B", size: "8.0 GB",
    description: "Larger vision model with improved accuracy for complex image understanding and OCR tasks.",
    category: "Vision", tags: ["Large"],
  },
  {
    id: "nomic-embed-text", name: "Nomic Embed Text", family: "Nomic AI",
    ollamaId: "nomic-embed-text", params: "137M", size: "274 MB",
    description: "High-quality text embedding model for semantic search and RAG pipelines. Runs on CPU, sub-second inference.",
    category: "Embedding", tags: ["Fast", "Small"],
  },
];


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
          <label className="text-xs text-text-3">API Key <span className="text-rose-400">*</span></label>
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
        <button onClick={onSubmit} disabled={saving || !values.name.trim() || !values.model_id.trim() || (!isLocal && !values.api_key.trim())}
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

// ── API provider catalog used by the Connect form ──────────────────────────

const CONNECT_PROVIDER_CATALOG = [
  { name: "anthropic",     displayName: "Anthropic",    icon: "🟠", placeholder: "sk-ant-..."  },
  { name: "openai",        displayName: "OpenAI",       icon: "🔮", placeholder: "sk-..."       },
  { name: "groq",          displayName: "Groq",         icon: "⚡", placeholder: "gsk_..."     },
  { name: "xai",           displayName: "xAI (Grok)",   icon: "✕",  placeholder: "xai-..."     },
  { name: "openrouter",    displayName: "OpenRouter",   icon: "🔀", placeholder: "sk-or-..."   },
  { name: "mistral",       displayName: "Mistral AI",   icon: "🌊", placeholder: "..."          },
  { name: "together ai",   displayName: "Together AI",  icon: "🤝", placeholder: "..."          },
  { name: "fireworks ai",  displayName: "Fireworks AI", icon: "🎆", placeholder: "fw_..."      },
  { name: "deepseek",      displayName: "DeepSeek",     icon: "🔍", placeholder: "sk-..."       },
  { name: "cerebras",      displayName: "Cerebras",     icon: "🧠", placeholder: "csk-..."     },
  { name: "nvidia nim",    displayName: "NVIDIA NIM",   icon: "🟢", placeholder: "nvapi-..."   },
  { name: "scaleway",      displayName: "Scaleway",     icon: "🇪🇺", placeholder: "..."         },
  { name: "github models", displayName: "GitHub Models",icon: "🐙", placeholder: "ghp_..."     },
  { name: "cohere",        displayName: "Cohere",       icon: "🎯", placeholder: "..."          },
];

const PROVIDER_ICONS: Record<string, string> = Object.fromEntries(
  CONNECT_PROVIDER_CATALOG.map((p) => [p.name, p.icon])
);

function ProviderRow({
  provider, onSynced, onDeleted,
}: {
  provider: ApiProvider;
  onSynced: () => void;
  onDeleted: () => void;
}) {
  const [syncing,  setSyncing]  = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try { await api.apiProviders.sync(provider.id); onSynced(); }
    catch (e) { console.error(e); }
    finally { setSyncing(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try { await api.apiProviders.delete(provider.id); onDeleted(); }
    catch (e) { console.error(e); }
    finally { setDeleting(false); }
  };

  return (
    <motion.div layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
      className="glass rounded-xl px-4 py-3 flex items-center gap-4">
      <span className="text-xl shrink-0">{PROVIDER_ICONS[provider.name] ?? "🔌"}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-text-1">{provider.display_name}</p>
          <span className={cn(
            "text-xs px-1.5 py-0.5 rounded border",
            provider.status === "connected"
              ? "bg-emerald/10 text-emerald border-emerald/20"
              : provider.status === "invalid"
              ? "bg-rose-400/10 text-rose-400 border-rose-400/20"
              : "bg-amber-400/10 text-amber-400 border-amber-400/20",
          )}>
            {provider.status === "connected" ? "Connected" : provider.status === "invalid" ? "Invalid key" : "Error"}
          </span>
          <span className="text-xs text-text-3">
            {provider.model_count} model{provider.model_count !== 1 ? "s" : ""}
          </span>
        </div>
        {provider.last_synced_at && (
          <p className="text-xs text-text-3 mt-0.5">
            Last synced {new Date(provider.last_synced_at).toLocaleDateString()}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={handleSync} disabled={syncing} title="Sync models"
          className="p-1.5 rounded-lg text-text-3 hover:text-violet hover:bg-surface-2 disabled:opacity-40 transition-colors">
          {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </button>
        <button onClick={handleDelete} disabled={deleting} title="Disconnect"
          className="p-1.5 rounded-lg text-text-3 hover:text-rose-400 disabled:opacity-40 transition-colors">
          {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </motion.div>
  );
}

function ProvidersView({
  providers, mutate, mutateModels,
}: {
  providers: ApiProvider[];
  mutate: () => void;
  mutateModels: () => void;
}) {
  const [selectedProvider, setSelectedProvider] = useState("");
  const [apiKey,           setApiKey]           = useState("");
  const [showKey,          setShowKey]          = useState(false);
  const [connecting,       setConnecting]       = useState(false);
  const [connectError,     setConnectError]     = useState("");
  const [connectSuccess,   setConnectSuccess]   = useState("");

  const placeholder = CONNECT_PROVIDER_CATALOG.find((p) => p.name === selectedProvider)?.placeholder ?? "API key…";

  const handleConnect = async () => {
    if (!selectedProvider || !apiKey.trim()) return;
    setConnecting(true); setConnectError(""); setConnectSuccess("");
    try {
      const result = await api.apiProviders.connect({ name: selectedProvider, api_key: apiKey.trim() });
      mutate(); mutateModels();
      setConnectSuccess(`${result.display_name} connected — ${result.model_count} models added`);
      setApiKey(""); setSelectedProvider("");
    } catch (e: unknown) {
      let msg = e instanceof Error ? e.message : "Connection failed";
      const jsonMatch = msg.match(/: (\{.*\})/);
      if (jsonMatch) { try { const p = JSON.parse(jsonMatch[1]); if (p.detail) msg = p.detail; } catch { /* keep */ } }
      setConnectError(msg);
    } finally { setConnecting(false); }
  };

  return (
    <div className="space-y-6">
      {/* Connect form */}
      <div className="glass rounded-2xl p-5 space-y-4">
        <p className="text-xs font-medium text-text-2 uppercase tracking-widest">Connect a Provider</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-text-3">Provider</label>
            <select
              value={selectedProvider}
              onChange={(e) => { setSelectedProvider(e.target.value); setConnectError(""); setConnectSuccess(""); }}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-1 outline-none focus:border-violet"
            >
              <option value="">Select provider…</option>
              {CONNECT_PROVIDER_CATALOG.map((p) => (
                <option key={p.name} value={p.name}>{p.icon} {p.displayName}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-text-3">API Key</label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setConnectError(""); setConnectSuccess(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                placeholder={placeholder}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 pr-10 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-violet font-mono"
              />
              <button onClick={() => setShowKey((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3 hover:text-text-2 transition-colors">
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
        {connectError   && <p className="text-xs text-rose-400">{connectError}</p>}
        {connectSuccess && <p className="text-xs text-emerald-400 flex items-center gap-1"><Check className="w-3 h-3" />{connectSuccess}</p>}
        <button
          onClick={handleConnect}
          disabled={!selectedProvider || !apiKey.trim() || connecting}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet/20 hover:bg-violet/35 text-violet text-sm font-medium disabled:opacity-40 transition-colors"
        >
          {connecting
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting…</>
            : <><Check className="w-3.5 h-3.5" /> Connect</>}
        </button>
      </div>

      {/* Connected list */}
      {providers.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-2 uppercase tracking-widest px-1">Connected</p>
          <AnimatePresence>
            {providers.map((p) => (
              <ProviderRow
                key={p.id}
                provider={p}
                onSynced={() => { mutate(); mutateModels(); }}
                onDeleted={() => { mutate(); mutateModels(); }}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {providers.length === 0 && !connecting && (
        <EmptyState message="No API providers connected yet. Select a provider above and enter your API key to connect." />
      )}
    </div>
  );
}

function OllamaQueueBadge({ modelId, baseUrl }: { modelId: string; baseUrl: string | null }) {
  const { data } = useSWR(
    ["ollama-queue", baseUrl ?? "default"],
    () => api.aiModels.ollamaQueue(baseUrl ?? undefined),
    { refreshInterval: 2000, dedupingInterval: 1500 },
  );

  // Only render if this model appears in /api/ps (currently loaded in Ollama)
  if (!data) return null;
  if (!(modelId in data.models)) return null;

  const { processing, pending } = data.models[modelId];
  const total = processing + pending;

  return (
    <span className={cn(
      "text-xs px-1.5 py-0.5 rounded border font-medium tabular-nums",
      total > 0
        ? "bg-amber/15 border-amber/30 text-amber"
        : "bg-white/5 border-white/10 text-text-3",
    )}>
      {total === 0 && "idle"}
      {total > 0 && pending === 0 && `${processing} processing`}
      {total > 0 && pending > 0 && `${processing} processing · ${pending} queued`}
    </span>
  );
}

function ModelRow({ model, onToggle, onDelete, onRoleChange, onUpdate }: {
  model: AiModel;
  onToggle: () => void;
  onDelete?: () => void;
  onRoleChange?: () => void;
  onUpdate?: () => void;
}) {
  const [settingRole, setSettingRole] = useState(false);
  const [updatingConcurrency, setUpdatingConcurrency] = useState(false);
  const isComms = model.role === "comms_model";
  const concurrency = model.max_concurrent ?? 1;

  const setConcurrency = async (val: number) => {
    const clamped = Math.max(1, Math.min(8, val));
    if (clamped === concurrency || updatingConcurrency) return;
    setUpdatingConcurrency(true);
    try {
      await api.aiModels.update(model.id, { max_concurrent: clamped });
      onUpdate?.();
    } finally {
      setUpdatingConcurrency(false);
    }
  };

  const toggleCommsRole = async () => {
    setSettingRole(true);
    try {
      await api.aiModels.setRole(model.id, isComms ? null : "comms_model");
      onRoleChange?.();
    } finally {
      setSettingRole(false);
    }
  };

  return (
    <motion.div layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
      className="glass rounded-xl px-4 py-3 flex items-center gap-4">
      <button onClick={onToggle} title={model.enabled ? "Disable" : "Enable"}
        className={cn("relative w-9 h-5 rounded-full transition-colors shrink-0 mt-0.5",
          model.enabled ? "bg-emerald/60" : "bg-white/10")}>
        <span className={cn("absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200",
          model.enabled ? "translate-x-4" : "translate-x-0")} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-text-1">{model.name}</p>
          <span className="text-xs text-text-3 capitalize">{model.provider}</span>
          {isComms && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-cyan/15 border border-cyan/30 text-cyan font-medium">
              Comms
            </span>
          )}
          {model.type === "local" && <OllamaQueueBadge modelId={model.model_id} baseUrl={model.base_url} />}
          {model.type === "local" && (
            <div className="flex items-center gap-1 shrink-0" title="Concurrent inference slots">
              <button
                onClick={() => setConcurrency(concurrency - 1)}
                disabled={concurrency <= 1 || updatingConcurrency}
                className="w-5 h-5 flex items-center justify-center rounded text-text-3 hover:text-text-1 hover:bg-white/10 disabled:opacity-30 transition-colors text-xs"
              >−</button>
              <span className="text-xs tabular-nums text-text-2 w-4 text-center">{concurrency}</span>
              <button
                onClick={() => setConcurrency(concurrency + 1)}
                disabled={concurrency >= 8 || updatingConcurrency}
                className="w-5 h-5 flex items-center justify-center rounded text-text-3 hover:text-text-1 hover:bg-white/10 disabled:opacity-30 transition-colors text-xs"
              >+</button>
              <span className="text-xs text-text-3">slots</span>
            </div>
          )}
          {model.context_window && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-text-3">
              {model.context_window >= 1000
                ? `${(model.context_window / 1000).toFixed(model.context_window % 1000 === 0 ? 0 : 0)}k`
                : model.context_window}{" "}ctx
            </span>
          )}
          {model.capabilities?.map((cap) => (
            <span key={cap} className="text-xs px-1.5 py-0.5 rounded bg-violet/10 text-violet border border-violet/20 capitalize">
              {cap}
            </span>
          ))}
        </div>
        <p className="text-xs text-text-3 font-mono mt-0.5">{model.model_id}</p>
      </div>
      <button
        onClick={toggleCommsRole}
        disabled={settingRole}
        title={isComms ? "Remove Comms model role" : "Set as Comms model"}
        className={cn(
          "text-xs px-2.5 py-1 rounded-lg border transition-colors shrink-0 disabled:opacity-40",
          isComms
            ? "border-cyan/40 bg-cyan/10 text-cyan hover:bg-rose-400/10 hover:border-rose-400/40 hover:text-rose-400"
            : "border-white/10 text-text-3 hover:border-cyan/40 hover:text-cyan hover:bg-cyan/10",
        )}
      >
        {isComms ? "Comms ✓" : "Set Comms"}
      </button>
      {onDelete && (
        <button onClick={onDelete} title="Remove model"
          className="text-text-3 hover:text-rose-400 transition-colors shrink-0 p-0.5">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </motion.div>
  );
}

function ModelsView({ models, mutate, loading }: { models: AiModel[]; mutate: () => void; loading: boolean }) {
  const [filterProvider, setFilterProvider] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<AiModel | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const providerNames = [...new Set(models.map((m) => m.provider))].sort();
  const filtered = filterProvider === "all" ? models : models.filter((m) => m.provider === filterProvider);
  const apiModels   = filtered.filter((m) => m.type === "api");
  const localModels = filtered.filter((m) => m.type === "local");

  const handleToggle = async (m: AiModel) => {
    try { await api.aiModels.update(m.id, { enabled: !m.enabled }); mutate(); }
    catch (e) { console.error(e); }
  };

  const handleDelete = async (m: AiModel, uninstall: boolean) => {
    setDeleting(true);
    setDeleteError("");
    try {
      await api.aiModels.delete(m.id, uninstall);
      setDeleteTarget(null);
      mutate();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to remove model");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return (
    <div className="flex items-center gap-2 text-text-3 text-sm">
      <RefreshCw className="w-4 h-4 animate-spin" />Loading…
    </div>
  );

  if (models.length === 0) return (
    <EmptyState message="No models yet. Connect an API provider in the Providers tab, or download a local model from the Open Source tab." />
  );

  return (
    <div className="space-y-5">
      {/* Provider filter */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFilterProvider("all")}
          className={cn("px-3 py-1 rounded-full text-xs font-medium border transition-colors",
            filterProvider === "all" ? "bg-violet/20 border-violet/40 text-violet" : "border-border text-text-3 hover:text-text-2")}>
          All ({models.length})
        </button>
        {providerNames.map((p) => (
          <button key={p} onClick={() => setFilterProvider(p)}
            className={cn("px-3 py-1 rounded-full text-xs font-medium border transition-colors capitalize",
              filterProvider === p ? "bg-violet/20 border-violet/40 text-violet" : "border-border text-text-3 hover:text-text-2")}>
            {p} ({models.filter((m) => m.provider === p).length})
          </button>
        ))}
      </div>

      {apiModels.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <KeyRound className="w-3.5 h-3.5 text-violet" />
            <p className="text-xs font-medium text-text-2 uppercase tracking-widest">API Models</p>
          </div>
          <AnimatePresence>
            {apiModels.map((m) => <ModelRow key={m.id} model={m} onToggle={() => handleToggle(m)} onRoleChange={mutate} />)}
          </AnimatePresence>
        </div>
      )}

      {localModels.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Cpu className="w-3.5 h-3.5 text-cyan" />
            <p className="text-xs font-medium text-text-2 uppercase tracking-widest">Local / Open Source</p>
          </div>
          <AnimatePresence>
            {localModels.map((m) => (
              <ModelRow key={m.id} model={m} onToggle={() => handleToggle(m)} onDelete={() => setDeleteTarget(m)} onRoleChange={mutate} onUpdate={mutate} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget && !deleting) { setDeleteTarget(null); setDeleteError(""); } }}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="glass rounded-2xl p-6 w-full max-w-sm mx-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-text-1">Remove {deleteTarget.name}?</h3>
              <p className="text-xs text-text-3 mt-1 font-mono">{deleteTarget.model_id}</p>
            </div>
            {deleteError && <p className="text-xs text-rose-400">{deleteError}</p>}
            <div className="space-y-2">
              <button onClick={() => handleDelete(deleteTarget, false)} disabled={deleting}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-border disabled:opacity-40 transition-colors text-left">
                <X className="w-4 h-4 text-text-3 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-text-1">Remove from app</p>
                  <p className="text-[10px] text-text-3 mt-0.5">Keeps model files on disk — can re-add later</p>
                </div>
              </button>
              <button onClick={() => handleDelete(deleteTarget, true)} disabled={deleting}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-rose-400/10 hover:bg-rose-400/20 border border-rose-400/20 disabled:opacity-40 transition-colors text-left">
                {deleting
                  ? <Loader2 className="w-4 h-4 text-rose-400 shrink-0 animate-spin" />
                  : <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />}
                <div>
                  <p className="text-xs font-medium text-rose-400">Uninstall &amp; free disk</p>
                  <p className="text-[10px] text-rose-400/60 mt-0.5">Deletes model files from Ollama</p>
                </div>
              </button>
            </div>
            <button onClick={() => { setDeleteTarget(null); setDeleteError(""); }} disabled={deleting}
              className="w-full text-xs text-text-3 hover:text-text-2 transition-colors py-1 disabled:opacity-40">
              Cancel
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function AiModelsTab() {
  const { currentOrg: aiOrg } = useAuth();
  const aiOrgKey = aiOrg?.id ?? null;
  const { data: models = [], mutate: mutateModels, isLoading } = useSWR(aiOrgKey ? ["ai-models", aiOrgKey] : null, () => api.aiModels.list());
  const { data: providers = [], mutate: mutateProviders } = useSWR(aiOrgKey ? ["api-providers", aiOrgKey] : null, () => api.apiProviders.list());

  const [aiView, setAiView] = useState<"library" | "providers" | "models">("providers");

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-1">AI Models</h2>
          <p className="text-xs text-text-3 mt-0.5">
            {providers.length} provider{providers.length !== 1 ? "s" : ""} connected · {models.length} model{models.length !== 1 ? "s" : ""} available
          </p>
        </div>
        <div className="flex items-center bg-surface-2 rounded-lg p-0.5 border border-border">
          <button
            onClick={() => setAiView("library")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              aiView === "library" ? "bg-cyan/20 text-cyan" : "text-text-3 hover:text-text-2",
            )}
          >
            <Cpu className="w-3 h-3" /> Open Source
          </button>
          <button
            onClick={() => setAiView("providers")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              aiView === "providers" ? "bg-violet/20 text-violet" : "text-text-3 hover:text-text-2",
            )}
          >
            <KeyRound className="w-3 h-3" /> Providers
            {providers.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-text-2 text-[10px] font-mono leading-none">
                {providers.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setAiView("models")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              aiView === "models" ? "bg-white/10 text-text-1" : "text-text-3 hover:text-text-2",
            )}
          >
            <Sparkles className="w-3 h-3" /> Models
            {models.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-text-2 text-[10px] font-mono leading-none">
                {models.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {aiView === "library"   && <OllamaLibraryView models={models} mutate={mutateModels} />}
      {aiView === "providers" && <ProvidersView providers={providers} mutate={mutateProviders} mutateModels={mutateModels} />}
      {aiView === "models"    && <ModelsView models={models} mutate={mutateModels} loading={isLoading} />}
    </div>
  );
}

function WorkspacesTab() {
  const { currentOrg } = useAuth();
  const orgId = currentOrg?.id ?? "";

  const { data: tenants = [], mutate, isLoading } = useSWR(
    orgId ? ["tenants", orgId] : null,
    () => api.orgs.tenants.list(orgId),
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName]   = useState("");
  const [creating, setCreating]   = useState(false);
  const [newName, setNewName]     = useState("");
  const [saving, setSaving]       = useState(false);

  function toSlug(v: string) {
    return v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);
  }

  async function handleRename(tenantId: string) {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await api.orgs.tenants.update(orgId, tenantId, { name: editName.trim() });
      await mutate();
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await api.orgs.tenants.create(orgId, { name: newName.trim(), slug: toSlug(newName) });
      await mutate();
      setNewName("");
      setCreating(false);
    } finally {
      setSaving(false);
    }
  }

  if (!orgId) return <p className="text-sm text-text-3">No org selected.</p>;

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-text-1">Workspaces</h3>
        <p className="text-xs text-text-3 mt-0.5">
          Each workspace is an isolated data environment. Agents, documents, and quota data are scoped per workspace.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-text-3">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : (
        <ul className="space-y-2">
          {tenants.map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded-xl border border-border bg-surface-1 px-4 py-3">
              {editingId === t.id ? (
                <>
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRename(t.id); if (e.key === "Escape") setEditingId(null); }}
                    className="flex-1 rounded-lg border border-border bg-surface-0 px-3 py-1.5 text-sm
                               text-text-1 focus:outline-none focus:ring-2 focus:ring-violet/50"
                  />
                  <button
                    onClick={() => handleRename(t.id)}
                    disabled={saving}
                    className="rounded-lg bg-violet px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={14} />}
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-text-3 hover:text-text-2">
                    <X size={14} />
                  </button>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-1 font-medium truncate">{t.name}</p>
                    <p className="text-xs text-text-3 font-mono">{t.slug}</p>
                  </div>
                  <button
                    onClick={() => { setEditingId(t.id); setEditName(t.name); }}
                    className="text-text-3 hover:text-text-2 transition-colors"
                    aria-label="Rename workspace"
                  >
                    <Pencil size={14} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
            placeholder="Workspace name"
            className="flex-1 rounded-lg border border-border bg-surface-0 px-3 py-1.5 text-sm
                       text-text-1 focus:outline-none focus:ring-2 focus:ring-violet/50"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || saving}
            className="rounded-lg bg-violet px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : "Create"}
          </button>
          <button onClick={() => { setCreating(false); setNewName(""); }} className="text-text-3 hover:text-text-2">
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 text-sm text-violet hover:underline"
        >
          <Plus size={14} /> Add workspace
        </button>
      )}
    </div>
  );
}

function SettingsTab() {
  const { currentOrg: settingsOrg } = useAuth();
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
            onClick={() => { if (settingsOrg) removeOrgItem(settingsOrg.id, "threads"); window.location.reload(); }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 border border-rose-400/30 hover:bg-rose-400/10 transition-colors"
          >
            Clear
          </button>
        </div>
      </section>
    </div>
  );
}

const TRANSPORTS = ["streamable_http", "sse", "stdio"];

function McpServersTab() {
  const { currentOrg: mcpOrg } = useAuth();
  const { data: servers = [], mutate, isLoading } = useSWR(
    mcpOrg ? ["mcp-servers", mcpOrg.id] : null,
    () => api.mcpServers.list(),
  );

  // ── OpenAPI import ────────────────────────────────────────────
  const [showImport,    setShowImport]    = useState(false);
  const [expandedTools, setExpandedTools] = useState<string | null>(null);

  // ── Create ────────────────────────────────────────────────────
  const [creating, setCreating]     = useState(false);
  const [newName,  setNewName]      = useState("");
  const [newUrl,   setNewUrl]       = useState("");
  const [newTransport, setNewTransport] = useState("streamable_http");
  const [newDesc,  setNewDesc]      = useState("");
  const [saving,   setSaving]       = useState(false);
  const [createError, setCreateError] = useState("");

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
            {servers.length} server{servers.length !== 1 ? "s" : ""} connected
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!showImport && (
            <button
              onClick={() => { setShowImport(true); setCreating(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400/15 hover:bg-amber-400/25 text-amber-400 text-sm font-medium transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              Import OpenAPI
            </button>
          )}
          {!creating && !showImport && (
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

          {/* Import from OpenAPI form */}
          <AnimatePresence>
            {showImport && (
              <ImportOpenApiForm
                onSuccess={() => { setShowImport(false); mutate(); }}
                onClose={() => setShowImport(false)}
              />
            )}
          </AnimatePresence>

          {/* Server list */}
          {isLoading ? (
            <div className="flex items-center gap-2 text-text-3 text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" />Loading…
            </div>
          ) : servers.length === 0 && !creating ? (
            <EmptyState message="No MCP servers connected. Add a server by URL or import an OpenAPI spec." />
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
                            "absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                            editEnabled ? "translate-x-4" : "translate-x-0",
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
                    <div className="space-y-0">
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
                            "absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                            s.enabled ? "translate-x-4" : "translate-x-0",
                          )} />
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-text-1">{s.name}</p>
                            {s.runtime_mode === "dynamic" ? (
                              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-400/10 border border-amber-400/20 text-amber-400 font-medium">
                                <Zap className="w-2.5 h-2.5" /> Dynamic
                              </span>
                            ) : (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-text-3 font-mono">
                                {s.transport}
                              </span>
                            )}
                            {s.runtime_mode === "dynamic" && s.tools.length > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-text-3 font-mono">
                                {s.tools.filter(t => t.enabled).length}/{s.tools.length} tools
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-text-3 font-mono mt-0.5 truncate">{s.url}</p>
                          {s.description && <p className="text-xs text-text-3 mt-0.5">{s.description}</p>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {s.runtime_mode === "dynamic" && s.tools.length > 0 && (
                            <button
                              onClick={() => setExpandedTools(expandedTools === s.id ? null : s.id)}
                              title="Toggle tools"
                              className="p-1.5 rounded-lg text-text-3 hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
                            >
                              {expandedTools === s.id
                                ? <ChevronDown className="w-3.5 h-3.5" />
                                : <ChevronRight className="w-3.5 h-3.5" />}
                            </button>
                          )}
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
                      {/* Expandable tools list for dynamic servers */}
                      <AnimatePresence>
                        {expandedTools === s.id && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <ToolList server={s} onMutate={mutate} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
    </div>
  );
}

// ── Import from OpenAPI form ──────────────────────────────────────────────────

function ImportOpenApiForm({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const [specMode, setSpecMode] = useState<"url" | "paste">("url");
  const [specUrl,  setSpecUrl]  = useState("");
  const [specJson, setSpecJson] = useState("");
  const [name,     setName]     = useState("");
  const [baseUrl,  setBaseUrl]  = useState("");
  const [authType, setAuthType] = useState<"none" | "bearer" | "api_key">("none");
  const [authValue,  setAuthValue]  = useState("");
  const [authHeader, setAuthHeader] = useState("X-API-Key");
  const [importing,  setImporting]  = useState(false);
  const [error,      setError]      = useState("");

  const handleImport = async () => {
    if (!name.trim() || !baseUrl.trim()) { setError("Name and Base URL are required"); return; }
    if (specMode === "url" && !specUrl.trim()) { setError("Spec URL is required"); return; }
    if (specMode === "paste" && !specJson.trim()) { setError("Paste an OpenAPI JSON spec"); return; }

    setImporting(true);
    setError("");
    try {
      let parsed_json: Record<string, unknown> | undefined;
      if (specMode === "paste") {
        try { parsed_json = JSON.parse(specJson); }
        catch { setError("Invalid JSON — check your pasted spec"); setImporting(false); return; }
      }
      const auth_config =
        authType === "bearer" ? { type: "bearer", token: authValue } :
        authType === "api_key" ? { type: "api_key", header: authHeader, value: authValue } :
        undefined;

      await api.mcpServers.importOpenApi({
        name: name.trim(),
        base_url: baseUrl.trim(),
        spec_url: specMode === "url" ? specUrl.trim() : undefined,
        spec_json: parsed_json,
        auth_config,
      });
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <p className="text-sm font-semibold text-text-1">Import from OpenAPI</p>
        </div>
        <button onClick={onClose} className="p-1 rounded text-text-3 hover:text-text-2 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Spec source toggle */}
      <div className="flex items-center gap-1 bg-surface-2 rounded-lg p-0.5 border border-border w-fit">
        {(["url", "paste"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setSpecMode(m)}
            className={cn(
              "px-3 py-1 rounded-md text-xs font-medium transition-colors",
              specMode === m ? "bg-amber-400/20 text-amber-400" : "text-text-3 hover:text-text-2",
            )}
          >
            {m === "url" ? "From URL" : "Paste JSON"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-text-3">Server name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My API"
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-amber-400"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-text-3">API base URL</label>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com"
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-amber-400 font-mono"
          />
        </div>
      </div>

      {specMode === "url" ? (
        <div className="space-y-1">
          <label className="text-xs text-text-3">OpenAPI spec URL</label>
          <input
            value={specUrl}
            onChange={(e) => setSpecUrl(e.target.value)}
            placeholder="https://api.example.com/openapi.json"
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-amber-400 font-mono"
          />
        </div>
      ) : (
        <div className="space-y-1">
          <label className="text-xs text-text-3">OpenAPI JSON</label>
          <textarea
            value={specJson}
            onChange={(e) => setSpecJson(e.target.value)}
            placeholder={'{\n  "openapi": "3.0.0",\n  ...\n}'}
            rows={6}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-text-1 placeholder:text-text-3 outline-none focus:border-amber-400 font-mono resize-none"
          />
        </div>
      )}

      {/* Auth */}
      <div className="space-y-2">
        <label className="text-xs text-text-3">Authentication</label>
        <div className="flex items-center gap-2">
          {(["none", "bearer", "api_key"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setAuthType(t)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
                authType === t
                  ? "bg-amber-400/20 border-amber-400/30 text-amber-400"
                  : "border-border text-text-3 hover:text-text-2",
              )}
            >
              {t === "none" ? "None" : t === "bearer" ? "Bearer token" : "API key"}
            </button>
          ))}
        </div>
        {authType !== "none" && (
          <div className="grid grid-cols-2 gap-3">
            {authType === "api_key" && (
              <div className="space-y-1">
                <label className="text-xs text-text-3">Header name</label>
                <input
                  value={authHeader}
                  onChange={(e) => setAuthHeader(e.target.value)}
                  placeholder="X-API-Key"
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-amber-400 font-mono"
                />
              </div>
            )}
            <div className={cn("space-y-1", authType === "api_key" ? "" : "col-span-2")}>
              <label className="text-xs text-text-3">{authType === "bearer" ? "Token" : "Value"}</label>
              <input
                value={authValue}
                onChange={(e) => setAuthValue(e.target.value)}
                type="password"
                placeholder={authType === "bearer" ? "sk-..." : "your-api-key"}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-amber-400 font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleImport}
          disabled={importing}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-400/20 hover:bg-amber-400/35 text-amber-400 text-sm font-medium disabled:opacity-40 transition-colors"
        >
          {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          {importing ? "Importing…" : "Import"}
        </button>
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-text-3 hover:text-text-2 hover:bg-surface-2 text-sm transition-colors">
          Cancel
        </button>
      </div>
    </motion.div>
  );
}

// ── Tool list (inline, for dynamic servers) ───────────────────────────────────

function ToolList({ server, onMutate }: { server: McpServer; onMutate: () => void }) {
  const [editingDesc, setEditingDesc] = useState<string | null>(null);
  const [descValue,   setDescValue]   = useState("");
  const [saving,      setSaving]      = useState<string | null>(null);

  const startEditDesc = (t: McpTool) => {
    setEditingDesc(t.id);
    setDescValue(t.description ?? "");
  };

  const saveDesc = async (t: McpTool) => {
    setSaving(t.id);
    try {
      await api.mcpServers.updateTool(server.id, t.id, { description: descValue });
      onMutate();
      setEditingDesc(null);
    } finally {
      setSaving(null);
    }
  };

  const toggleTool = async (t: McpTool) => {
    setSaving(t.id);
    try {
      await api.mcpServers.updateTool(server.id, t.id, { enabled: !t.enabled });
      onMutate();
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-border/50 space-y-1">
      <p className="text-[10px] font-medium text-text-3 uppercase tracking-widest mb-2">
        Tools — {server.tools.filter(t => t.enabled).length} active
      </p>
      {server.tools.map((t) => (
        <div key={t.id} className="flex items-start gap-3 px-2 py-1.5 rounded-lg hover:bg-white/3 group">
          {/* enable toggle */}
          <button
            onClick={() => toggleTool(t)}
            disabled={saving === t.id}
            className={cn(
              "relative mt-0.5 w-7 h-4 rounded-full transition-colors shrink-0",
              t.enabled ? "bg-emerald/60" : "bg-white/10",
              saving === t.id && "opacity-40",
            )}
          >
            <span className={cn(
              "absolute left-0.5 top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform duration-200",
              t.enabled ? "translate-x-3" : "translate-x-0",
            )} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-[10px] px-1 py-0.5 rounded font-mono font-medium",
                t.http_method === "GET"    ? "bg-emerald/10 text-emerald"  :
                t.http_method === "POST"   ? "bg-violet/10 text-violet"    :
                t.http_method === "PUT"    ? "bg-amber-400/10 text-amber-400" :
                t.http_method === "DELETE" ? "bg-rose-400/10 text-rose-400"  :
                "bg-white/5 text-text-3",
              )}>
                {t.http_method}
              </span>
              <code className="text-xs text-text-2 font-mono">{t.name}</code>
              <code className="text-[10px] text-text-3 font-mono truncate max-w-[160px]">{t.path}</code>
            </div>
            {editingDesc === t.id ? (
              <div className="flex items-center gap-1.5 mt-1">
                <input
                  value={descValue}
                  onChange={(e) => setDescValue(e.target.value)}
                  autoFocus
                  className="flex-1 bg-surface-2 border border-border rounded px-2 py-0.5 text-xs text-text-1 outline-none focus:border-amber-400"
                />
                <button
                  onClick={() => saveDesc(t)}
                  disabled={saving === t.id}
                  className="p-1 rounded text-amber-400 hover:bg-amber-400/10 disabled:opacity-40"
                >
                  {saving === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                </button>
                <button onClick={() => setEditingDesc(null)} className="p-1 rounded text-text-3 hover:text-text-2">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => startEditDesc(t)}
                className="text-left text-xs text-text-3 mt-0.5 hover:text-text-2 line-clamp-1 w-full"
                title="Click to edit description"
              >
                {t.description || <span className="italic">Add description…</span>}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Open-source model library ─────────────────────────────────────────────

function isModelInstalled(installedIds: string[], catalogId: string): boolean {
  return installedIds.some((id) => id === catalogId || id === `${catalogId}:latest`);
}

// Module-level pull registry — survives component unmount/remount and navigation.
type PullState = "idle" | "pulling" | "done" | "error";
type PullEntry = { state: PullState; pct: number | null; status: string; error: string };

const _pullRegistry = new Map<string, PullEntry>();
const _pullListeners = new Set<() => void>();

function _setPull(id: string, patch: Partial<PullEntry>) {
  const cur = _pullRegistry.get(id) ?? { state: "idle" as PullState, pct: null, status: "", error: "" };
  _pullRegistry.set(id, { ...cur, ...patch });
  _pullListeners.forEach((fn) => fn());
}

function usePullState(modelId: string) {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    _pullListeners.add(rerender);
    return () => { _pullListeners.delete(rerender); };
  }, []);
  const entry = _pullRegistry.get(modelId) ?? { state: "idle" as PullState, pct: null, status: "", error: "" };
  return {
    ...entry,
    set: (patch: Partial<PullEntry>) => _setPull(modelId, patch),
    clear: () => { _pullRegistry.delete(modelId); _pullListeners.forEach((fn) => fn()); },
  };
}

function ModelCatalogCard({
  model, ollamaUrl, installedInOllama, configured, onRegistered,
}: {
  model: ModelCatalogItem;
  ollamaUrl: string;
  installedInOllama: boolean;
  configured: boolean;
  onRegistered: () => void;
}) {
  const pull = usePullState(model.ollamaId);
  const [registering, setRegistering] = useState(false);

  const autoRegister = async (): Promise<boolean> => {
    try {
      await api.aiModels.create({
        name: model.name, type: "local", provider: "Ollama",
        model_id: model.ollamaId, base_url: ollamaUrl,
        description: model.description, enabled: false,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("409")) {
        pull.set({ state: "error", error: `Could not register model: ${msg}` });
        return false;
      }
      // 409 = already registered — fine
    }
    onRegistered();
    return true;
  };

  const handleDownload = async () => {
    if (!ollamaUrl) return;
    pull.set({ state: "pulling", pct: null, status: "Starting…", error: "" });
    await api.aiModels.pullOllama(
      model.ollamaId, ollamaUrl,
      (status, pct) => pull.set({ status, pct }),
      async () => { const ok = await autoRegister(); if (ok) pull.set({ state: "done" }); },
      (err) => pull.set({ state: "error", error: err }),
    );
  };

  const handleRegister = async () => {
    setRegistering(true);
    try {
      await api.aiModels.create({
        name: model.name, type: "local", provider: "Ollama",
        model_id: model.ollamaId, base_url: ollamaUrl,
        description: model.description, enabled: false,
      });
      pull.set({ state: "done" });
      onRegistered();
    } catch (e) {
      pull.set({ error: e instanceof Error ? e.message : "Failed to register" });
    } finally {
      setRegistering(false);
    }
  };

  const isReady = configured || pull.state === "done";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="glass rounded-2xl p-4 flex flex-col gap-3"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-text-1">{model.name}</p>
            {model.recommended && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet/15 text-violet border border-violet/25 font-medium">
                Recommended
              </span>
            )}
            {isReady && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 font-medium">
                Registered
              </span>
            )}
            {installedInOllama && !isReady && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20 font-medium">
                Downloaded
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded border font-medium",
              MODEL_CATEGORY_STYLES[model.category] ?? "bg-white/5 text-text-2 border-white/10",
            )}>
              {model.category}
            </span>
            <span className="text-[10px] text-text-3">{model.family}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="flex items-center gap-1 justify-end text-text-2">
            <HardDrive className="w-3 h-3 text-text-3" />
            <span className="text-xs font-mono">{model.size}</span>
          </div>
          <p className="text-[10px] text-text-3 mt-0.5">{model.params} params</p>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-text-3 leading-relaxed flex-1">{model.description}</p>

      {/* Tags + model id */}
      <div className="flex gap-1 flex-wrap">
        {model.tags.map((tag) => (
          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-text-3">
            {tag}
          </span>
        ))}
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-text-3 font-mono">
          {model.ollamaId}
        </span>
      </div>

      {/* Action area */}
      <div className="pt-2 border-t border-border">
        {pull.state === "pulling" && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-text-3 font-mono truncate">{pull.status || "Connecting…"}</p>
              {pull.pct !== null && (
                <span className="text-xs font-mono text-text-2 shrink-0 ml-2">{pull.pct}%</span>
              )}
            </div>
            <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-violet to-cyan rounded-full"
                animate={{ width: pull.pct !== null ? `${pull.pct}%` : "30%" }}
                transition={{ duration: 0.3 }}
                style={pull.pct === null ? { animation: "pulse 2s infinite" } : {}}
              />
            </div>
            {pull.pct === null && (
              <p className="text-[10px] text-text-3 animate-pulse">Waiting for Ollama…</p>
            )}
          </div>
        )}

        {pull.state === "done" && (
          <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Added to Models tab — enable it there to start using it
          </div>
        )}

        {pull.state === "error" && (
          <div className="space-y-1.5">
            <p className="text-xs text-rose-400 line-clamp-2">{pull.error}</p>
            <button
              onClick={() => pull.set({ state: "idle", error: "" })}
              className="text-xs text-violet hover:text-violet/80 transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {pull.state === "idle" && (
          <div className="flex items-center justify-between">
            {isReady ? (
              <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5" />
                In Models tab — toggle to enable
              </div>
            ) : installedInOllama ? (
              <button
                onClick={handleRegister}
                disabled={registering || !ollamaUrl}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald/20 hover:bg-emerald/35 text-emerald text-xs font-medium disabled:opacity-40 transition-colors"
              >
                {registering
                  ? <><Loader2 className="w-3 h-3 animate-spin" /> Adding…</>
                  : <><Plus className="w-3 h-3" /> Add to Lanara</>}
              </button>
            ) : (
              <button
                onClick={handleDownload}
                disabled={!ollamaUrl}
                title={!ollamaUrl ? "Ollama URL not configured" : undefined}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan/20 hover:bg-cyan/35 text-cyan text-xs font-medium disabled:opacity-40 transition-colors"
              >
                <Download className="w-3 h-3" />
                Download
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}


function OllamaLibraryView({ models, mutate }: { models: AiModel[]; mutate: () => void }) {
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [ollamaUrl,       setOllamaUrl]      = useState("");
  const [installedIds,    setInstalledIds]   = useState<string[]>([]);
  const [loadingOllama,   setLoadingOllama]  = useState(true);
  const [ollamaError,     setOllamaError]    = useState("");

  const fetchInstalled = async (url: string) => {
    setLoadingOllama(true); setOllamaError("");
    try {
      const available = await api.aiModels.providerModels("Ollama", url);
      setInstalledIds(available.map((m) => m.id));
    } catch {
      setOllamaError("Cannot reach Ollama. Run `ollama serve` to start it.");
      setInstalledIds([]);
    } finally {
      setLoadingOllama(false);
    }
  };

  useEffect(() => {
    api.config().then((cfg) => {
      setOllamaUrl(cfg.ollama_url);
      fetchInstalled(cfg.ollama_url);
    }).catch(() => {
      const fallback = "http://localhost:11434";
      setOllamaUrl(fallback);
      fetchInstalled(fallback);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRegistered = () => {
    mutate();
    if (ollamaUrl) fetchInstalled(ollamaUrl);
  };

  const filtered = categoryFilter === "All"
    ? MODEL_CATALOG
    : MODEL_CATALOG.filter((m) => m.category === categoryFilter);

  return (
    <div className="space-y-5">
      {/* Ollama connection status */}
      {loadingOllama ? (
        <div className="flex items-center gap-2 text-xs text-text-3">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Connecting to Ollama…
        </div>
      ) : ollamaError ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-amber-400">{ollamaError}</p>
            <p className="text-[10px] text-text-3 mt-0.5 font-mono">ollama serve</p>
          </div>
          <button
            onClick={() => fetchInstalled(ollamaUrl)}
            className="text-amber-400 hover:text-amber-300 transition-colors shrink-0"
            title="Retry"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-text-3">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Ollama connected
            <span className="text-text-3">·</span>
            {installedIds.length} model{installedIds.length !== 1 ? "s" : ""} downloaded locally
          </div>
          <button
            onClick={() => fetchInstalled(ollamaUrl)}
            className="text-text-3 hover:text-text-2 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {MODEL_CATEGORIES.map((cat) => (
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
          {filtered.map((model) => (
            <ModelCatalogCard
              key={model.id}
              model={model}
              ollamaUrl={ollamaUrl}
              installedInOllama={isModelInstalled(installedIds, model.ollamaId)}
              configured={models.some((m) => m.model_id === model.ollamaId)}
              onRegistered={handleRegistered}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
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
