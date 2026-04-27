"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useNodes,
  type Node,
  type Edge,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { AgentNode } from "./AgentNode";
import { UnitZoneNode, type UnitZoneData } from "./UnitZoneNode";
import { GroupZoneNode } from "./GroupZoneNode";
import type { BusinessUnit, Agent, AgentGroup } from "@/lib/api";

const nodeTypes = {
  agentNode: AgentNode,
  unitZone: UnitZoneNode,
  groupZone: GroupZoneNode,
};

// ── Layout constants ──────────────────────────────────────────────────────────
const ZONE_W         = 780;
const ZONE_MIN_H     = 360;
const COLLAPSED_H    = 72;
const ZONE_PAD       = 28;
const ZONE_HEADER    = 88;
const ZONE_GAP_X     = 52;
const ZONE_GAP_Y     = 44;
const COLS           = 2;
const GROUP_PAD      = 16;
const GROUP_HEADER   = 44;
const GROUP_GAP      = 20;
const AGENT_W        = 196;
const AGENT_H        = 140;
const AGENT_GAP      = 14;
const AGENTS_PER_ROW = 3;

function groupDims(agentCount: number): { w: number; h: number } {
  const n = Math.max(agentCount, 0);
  const cols = Math.max(1, Math.min(n || 1, AGENTS_PER_ROW));
  const rows = n > 0 ? Math.ceil(n / AGENTS_PER_ROW) : 1;
  return {
    w: GROUP_PAD * 2 + cols * AGENT_W + (cols - 1) * AGENT_GAP,
    h: GROUP_HEADER + GROUP_PAD + rows * AGENT_H + (rows - 1) * AGENT_GAP + GROUP_PAD,
  };
}

function buildLayout(
  businessUnits: BusinessUnit[],
  agents: Agent[],
  groups: AgentGroup[],
  onRun: (id: string) => void,
  onToggleCollapse: (unitId: string) => void,
  onSelect: (id: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const colHeights = new Array(COLS).fill(0);
  const availableGroupW = ZONE_W - ZONE_PAD * 2;

  businessUnits.forEach((bu, buIdx) => {
    const buAgents       = agents.filter((a) => a.business_unit_id === bu.id);
    const buGroups       = groups.filter((g) => g.business_unit_id === bu.id);
    const buGroupIds     = new Set(buGroups.map((g) => g.id));
    const ungroupedAgents = buAgents.filter((a) => !a.group_id || !buGroupIds.has(a.group_id));
    const liveCount      = buAgents.filter((a) => a.status === "published").length;
    const zoneId         = `zone-${bu.id}`;

    const gSizes = buGroups.map((group) => {
      const n = agents.filter((a) => a.group_id === group.id).length;
      return groupDims(n);
    });

    let gX = 0, gY = ZONE_HEADER + ZONE_PAD, rowMaxH = 0;
    const gPositions: { x: number; y: number }[] = [];

    buGroups.forEach((_, gi) => {
      const gs = gSizes[gi];
      if (gX > 0 && gX + gs.w > availableGroupW) {
        gX = 0; gY += rowMaxH + GROUP_GAP; rowMaxH = 0;
      }
      gPositions.push({ x: ZONE_PAD + gX, y: gY });
      gX += gs.w + GROUP_GAP;
      rowMaxH = Math.max(rowMaxH, gs.h);
    });

    const groupAreaBottom =
      buGroups.length > 0 ? gY + rowMaxH + GROUP_GAP : ZONE_HEADER + ZONE_PAD;

    const uCols = Math.max(1, Math.min(ungroupedAgents.length || 1, AGENTS_PER_ROW));
    const uRows = ungroupedAgents.length > 0 ? Math.ceil(ungroupedAgents.length / AGENTS_PER_ROW) : 0;
    const ungroupedH = uRows > 0 ? uRows * AGENT_H + (uRows - 1) * AGENT_GAP + ZONE_PAD : 0;
    const zoneH = Math.max(groupAreaBottom + ungroupedH, ZONE_MIN_H);

    const col = colHeights.indexOf(Math.min(...colHeights));
    const x = col * (ZONE_W + ZONE_GAP_X);
    const y = colHeights[col];

    nodes.push({
      id: zoneId,
      type: "unitZone",
      position: { x, y },
      style: { width: ZONE_W, height: zoneH },
      data: {
        name: bu.name,
        agentCount: buAgents.length,
        liveCount,
        groupCount: buGroups.length,
        colorIndex: buIdx,
        collapsed: false,
        naturalHeight: zoneH,
        unitId: bu.id,
        onToggleCollapse,
      } as unknown as Record<string, unknown>,
      draggable: true,
    });

    buGroups.forEach((group, gi) => {
      const groupId = `group-${group.id}`;
      nodes.push({
        id: groupId,
        type: "groupZone",
        parentId: zoneId,
        extent: "parent",
        position: gPositions[gi],
        style: { width: gSizes[gi].w, height: gSizes[gi].h },
        data: { name: group.name, colorIndex: buIdx } as unknown as Record<string, unknown>,
        draggable: true,
      });

      agents
        .filter((a) => a.group_id === group.id)
        .forEach((agent, ai) => {
          const col2 = ai % AGENTS_PER_ROW;
          const row  = Math.floor(ai / AGENTS_PER_ROW);
          nodes.push({
            id: `agent-${agent.id}`,
            type: "agentNode",
            parentId: groupId,
            extent: "parent",
            position: {
              x: GROUP_PAD + col2 * (AGENT_W + AGENT_GAP),
              y: GROUP_HEADER + GROUP_PAD + row * (AGENT_H + AGENT_GAP),
            },
            data: { id: agent.id, name: agent.name, description: agent.description, status: agent.status, mcpCount: agent.mcp_servers?.length ?? 0, mcpNames: agent.mcp_servers?.map((s) => s.name) ?? [], onRun, onSelect } as unknown as Record<string, unknown>,
            draggable: true,
          });
        });
    });

    ungroupedAgents.forEach((agent, ai) => {
      const col2 = ai % uCols;
      const row  = Math.floor(ai / uCols);
      nodes.push({
        id: `agent-${agent.id}`,
        type: "agentNode",
        parentId: zoneId,
        position: {
          x: ZONE_PAD + col2 * (AGENT_W + AGENT_GAP),
          y: groupAreaBottom + row * (AGENT_H + AGENT_GAP),
        },
        data: { id: agent.id, name: agent.name, description: agent.description, status: agent.status, mcpCount: agent.mcp_servers?.length ?? 0, mcpNames: agent.mcp_servers?.map((s) => s.name) ?? [], onRun, onSelect } as unknown as Record<string, unknown>,
        draggable: true,
      });
    });

    colHeights[col] += zoneH + ZONE_GAP_Y;
  });

  return { nodes, edges: [] };
}

// ── Layout persistence ────────────────────────────────────────────────────────

const CANVAS_LAYOUT_KEY = "lanara-canvas-layout";

interface CanvasSavedState {
  positions: Record<string, { x: number; y: number }>; // zoneId → position
  viewport: Viewport;
}

function loadCanvasState(): CanvasSavedState | null {
  try {
    const raw = localStorage.getItem(CANVAS_LAYOUT_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function saveCanvasState(state: CanvasSavedState) {
  try { localStorage.setItem(CANVAS_LAYOUT_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

// ── FitViewHelper — calls fitView once after nodes first appear ───────────────
// Must be rendered as a child of <ReactFlow> to access its context.

function FitViewHelper({ enabled }: { enabled: boolean }) {
  const { fitView } = useReactFlow();
  const nodes = useNodes();
  const done = useRef(false);
  useEffect(() => {
    if (!enabled || done.current || nodes.length === 0) return;
    done.current = true;
    fitView({ padding: 0.18, minZoom: 0.35 });
  }, [enabled, nodes.length, fitView]);
  return null;
}

// ── CanvasView ────────────────────────────────────────────────────────────────

interface CanvasViewProps {
  businessUnits: BusinessUnit[];
  agents: Agent[];
  groups: AgentGroup[];
  onRun: (agentId: string) => void;
  onSelectAgent?: (agentId: string) => void;
  onDeselect?: () => void;
  onReassign?: (agentId: string, newBuId: string) => void;
}

export function CanvasView({ businessUnits, agents, groups, onRun, onSelectAgent, onDeselect, onReassign }: CanvasViewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Stable ref to saved state so it doesn't trigger re-renders
  const savedState = useRef<CanvasSavedState | null>(loadCanvasState());
  const hasSavedLayout = savedState.current !== null;

  const onToggleCollapseRef = useRef<(unitId: string) => void>(() => {});
  const onReassignRef       = useRef(onReassign);
  onReassignRef.current     = onReassign;

  const toggleCollapse = useCallback(
    (unitId: string) => {
      setNodes((nds) => {
        const zoneId = `zone-${unitId}`;
        const zone = nds.find((n) => n.id === zoneId);
        if (!zone) return nds;
        const isCollapsed = !!(zone.data as UnitZoneData).collapsed;
        const willCollapse = !isCollapsed;
        const naturalHeight = (zone.data as UnitZoneData).naturalHeight;
        const directChildIds = new Set(nds.filter((n) => n.parentId === zoneId).map((n) => n.id));
        return nds.map((node) => {
          if (node.id === zoneId) {
            return {
              ...node,
              style: { ...node.style, height: willCollapse ? COLLAPSED_H : naturalHeight },
              data: { ...node.data, collapsed: willCollapse },
            };
          }
          if (directChildIds.has(node.id) || (node.parentId && directChildIds.has(node.parentId))) {
            return { ...node, hidden: willCollapse };
          }
          return node;
        });
      });
    },
    [setNodes],
  );

  onToggleCollapseRef.current = toggleCollapse;

  const onRunRef          = useRef(onRun);          onRunRef.current          = onRun;
  const onSelectAgentRef  = useRef(onSelectAgent);  onSelectAgentRef.current  = onSelectAgent;
  const onDeselectRef     = useRef(onDeselect);     onDeselectRef.current     = onDeselect;

  const layout = useMemo(
    () =>
      buildLayout(
        businessUnits,
        agents,
        groups,
        (id) => onRunRef.current(id),
        (unitId) => onToggleCollapseRef.current(unitId),
        (id) => onSelectAgentRef.current?.(id),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [businessUnits, agents, groups],
  );

  // Apply layout, merging saved zone positions so user rearrangements persist
  useEffect(() => {
    const saved = savedState.current?.positions ?? {};
    const merged = layout.nodes.map((n) => {
      if (n.type === "unitZone" && saved[n.id]) {
        return { ...n, position: saved[n.id] };
      }
      return n;
    });
    setNodes(merged);
    setEdges(layout.edges);
  }, [layout, setNodes, setEdges]);

  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, draggedNode: Node, allNodes: Node[]) => {
      // Persist zone positions after any drag
      const positions: Record<string, { x: number; y: number }> = {
        ...(savedState.current?.positions ?? {}),
      };
      allNodes
        .filter((n) => n.type === "unitZone")
        .forEach((n) => { positions[n.id] = n.position; });
      const next: CanvasSavedState = {
        positions,
        viewport: savedState.current?.viewport ?? { x: 0, y: 0, zoom: 0.7 },
      };
      savedState.current = next;
      saveCanvasState(next);

      // Agent reassign logic
      if (draggedNode.type !== "agentNode" || !onReassignRef.current) return;
      const agentId    = draggedNode.id.replace(/^agent-/, "");
      const parentId   = draggedNode.parentId;
      const parentZone = allNodes.find((n) => n.id === parentId);
      const parentX    = parentZone?.position.x ?? 0;
      const parentY    = parentZone?.position.y ?? 0;
      const absX       = parentX + draggedNode.position.x;
      const absY       = parentY + draggedNode.position.y;
      const centerX    = absX + AGENT_W / 2;
      const centerY    = absY + AGENT_H / 2;

      const targetZone = allNodes.find((n) => {
        if (n.type !== "unitZone") return false;
        const zoneW = (n.style?.width as number) ?? ZONE_W;
        const zoneH = (n.style?.height as number) ?? ZONE_MIN_H;
        return centerX >= n.position.x && centerX <= n.position.x + zoneW &&
               centerY >= n.position.y && centerY <= n.position.y + zoneH;
      });

      if (targetZone && targetZone.id !== parentId) {
        onReassignRef.current(agentId, targetZone.id.replace(/^zone-/, ""));
      }
    },
    [],
  );

  // Persist viewport after pan/zoom ends
  const handleMoveEnd = useCallback((_: MouseEvent | TouchEvent, viewport: Viewport) => {
    const next: CanvasSavedState = {
      positions: savedState.current?.positions ?? {},
      viewport,
    };
    savedState.current = next;
    saveCanvasState(next);
  }, []);

  const handlePaneClick = useCallback(() => { onDeselectRef.current?.(); }, []);
  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type !== "agentNode") onDeselectRef.current?.();
  }, []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={handleNodeDragStop}
      onMoveEnd={handleMoveEnd}
      onPaneClick={handlePaneClick}
      onNodeClick={handleNodeClick}
      nodeTypes={nodeTypes}
      defaultViewport={savedState.current?.viewport ?? { x: 60, y: 60, zoom: 0.75 }}
      minZoom={0.08}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      {/* Fit to content only on first load (no saved layout) */}
      <FitViewHelper enabled={!hasSavedLayout} />
      <Background
        variant={BackgroundVariant.Dots}
        gap={28}
        size={1}
        color="rgba(255,255,255,0.06)"
      />
      <Controls position="bottom-left" />
      <MiniMap
        position="bottom-right"
        nodeColor={(node) => {
          if (node.type === "unitZone")  return "rgba(139,92,246,0.35)";
          if (node.type === "groupZone") return "rgba(139,92,246,0.15)";
          return "rgba(255,255,255,0.2)";
        }}
        maskColor="rgba(6,6,11,0.88)"
      />
    </ReactFlow>
  );
}
