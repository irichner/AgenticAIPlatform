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
  name: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  created_by: string | null;
  created_at: string;
  updated_at: string;
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

export const api = {
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
  ): Promise<void> => {
    let res: Response;
    try {
      res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
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
    create: (payload: { name: string; description?: string; business_unit_id: string; prompt?: string; status?: string; group_id?: string }) =>
      req<Agent>("POST", "/agents", payload),
    update: (agentId: string, payload: { name?: string; description?: string; status?: string; business_unit_id?: string; group_id?: string | null; prompt?: string }) =>
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
};
