"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { type AgentVersion } from "@/lib/api";
import { cn } from "@/lib/cn";

interface Props {
  versions: AgentVersion[];
  activeNodeId: string | null;
}

// Default ReAct topology when no graph_definition is provided
const DEFAULT_REACT_NODES = ["__start__", "agent", "hil_check", "tools", "__end__"];
const DEFAULT_REACT_EDGES: [string, string][] = [
  ["__start__", "agent"],
  ["agent", "hil_check"],
  ["hil_check", "tools"],
  ["tools", "agent"],
  ["agent", "__end__"],
];

function buildDefaultGraph(): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = DEFAULT_REACT_NODES.map((id, i) => ({
    id,
    data: { label: id === "__start__" ? "START" : id === "__end__" ? "END" : id },
    position: { x: 150, y: i * 90 },
    style: { width: 140 },
  }));

  const edges: Edge[] = DEFAULT_REACT_EDGES.map(([source, target], i) => ({
    id: `e${i}`,
    source,
    target,
    markerEnd: { type: MarkerType.ArrowClosed },
  }));

  return { nodes, edges };
}

function buildFromDefinition(def: Record<string, unknown>): { nodes: Node[]; edges: Edge[] } {
  const rawNodes = def.nodes as Array<{ id: string; label?: string; x?: number; y?: number }> | undefined;
  const rawEdges = def.edges as Array<{ source: string; target: string }> | undefined;

  if (!rawNodes || rawNodes.length === 0) return buildDefaultGraph();

  const nodes: Node[] = rawNodes.map((n, i) => ({
    id: n.id,
    data: { label: n.label ?? n.id },
    position: { x: n.x ?? 150, y: n.y ?? i * 90 },
    style: { width: 140 },
  }));

  const edges: Edge[] = (rawEdges ?? []).map((e, i) => ({
    id: `e${i}`,
    source: e.source,
    target: e.target,
    markerEnd: { type: MarkerType.ArrowClosed },
  }));

  return { nodes, edges };
}

export function AgentGraphTab({ versions, activeNodeId }: Props) {
  const latestVersion = versions[0] ?? null;
  const graphDef = latestVersion?.graph_definition ?? null;

  const { nodes, edges } = useMemo(() => {
    return graphDef ? buildFromDefinition(graphDef) : buildDefaultGraph();
  }, [graphDef]);

  // Apply active node highlighting
  const styledNodes: Node[] = useMemo(() => {
    return nodes.map((n) => {
      const isActive = activeNodeId !== null && n.id === activeNodeId;
      return {
        ...n,
        style: {
          ...n.style,
          borderColor: isActive ? "var(--color-violet, #7c3aed)" : undefined,
          borderWidth: isActive ? 2 : 1,
          boxShadow: isActive ? "0 0 0 3px rgba(124,58,237,0.25)" : undefined,
          background: "var(--color-surface-2, #1e1e2e)",
          color: "var(--color-text-1, #f8f8f2)",
          fontSize: "11px",
          borderRadius: "8px",
        },
      };
    });
  }, [nodes, activeNodeId]);

  return (
    <div
      className={cn("w-full h-full bg-surface-0 rounded-xl overflow-hidden")}
      data-testid="agent-graph"
    >
      <ReactFlow
        nodes={styledNodes}
        edges={edges}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background gap={16} color="var(--color-border, #2a2a3d)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
