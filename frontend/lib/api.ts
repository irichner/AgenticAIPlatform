export interface ChatUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
}

export interface ChatRoom {
  id: string;
  name: string;
  type: "direct" | "group";
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_name: string;
  content: string;
  created_at: string;
}

export interface AiModel {
  id: string;
  name: string;
  type: "api" | "local";
  provider: string;
  model_id: string;
  base_url: string | null;
  api_key_set: boolean;
  enabled: boolean;
  description: string | null;
  provider_id: string | null;
  context_window: number | null;
  capabilities: string[] | null;
  is_auto_managed: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiProvider {
  id: string;
  name: string;
  display_name: string;
  api_key_set: boolean;
  base_url: string | null;
  status: "connected" | "invalid" | "error";
  last_synced_at: string | null;
  model_count: number;
  created_at: string;
  updated_at: string;
}

export interface McpServer {
  id: string;
  name: string;
  url: string;
  transport: string;
  description: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface BusinessUnit {
  id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentGroup {
  id: string;
  business_unit_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: string;
  business_unit_id: string;
  group_id: string | null;
  model_id: string | null;
  name: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  created_by: string | null;
  created_at: string;
  updated_at: string;
  mcp_servers: McpServer[];
}

export interface AgentVersion {
  id: string;
  agent_id: string;
  version_number: number;
  prompt: string | null;
  tools: string[] | null;
  created_at: string;
}

export interface Run {
  id: string;
  agent_id: string;
  business_unit_id: string | null;
  status: "pending" | "running" | "completed" | "failed" | "awaiting_approval";
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
}

export interface Document {
  id: string;
  business_unit_id: string;
  filename: string;
  content_type: string | null;
  status: "processing" | "ready" | "error";
  created_at: string;
  updated_at: string;
}

export interface SearchResult {
  content: string;
  similarity: number;
  document_id: string | null;
}

export interface WorkflowListItem {
  id: string;
  name: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowOut {
  id: string;
  name: string;
  graph: { nodes: unknown[]; edges: unknown[] };
  bpmn_xml: string | null;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowVersionOut {
  id: string;
  workflow_id: string;
  version: number;
  name: string;
  graph: { nodes: unknown[]; edges: unknown[] };
  bpmn_xml: string | null;
  note: string | null;
  created_at: string;
}

export interface CatalogSource {
  id: string;
  kind: "models" | "mcp_servers";
  display_name: string;
  base_url: string;
  requires_auth: boolean;
  default_enabled: boolean;
  sync_interval_seconds: number;
  enabled: boolean;
  last_sync_at: string | null;
  last_sync_status: "ok" | "error" | "auth_failed" | "rate_limited" | null;
}

export interface CatalogItem {
  id: string;
  source_id: string;
  external_id: string;
  kind: string;
  payload: Record<string, unknown>;
  fetched_at: string;
}

export interface SourceItemCount {
  source_id: string;
  count: number;
}

export interface ApprovalRequest {
  id: string;
  run_id: string;
  agent_id: string | null;
  thread_id: string;
  tool_name: string | null;
  tool_args: Record<string, unknown> | null;
  status: "pending" | "approved" | "rejected";
  decision: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Auth / RBAC types ─────────────────────────────────────────────────────

export interface OrgOut {
  id: string;
  name: string;
  slug: string;
  sso_enforced: boolean;
  created_at: string;
}

export interface TenantOut {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface MemberOut {
  user_id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role_id: string;
  role_key: string;
  role_name: string;
  joined_at: string;
}

export interface PermissionOut {
  id: string;
  scope: string;
  resource: string;
  description: string;
  system_only: boolean;
}

export interface RoleOut {
  id: string;
  org_id: string | null;
  scope: string;
  key: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_default: boolean;
  created_at: string;
  permissions: string[];
}

export interface AuditLogEntry {
  id: number;
  at: string;
  actor_email: string | null;
  org_id: string | null;
  tenant_id: string | null;
  permission: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  ip: string | null;
}

export interface SessionOut {
  id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  user_agent: string | null;
  ip: string | null;
  is_current: boolean;
}

export interface SsoConfigOut {
  org_id: string;
  provider: string;
  issuer_url: string;
  client_id: string;
  enabled: boolean;
}

export interface DomainOut {
  domain: string;
  verified: boolean;
  verify_token: string | null;
}

export const api = {
  auth: {
    me: () => req<{ id: string; email: string; full_name: string | null; orgs: OrgOut[]; permissions: Record<string, string[]> }>("GET", "/auth/me"),
    logout: () => req<void>("POST", "/auth/logout"),
    sessions: () => req<SessionOut[]>("GET", "/auth/sessions"),
    revokeSession: (id: string) => req<void>("DELETE", `/auth/sessions/${id}`),
  },

  orgs: {
    list: () => req<OrgOut[]>("GET", "/orgs"),
    create: (payload: { name: string; slug: string }) => req<OrgOut>("POST", "/orgs", payload),
    get: (orgId: string) => req<OrgOut>("GET", `/orgs/${orgId}`),
    update: (orgId: string, payload: { name?: string; sso_enforced?: boolean }) =>
      req<OrgOut>("PATCH", `/orgs/${orgId}`, payload),
    members: {
      list: (orgId: string) => req<MemberOut[]>("GET", `/orgs/${orgId}/members`),
      invite: (orgId: string, payload: { email: string; role_id: string }) =>
        req<{ detail: string }>("POST", `/orgs/${orgId}/members/invite`, payload),
      updateRole: (orgId: string, userId: string, roleId: string) =>
        req<{ detail: string }>("PATCH", `/orgs/${orgId}/members/${userId}`, { role_id: roleId }),
      remove: (orgId: string, userId: string) =>
        req<{ detail: string }>("DELETE", `/orgs/${orgId}/members/${userId}`),
    },
    tenants: {
      list: (orgId: string) => req<TenantOut[]>("GET", `/orgs/${orgId}/tenants`),
      create: (orgId: string, payload: { name: string; slug: string }) =>
        req<TenantOut>("POST", `/orgs/${orgId}/tenants`, payload),
      delete: (orgId: string, tenantId: string) =>
        req<{ detail: string }>("DELETE", `/orgs/${orgId}/tenants/${tenantId}`),
    },
    roles: {
      list: (orgId: string) => req<RoleOut[]>("GET", `/orgs/${orgId}/roles`),
      permissions: (orgId: string) => req<PermissionOut[]>("GET", `/orgs/${orgId}/permissions`),
      create: (orgId: string, payload: { scope: string; key: string; name: string; description?: string; permission_ids: string[] }) =>
        req<RoleOut>("POST", `/orgs/${orgId}/roles`, payload),
      update: (orgId: string, roleId: string, payload: { name?: string; description?: string; permission_ids?: string[] }) =>
        req<RoleOut>("PATCH", `/orgs/${orgId}/roles/${roleId}`, payload),
      delete: (orgId: string, roleId: string) =>
        req<{ detail: string }>("DELETE", `/orgs/${orgId}/roles/${roleId}`),
    },
    auditLog: {
      list: (orgId: string, params?: { actor_id?: string; action?: string; since?: string; until?: string; limit?: number; offset?: number }) => {
        const qs = params ? "?" + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString() : "";
        return req<AuditLogEntry[]>("GET", `/orgs/${orgId}/audit-log${qs}`);
      },
      exportUrl: (orgId: string) => `/api/orgs/${orgId}/audit-log/export`,
    },
    sso: {
      get: (orgId: string) => req<SsoConfigOut | null>("GET", `/orgs/${orgId}/sso`),
      upsert: (orgId: string, payload: { provider: string; issuer_url: string; client_id: string; client_secret: string; enabled: boolean }) =>
        req<SsoConfigOut>("PUT", `/orgs/${orgId}/sso`, payload),
      domains: {
        list: (orgId: string) => req<DomainOut[]>("GET", `/orgs/${orgId}/domains`),
        add: (orgId: string, domain: string) => req<DomainOut>("POST", `/orgs/${orgId}/domains`, { domain }),
        verify: (orgId: string, domain: string) => req<{ detail: string }>("POST", `/orgs/${orgId}/domains/${domain}/verify`),
        remove: (orgId: string, domain: string) => req<{ detail: string }>("DELETE", `/orgs/${orgId}/domains/${domain}`),
      },
    },
  },

  chat: {
    users: {
      list: () => req<ChatUser[]>("GET", "/chat/users"),
      create: (payload: { email: string; full_name?: string; role?: string }) =>
        req<ChatUser>("POST", "/chat/users", payload),
      delete: (userId: string) => req<void>("DELETE", `/chat/users/${userId}`),
    },
    rooms: {
      list: () => req<ChatRoom[]>("GET", "/chat/rooms"),
      create: (payload: { name: string; type?: string }) =>
        req<ChatRoom>("POST", "/chat/rooms", payload),
      delete: (roomId: string) => req<void>("DELETE", `/chat/rooms/${roomId}`),
    },
    messages: {
      list: (roomId: string) =>
        req<ChatMessage[]>("GET", `/chat/rooms/${roomId}/messages`),
      send: (roomId: string, payload: { sender_name: string; content: string }) =>
        req<ChatMessage>("POST", `/chat/rooms/${roomId}/messages`, payload),
    },
  },

  apiProviders: {
    list: () => req<ApiProvider[]>("GET", "/api-providers"),
    connect: (payload: { name: string; api_key: string; base_url?: string }) =>
      req<ApiProvider>("POST", "/api-providers", payload),
    sync: (id: string) => req<ApiProvider>("POST", `/api-providers/${id}/sync`),
    delete: (id: string) => req<void>("DELETE", `/api-providers/${id}`),
  },

  aiModels: {
    list: () => req<AiModel[]>("GET", "/ai-models"),
    create: (payload: { name: string; type: string; provider: string; model_id: string; base_url?: string; api_key?: string; enabled?: boolean; description?: string }) =>
      req<AiModel>("POST", "/ai-models", payload),
    update: (id: string, payload: { name?: string; type?: string; provider?: string; model_id?: string; base_url?: string; api_key?: string; enabled?: boolean; description?: string }) =>
      req<AiModel>("PATCH", `/ai-models/${id}`, payload),
    delete: (id: string) => req<void>("DELETE", `/ai-models/${id}`),
    providerModels: (provider: string, baseUrl?: string) =>
      req<{ id: string; name: string }[]>(
        "GET",
        `/ai-models/providers/${encodeURIComponent(provider)}/models${baseUrl ? `?base_url=${encodeURIComponent(baseUrl)}` : ""}`,
      ),
    providerModelsWithKey: (provider: string, apiKey: string, baseUrl?: string) =>
      req<{ id: string; name: string }[]>(
        "POST",
        `/ai-models/providers/${encodeURIComponent(provider)}/models`,
        { api_key: apiKey, base_url: baseUrl || undefined },
      ),

    pullOllama: async (
      model: string,
      baseUrl: string,
      onProgress: (status: string, pct: number | null) => void,
      onDone: () => void,
      onError: (err: string) => void,
    ): Promise<void> => {
      let res: Response;
      try {
        res = await fetch(
          `/api/ai-models/providers/ollama/pull?model=${encodeURIComponent(model)}&base_url=${encodeURIComponent(baseUrl)}`,
          { method: "POST" },
        );
      } catch (e) { onError(String(e)); return; }
      if (!res.ok) { onError(`${res.status}: ${await res.text().catch(() => res.statusText)}`); return; }
      const reader = res.body?.getReader();
      if (!reader) { onError("No response body"); return; }
      const decoder = new TextDecoder();
      let buf = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") { onDone(); return; }
            try {
              const p = JSON.parse(data);
              if (p.error) { onError(p.error); return; }
              const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : null;
              onProgress(p.status || "", pct);
            } catch { /* skip */ }
          }
        }
      } finally { reader.releaseLock(); }
      onDone();
    },
  },

  ask: async (
    message: string,
    history: { role: string; content: string }[],
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (err: string) => void,
    modelId?: string,
  ): Promise<void> => {
    let res: Response;
    try {
      res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history, model_id: modelId ?? null }),
      });
    } catch (e) {
      onError(String(e));
      return;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      onError(`${res.status}: ${text}`);
      return;
    }
    const reader = res.body?.getReader();
    if (!reader) { onError("No response body"); return; }
    const decoder = new TextDecoder();
    let buf = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") { onDone(); return; }
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) { onError(parsed.error); return; }
            if (parsed.content) onChunk(parsed.content);
          } catch { /* skip malformed */ }
        }
      }
    } finally {
      reader.releaseLock();
    }
    onDone();
  },

  mcpServers: {
    list: () => req<McpServer[]>("GET", "/mcp-servers"),
    create: (payload: { name: string; url: string; transport?: string; description?: string; enabled?: boolean }) =>
      req<McpServer>("POST", "/mcp-servers", payload),
    update: (id: string, payload: { name?: string; url?: string; transport?: string; description?: string; enabled?: boolean }) =>
      req<McpServer>("PATCH", `/mcp-servers/${id}`, payload),
    delete: (id: string) => req<void>("DELETE", `/mcp-servers/${id}`),
  },

  businessUnits: {
    list: () => req<BusinessUnit[]>("GET", "/business-units"),
    create: (payload: { name: string; description?: string; parent_id?: string }) =>
      req<BusinessUnit>("POST", "/business-units", payload),
    delete: (buId: string) => req<void>("DELETE", `/business-units/${buId}`),
  },

  agents: {
    list: (businessUnitId?: string) =>
      req<Agent[]>(
        "GET",
        `/agents${businessUnitId ? `?business_unit_id=${businessUnitId}` : ""}`,
      ),
    create: (payload: { name: string; description?: string; business_unit_id: string; prompt?: string; status?: string; group_id?: string; model_id?: string | null; mcp_server_ids?: string[] }) =>
      req<Agent>("POST", "/agents", payload),
    update: (agentId: string, payload: { name?: string; description?: string; status?: string; business_unit_id?: string; group_id?: string | null; prompt?: string; model_id?: string | null; mcp_server_ids?: string[] }) =>
      req<Agent>("PATCH", `/agents/${agentId}`, payload),
    versions: (agentId: string) =>
      req<AgentVersion[]>("GET", `/agents/${agentId}/versions`),
    generateInstructions: (payload: { name: string; description?: string; swarm_name: string }) =>
      req<{ prompt: string }>("POST", "/agents/generate-instructions", payload),
    createPrebuilt: (agentType: string, businessUnitId: string) =>
      req<Agent>("POST", `/agents/prebuilt/${agentType}?business_unit_id=${businessUnitId}`),
    publish: (agentId: string) =>
      req<Agent>("POST", `/agents/${agentId}/publish`),
  },

  runs: {
    create: (agentId: string, message: string) =>
      req<Run>("POST", "/runs", { agent_id: agentId, input: { message } }),
    get: (runId: string) => req<Run>("GET", `/runs/${runId}`),
    list: (agentId?: string) =>
      req<Run[]>("GET", `/runs${agentId ? `?agent_id=${agentId}` : ""}`),
  },

  documents: {
    list: (businessUnitId?: string) =>
      req<Document[]>(
        "GET",
        `/documents${businessUnitId ? `?business_unit_id=${businessUnitId}` : ""}`,
      ),
    upload: async (file: File, businessUnitId: string): Promise<Document> => {
      const form = new FormData();
      form.append("file", file);
      form.append("business_unit_id", businessUnitId);
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "X-Role": "editor" },
        body: form,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`Upload failed: ${res.status}: ${text}`);
      }
      return res.json();
    },
    delete: (docId: string) => req<void>("DELETE", `/documents/${docId}`),
    search: (query: string, businessUnitId: string, topK = 5) =>
      req<SearchResult[]>("POST", "/documents/search", {
        query,
        business_unit_id: businessUnitId,
        top_k: topK,
      }),
  },

  groups: {
    list: (businessUnitId?: string) =>
      req<AgentGroup[]>(
        "GET",
        `/groups${businessUnitId ? `?business_unit_id=${businessUnitId}` : ""}`,
      ),
    create: (payload: { name: string; description?: string; business_unit_id: string }) =>
      req<AgentGroup>("POST", "/groups", payload),
    delete: (groupId: string) => req<void>("DELETE", `/groups/${groupId}`),
    assignAgent: (groupId: string, agentId: string) =>
      req<{ ok: boolean }>("PATCH", `/groups/${groupId}/agents/${agentId}`),
    unassignAgent: (groupId: string, agentId: string) =>
      req<{ ok: boolean }>("DELETE", `/groups/${groupId}/agents/${agentId}`),
  },

  config: () => req<{ ollama_url: string }>("GET", "/config"),

  integrations: {
    googleDrive: {
      authUrl: () => req<{ auth_url: string }>("GET", "/integrations/google-drive/auth-url"),
      status: () => req<{ connected: boolean; email: string | null }>("GET", "/integrations/google-drive/status"),
      disconnect: () => req<{ ok: boolean }>("DELETE", "/integrations/google-drive"),
    },
  },

  approvals: {
    list: (approvalStatus?: string) =>
      req<ApprovalRequest[]>(
        "GET",
        `/approvals${approvalStatus ? `?approval_status=${approvalStatus}` : ""}`,
      ),
    get: (approvalId: string) => req<ApprovalRequest>("GET", `/approvals/${approvalId}`),
    decide: (approvalId: string, decision: "approve" | "reject") =>
      req<ApprovalRequest>("POST", `/approvals/${approvalId}/decide`, { decision }),
  },

  workflowRuns: {
    stream: async (
      payload: {
        workflow_id?: string;
        graph?: { nodes: unknown[]; edges: unknown[] };
        input_message: string;
        simulate?: boolean;
      },
      onEvent: (ev: Record<string, unknown>) => void,
      onDone: () => void,
      onError: (err: string) => void,
    ): Promise<void> => {
      let res: Response;
      try {
        res = await fetch("/api/workflow-runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch (e) { onError(String(e)); return; }
      if (!res.ok) { onError(`${res.status}: ${await res.text().catch(() => res.statusText)}`); return; }
      const reader = res.body?.getReader();
      if (!reader) { onError("No response body"); return; }
      const decoder = new TextDecoder();
      let buf = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") { onDone(); return; }
            try { onEvent(JSON.parse(data)); } catch { /* skip */ }
          }
        }
      } finally { reader.releaseLock(); }
      onDone();
    },
  },

  catalog: {
    sources: {
      list: () => req<CatalogSource[]>("GET", "/catalog/admin/sources"),
      patch: (id: string, payload: { enabled?: boolean }) =>
        req<CatalogSource>("PATCH", `/catalog/admin/sources/${id}`, payload),
      sync: (id: string) => req<CatalogSource>("POST", `/catalog/admin/sources/${id}/sync`),
      itemCount: (id: string) => req<SourceItemCount>("GET", `/catalog/admin/sources/${id}/items/count`),
    },
    items: (kind?: "model" | "mcp_server", limit = 200) =>
      req<CatalogItem[]>("GET", `/catalog/items${kind ? `?kind=${kind}&limit=${limit}` : `?limit=${limit}`}`),
  },

  workflows: {
    list: () => req<WorkflowListItem[]>("GET", "/workflows"),
    create: (payload?: { name?: string; graph?: { nodes: unknown[]; edges: unknown[] } }) =>
      req<WorkflowOut>("POST", "/workflows", payload ?? {}),
    get: (id: string) => req<WorkflowOut>("GET", `/workflows/${id}`),
    update: (id: string, payload: { name?: string; graph?: { nodes: unknown[]; edges: unknown[] }; bpmn_xml?: string | null }) =>
      req<WorkflowOut>("PUT", `/workflows/${id}`, payload),
    delete: (id: string) => req<void>("DELETE", `/workflows/${id}`),
    versions: (id: string) => req<WorkflowVersionOut[]>("GET", `/workflows/${id}/versions`),
    saveVersion: (id: string, note?: string) =>
      req<WorkflowVersionOut>("POST", `/workflows/${id}/versions`, { note: note ?? null }),
    restoreVersion: (workflowId: string, versionId: string) =>
      req<WorkflowOut>("POST", `/workflows/${workflowId}/versions/${versionId}/restore`),
  },
};
