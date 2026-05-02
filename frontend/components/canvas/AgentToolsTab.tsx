"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { ChevronDown, Info, Server, Globe } from "lucide-react";
import { api, type McpServer, type McpTool, type AgentToolAllowlistEntry } from "@/lib/api";
import { cn } from "@/lib/cn";

const METHOD_COLORS: Record<string, string> = {
  GET:    "text-emerald bg-emerald/10",
  POST:   "text-violet bg-violet/10",
  PUT:    "text-amber bg-amber/10",
  PATCH:  "text-cyan bg-cyan/10",
  DELETE: "text-rose-400 bg-rose-400/10",
};

interface Props {
  agentId: string;
  allMcpServers: McpServer[];
  selectedServerIds: string[];
  onSelectedServerIdsChange: (ids: string[]) => void;
}

export function AgentToolsTab({ agentId, allMcpServers, selectedServerIds, onSelectedServerIdsChange }: Props) {
  const {
    data: allowlist = [],
    mutate,
    isLoading,
  } = useSWR<AgentToolAllowlistEntry[]>(
    ["agent-tool-allowlist", agentId],
    () => api.agentToolAllowlist.list(agentId),
  );

  const allowedIds = new Set(allowlist.map((e) => e.mcp_tool_id));
  const allAllowed = allowlist.length === 0;

  // Auto-expand enabled servers on mount / when selection changes
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(selectedServerIds));
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      selectedServerIds.forEach((id) => next.add(id));
      return next;
    });
  }, [selectedServerIds]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const toggleServer = (serverId: string) => {
    const next = selectedServerIds.includes(serverId)
      ? selectedServerIds.filter((id) => id !== serverId)
      : [...selectedServerIds, serverId];
    onSelectedServerIdsChange(next);
  };

  const toggleTool = async (toolId: string, serverId: string) => {
    const allTools = allMcpServers.flatMap((s) => s.tools ?? []);
    const isCurrentlyEnabled = allAllowed || allowedIds.has(toolId);
    const next = new Set(allowedIds);
    if (isCurrentlyEnabled) {
      if (allAllowed) {
        allTools.filter((t) => selectedServerIds.includes(t.server_id)).forEach((t) => next.add(t.id));
      }
      next.delete(toolId);
    } else {
      next.add(toolId);
    }
    const optimistic = [...next].map((id) => ({
      id: "",
      agent_id: agentId,
      mcp_server_id: allTools.find((t) => t.id === id)?.server_id ?? serverId,
      mcp_tool_id: id,
      created_at: "",
    }));
    await mutate(
      api.agentToolAllowlist.set(agentId, [...next]),
      { optimisticData: optimistic, rollbackOnError: true },
    );
  };

  const setServerTools = async (server: McpServer, enabled: boolean) => {
    const allTools = allMcpServers.flatMap((s) => s.tools ?? []);
    const serverToolIds = new Set((server.tools ?? []).map((t) => t.id));
    const next = new Set(allowedIds);
    if (allAllowed && !enabled) {
      allTools.filter((t) => selectedServerIds.includes(t.server_id)).forEach((t) => next.add(t.id));
    }
    if (enabled) { serverToolIds.forEach((id) => next.add(id)); }
    else         { serverToolIds.forEach((id) => next.delete(id)); }
    await mutate(
      api.agentToolAllowlist.set(agentId, [...next]),
      {
        optimisticData: [...next].map((id) => ({
          id: "",
          agent_id: agentId,
          mcp_server_id: allTools.find((t) => t.id === id)?.server_id ?? server.id,
          mcp_tool_id: id,
          created_at: "",
        })),
        rollbackOnError: true,
      },
    );
  };

  if (isLoading) {
    return <p className="text-xs text-text-3 text-center py-8">Loading…</p>;
  }

  const enabledServers = allMcpServers.filter((s) => selectedServerIds.includes(s.id));
  const totalTools = enabledServers.flatMap((s) => s.tools ?? []).length;

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Banner */}
      {allAllowed && totalTools > 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-violet/8 border border-violet/20 px-3 py-2.5">
          <Info className="w-3.5 h-3.5 text-violet mt-0.5 shrink-0" />
          <p className="text-xs text-text-2">
            All {totalTools} tools from enabled servers are allowed. Uncheck specific tools to restrict access.
          </p>
        </div>
      )}

      {allMcpServers.length === 0 && (
        <div className="text-center py-10">
          <Server className="w-8 h-8 text-text-3 mx-auto mb-2" />
          <p className="text-sm text-text-3">No MCP servers configured.</p>
        </div>
      )}

      {/* Server cards */}
      {allMcpServers.map((server) => {
        const isEnabled   = selectedServerIds.includes(server.id);
        const tools: McpTool[] = server.tools ?? [];
        const isExpanded  = expanded.has(server.id);
        const enabledToolCount = allAllowed ? tools.length : tools.filter((t) => allowedIds.has(t.id)).length;
        const allServerEnabled  = allAllowed || tools.every((t) => allowedIds.has(t.id));
        const noneServerEnabled = !allAllowed && tools.every((t) => !allowedIds.has(t.id));

        return (
          <div
            key={server.id}
            className={cn(
              "rounded-xl border overflow-hidden transition-colors",
              isEnabled ? "border-border" : "border-border/50 opacity-60",
            )}
          >
            {/* Server header */}
            <div className="flex items-start gap-2 px-3 py-2.5 bg-surface-2/50">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={() => toggleServer(server.id)}
                className="accent-violet shrink-0 cursor-pointer mt-0.5"
                id={`server-${server.id}`}
              />
              <label htmlFor={`server-${server.id}`} className="flex flex-col flex-1 min-w-0 cursor-pointer gap-0.5">
                <div className="flex items-center gap-2">
                  <Server className="w-3.5 h-3.5 text-text-3 shrink-0" />
                  <span className="text-xs font-semibold text-text-1 truncate">{server.name}</span>
                  {isEnabled && (
                    <span className="text-[10px] text-text-3 bg-surface-2 px-1.5 py-0.5 rounded shrink-0">
                      {enabledToolCount}/{tools.length} tools
                    </span>
                  )}
                </div>
                {/* Server endpoint URL */}
                {server.url && (
                  <div className="flex items-center gap-1 ml-5">
                    <Globe className="w-2.5 h-2.5 text-text-3 shrink-0" />
                    <span className="text-[10px] font-mono text-text-3 truncate">{server.url}</span>
                  </div>
                )}
                {server.description && (
                  <p className="text-[10px] text-text-3 ml-5 leading-relaxed">{server.description}</p>
                )}
              </label>

              {isEnabled && tools.length > 0 && (
                <div className="flex items-center gap-2 shrink-0">
                  {!allServerEnabled && (
                    <button onClick={() => setServerTools(server, true)} className="text-[10px] text-violet hover:text-violet/80 transition-colors">
                      All
                    </button>
                  )}
                  {!noneServerEnabled && tools.length > 0 && (
                    <button onClick={() => setServerTools(server, false)} className="text-[10px] text-text-3 hover:text-rose-400 transition-colors">
                      None
                    </button>
                  )}
                  <button
                    onClick={() => toggleExpand(server.id)}
                    className="p-0.5 text-text-3 hover:text-text-2 transition-colors"
                  >
                    <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isExpanded && "rotate-180")} />
                  </button>
                </div>
              )}
            </div>

            {/* Tool list */}
            {isEnabled && isExpanded && (
              <ul className="divide-y divide-border/40 border-t border-border/40">
                {tools.length === 0 ? (
                  <li className="px-3 py-3 text-xs text-text-3 italic">No tools discovered for this server.</li>
                ) : (
                  tools.map((tool) => {
                    const checked = allAllowed || allowedIds.has(tool.id);
                    return (
                      <li key={tool.id} className="flex items-start gap-2.5 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTool(tool.id, server.id)}
                          className="mt-0.5 accent-violet shrink-0 cursor-pointer"
                          id={`tool-${tool.id}`}
                        />
                        <label
                          htmlFor={`tool-${tool.id}`}
                          className={cn("flex flex-col gap-1 cursor-pointer flex-1 min-w-0", !checked && "opacity-50")}
                        >
                          {/* Tool name */}
                          <span className="text-xs font-semibold font-mono text-text-1 truncate">{tool.name}</span>

                          {/* Endpoint: method + path */}
                          {(tool.http_method || tool.path) && (
                            <div className="flex items-center gap-1.5">
                              {tool.http_method && (
                                <span className={cn(
                                  "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide shrink-0",
                                  METHOD_COLORS[tool.http_method.toUpperCase()] ?? "text-text-3 bg-surface-2",
                                )}>
                                  {tool.http_method}
                                </span>
                              )}
                              {tool.path && (
                                <span className="text-[10px] font-mono text-text-3 truncate">{tool.path}</span>
                              )}
                            </div>
                          )}

                          {/* Description */}
                          {tool.description && (
                            <span className="text-[10px] text-text-3 leading-relaxed line-clamp-2">{tool.description}</span>
                          )}
                        </label>
                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
