"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { api, type AgentDbPolicy } from "@/lib/api";
import { cn } from "@/lib/cn";

interface SelectedMcpServer {
  id: string;
  name: string;
  description?: string | null;
}

interface Props {
  agentId: string;
  agentName: string;
  agentDescription: string;
  agentSwarmName: string;
  selectedMcpServers: SelectedMcpServer[];
  dbPolicies: AgentDbPolicy[];
  prompt: string;
  onPromptChange: (p: string) => void;
}

export function AgentPromptTab({
  agentId,
  agentName,
  agentDescription,
  agentSwarmName,
  selectedMcpServers,
  dbPolicies,
  prompt,
  onPromptChange,
}: Props) {
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const enabledPolicies = dbPolicies.filter((p) => p.enabled);
  const hasToolContext = enabledPolicies.length > 0 || selectedMcpServers.length > 0;

  const handleGenerate = async () => {
    if (!agentName.trim()) return;
    setGenerating(true);
    setGenError(null);
    try {
      // Always fetch fresh policies at generate time — avoids stale/empty SWR cache
      let freshPolicies: AgentDbPolicy[] = enabledPolicies;
      try {
        const fetched = await api.agentDbPolicies.list(agentId);
        freshPolicies = fetched.filter((p) => p.enabled);
      } catch {
        // Fall back to whatever we have from props
      }

      const db_tables = freshPolicies.map((p) => ({
        table: p.table_name,
        operations: p.allowed_operations,
      }));

      const mcp_servers = selectedMcpServers.map((s) =>
        s.description ? `${s.name} — ${s.description}` : s.name,
      );

      const res = await api.agents.generateInstructions({
        name: agentName.trim(),
        description: agentDescription.trim() || undefined,
        swarm_name: agentSwarmName,
        mcp_servers: mcp_servers.length > 0 ? mcp_servers : undefined,
        db_tables: db_tables.length > 0 ? db_tables : undefined,
      });
      onPromptChange(res.prompt);
    } catch (err) {
      setGenError(String(err));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex flex-col gap-3 p-4 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-text-3 uppercase tracking-widest">Instructions</span>
          <button
            onClick={handleGenerate}
            disabled={generating || !agentName.trim()}
            title={generating ? "Generating…" : "Generate instructions with AI"}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg disabled:opacity-40 transition-colors border border-violet/25",
              "bg-violet/12 hover:bg-violet/22",
            )}
          >
            {generating
              ? <Loader2 className="w-4 h-4 animate-spin text-violet" />
              : <Sparkles className="w-4 h-4 text-violet" />}
            <span className="text-[11px] font-semibold text-violet">
              {generating ? "Generating…" : "Generate with AI"}
            </span>
          </button>
        </div>

        {genError && (
          <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{genError}</p>
        )}

        {hasToolContext ? (
          <div className="flex flex-wrap gap-1.5">
            {enabledPolicies.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan/10 text-cyan text-[10px] font-mono">
                {p.table_name}
                <span className="text-cyan/60">({p.allowed_operations.join(", ")})</span>
              </span>
            ))}
            {selectedMcpServers.map((s) => (
              <span key={s.id} className="px-2 py-0.5 rounded-md bg-violet/10 text-violet text-[10px]">
                {s.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-text-3 italic">
            No Memory tables or MCP servers configured — generated prompt will not include tool instructions.
            Set them up in the Memory and MCP tabs first.
          </p>
        )}

        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="System prompt or instructions for this agent…"
          className="w-full flex-1 min-h-[300px] bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-violet resize-none leading-relaxed"
          rows={14}
        />
      </div>
    </div>
  );
}
