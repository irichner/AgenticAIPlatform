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
  addEdge,
  type Node,
  type Edge,
  type Connection,
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
const ZONE_W         = 780;   // fixed zone width
const ZONE_MIN_H     = 360;   // minimum zone height (looks substantial when empty)
const COLLAPSED_H    = 72;
const ZONE_PAD       = 28;
const ZONE_HEADER    = 88;    // taller header for enterprise look
const ZONE_GAP_X     = 52;    // horizontal gap between columns
const ZONE_GAP_Y     = 44;    // vertical gap between rows
const COLS           = 2;     // 2-column masonry grid
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

  // Track height of each column for masonry placement
  const colHeights = new Array(COLS).fill(0);
  const availableGroupW = ZONE_W - ZONE_PAD * 2;

  businessUnits.forEach((bu, buIdx) => {
    const buAgents  = agents.filter((a) => a.business_unit_id === bu.id);
    const buGroups  = groups.filter((g) => g.business_unit_id === bu.id);
    const buGroupIds = new Set(buGroups.map((g) => g.id));
    const ungroupedAgents = buAgents.filter((a) => !a.group_id || !buGroupIds.has(a.group_id));
    const liveCount = buAgents.filter((a) => a.status === "published").length;
    const zoneId    = `zone-${bu.id}`;

    // ── Size every group ─────────────────────────────────────────────────────
    const gSizes = buGroups.map((group) => {
      const n = agents.filter((a) => a.group_id === group.id).length;
      return groupDims(n);
    });

    // ── Layout groups in rows (wrap when they exceed zone width) ─────────────
    let gX = 0;
    let gY = ZONE_HEADER + ZONE_PAD;
    let rowMaxH = 0;
    const gPositions: { x: number; y: number }[] = [];

    buGroups.forEach((_, gi) => {
      const gs = gSizes[gi];
      if (gX > 0 && gX + gs.w > availableGroupW) {
        // Wrap to next row
        gX = 0;
        gY += rowMaxH + GROUP_GAP;
        rowMaxH = 0;
      }
      gPositions.push({ x: ZONE_PAD + gX, y: gY });
      gX += gs.w + GROUP_GAP;
      rowMaxH = Math.max(rowMaxH, gs.h);
    });

    const groupAreaBottom =
      buGroups.length > 0
        ? gY + rowMaxH + GROUP_GAP
        : ZONE_HEADER + ZONE_PAD;

    // ── Ungrouped agent area ─────────────────────────────────────────────────
    const uCols = Math.max(1, Math.min(ungroupedAgents.length || 1, AGENTS_PER_ROW));
    const uRows = ungroupedAgents.length > 0 ? Math.ceil(ungroupedAgents.length / AGENTS_PER_ROW) : 0;
    const ungroupedH = uRows > 0 ? uRows * AGENT_H + (uRows - 1) * AGENT_GAP + ZONE_PAD : 0;

    const zoneH = Math.max(groupAreaBottom + ungroupedH, ZONE_MIN_H);

    // ── Masonry column placement ─────────────────────────────────────────────
    const col = colHeights.indexOf(Math.min(...colHeights));
    const x = col * (ZONE_W + ZONE_GAP_X);
    const y = colHeights[col];

    // ── Department zone ──────────────────────────────────────────────────────
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

    // ── Group sub-zones ──────────────────────────────────────────────────────
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
            data: {
              id: agent.id,
              name: agent.name,
              description: agent.description,
              status: agent.status,
              onRun,
              onSelect,
            } as unknown as Record<string, unknown>,
            draggable: true,
          });
        });
    });

    // ── Ungrouped agents (no extent constraint — free to drag between zones) ──
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
        data: {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          status: agent.status,
          onRun,
          onSelect,
        } as unknown as Record<string, unknown>,
        draggable: true,
      });
    });

    colHeights[col] += zoneH + ZONE_GAP_Y;
  });

  return { nodes, edges: [] };
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

  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;
  const onSelectAgentRef = useRef(onSelectAgent);
  onSelectAgentRef.current = onSelectAgent;
  const onDeselectRef = useRef(onDeselect);
  onDeselectRef.current = onDeselect;

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

  useEffect(() => {
    setNodes(layout.nodes);
    setEdges(layout.edges);
  }, [layout, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, draggedNode: Node, allNodes: Node[]) => {
      if (draggedNode.type !== "agentNode" || !onReassignRef.current) return;

      const agentId   = draggedNode.id.replace(/^agent-/, "");
      const parentId  = draggedNode.parentId;
      const parentZone = allNodes.find((n) => n.id === parentId);
      const parentX   = parentZone?.position.x ?? 0;
      const parentY   = parentZone?.position.y ?? 0;

      const absX    = parentX + draggedNode.position.x;
      const absY    = parentY + draggedNode.position.y;
      const centerX = absX + AGENT_W / 2;
      const centerY = absY + AGENT_H / 2;

      const targetZone = allNodes.find((n) => {
        if (n.type !== "unitZone") return false;
        const zoneW = (n.style?.width as number) ?? ZONE_W;
        const zoneH = (n.style?.height as number) ?? ZONE_MIN_H;
        return (
          centerX >= n.position.x &&
          centerX <= n.position.x + zoneW &&
          centerY >= n.position.y &&
          centerY <= n.position.y + zoneH
        );
      });

      if (targetZone && targetZone.id !== parentId) {
        const newBuId = targetZone.id.replace(/^zone-/, "");
        onReassignRef.current(agentId, newBuId);
      }
    },
    [],
  );

  const handlePaneClick = useCallback(() => {
    onDeselectRef.current?.();
  }, []);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type !== "agentNode") onDeselectRef.current?.();
  }, []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeDragStop={handleNodeDragStop}
      onPaneClick={handlePaneClick}
      onNodeClick={handleNodeClick}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.12 }}
      minZoom={0.08}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
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
