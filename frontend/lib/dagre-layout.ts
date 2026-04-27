import dagre from "dagre";
import type { Node, Edge } from "@xyflow/react";

export type LayoutDirection = "LR" | "TB";

const NODE_W = 180;
const NODE_H = 70;

export function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
  direction: LayoutDirection = "LR",
): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    ranksep: direction === "LR" ? 100 : 80,
    nodesep: direction === "LR" ? 60  : 50,
    marginx: 40,
    marginy: 40,
  });

  // Exclude group/pool nodes from dagre (they contain children)
  const groupIds = new Set(
    nodes.filter((n) => n.type === "swimlane").map((n) => n.id),
  );

  nodes.forEach((n) => {
    if (groupIds.has(n.id)) return;
    const w = (n.style?.width as number | undefined) ?? NODE_W;
    const h = (n.style?.height as number | undefined) ?? NODE_H;
    g.setNode(n.id, { width: w, height: h });
  });

  edges.forEach((e) => {
    if (!groupIds.has(e.source) && !groupIds.has(e.target)) {
      g.setEdge(e.source, e.target);
    }
  });

  dagre.layout(g);

  return nodes.map((n) => {
    if (groupIds.has(n.id)) return n;
    const pos = g.node(n.id);
    if (!pos) return n;
    const w = (n.style?.width as number | undefined) ?? NODE_W;
    const h = (n.style?.height as number | undefined) ?? NODE_H;
    return {
      ...n,
      position: {
        x: pos.x - w / 2,
        y: pos.y - h / 2,
      },
    };
  });
}
