"use client";

import { useState, useCallback } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

interface Props {
  agentId: string;
  agentName: string;
  agentDescription: string;
  agentSwarmName: string;
  prompt: string;
  onPromptChange: (p: string) => void;
}

export function AgentPromptTab({
  agentId,
  agentName,
  agentDescription,
  agentSwarmName,
  prompt,
  onPromptChange,
}: Props) {
  const [generating, setGenerating] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!agentName.trim()) return;
    setGenerating(true);
    try {
      const res = await api.agents.generateInstructions({
        name: agentName.trim(),
        description: agentDescription.trim() || undefined,
        swarm_name: agentSwarmName,
      });
      onPromptChange(res.prompt);
    } catch { /* ignore */ } finally {
      setGenerating(false);
    }
  }, [agentName, agentDescription, agentSwarmName, onPromptChange]);

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
