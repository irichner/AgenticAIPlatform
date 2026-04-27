"use client";

import { useCallback } from "react";
import { useStore, getBezierPath, BaseEdge, Position } from "@xyflow/react";
import type { EdgeProps, ReactFlowState } from "@xyflow/react";

// ── Minimal internal-node shape we rely on ────────────────────────────────────
type InternalNode = {
  internals: { positionAbsolute: { x: number; y: number } };
  measured?: { width?: number; height?: number };
};

function center(node: InternalNode) {
  const w = node.measured?.width ?? 0;
  const h = node.measured?.height ?? 0;
  return {
    x: node.internals.positionAbsolute.x + w / 2,
    y: node.internals.positionAbsolute.y + h / 2,
  };
}

// Where the straight line from nodeCenter toward `target` exits the node border.
function borderPoint(node: InternalNode, target: { x: number; y: number }) {
  const w = node.measured?.width ?? 0;
  const h = node.measured?.height ?? 0;
  const c = center(node);
  const dx = target.x - c.x;
  const dy = target.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const sx = dx !== 0 ? (w / 2) / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? (h / 2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

// Which side of the node does the border point sit on?
function side(pt: { x: number; y: number }, c: { x: number; y: number }): Position {
  const dx = pt.x - c.x;
  const dy = pt.y - c.y;
  return Math.abs(dx) >= Math.abs(dy)
    ? dx >= 0 ? Position.Right : Position.Left
    : dy >= 0 ? Position.Bottom : Position.Top;
}

// ── Edge data type (label + condition metadata) ───────────────────────────────
export type EdgeData = {
  label?: string;
  condition?: string;
  edgeType?: "sequence" | "conditional" | "default";
};

// ── Floating edge component ───────────────────────────────────────────────────

export function FloatingEdge({
  id, source, target, markerEnd, style,
  label, labelStyle, labelBgStyle,
  data,
}: EdgeProps) {
  const sourceNode = useStore(
    useCallback((s: ReactFlowState) => s.nodeLookup.get(source) as InternalNode | undefined, [source]),
  );
  const targetNode = useStore(
    useCallback((s: ReactFlowState) => s.nodeLookup.get(target) as InternalNode | undefined, [target]),
  );

  if (!sourceNode || !targetNode) return null;

  const sc = center(sourceNode);
  const tc = center(targetNode);
  const sp = borderPoint(sourceNode, tc);
  const tp = borderPoint(targetNode, sc);

  const [path] = getBezierPath({
    sourceX: sp.x,
    sourceY: sp.y,
    sourcePosition: side(sp, sc),
    targetX: tp.x,
    targetY: tp.y,
    targetPosition: side(tp, tc),
  });

  // Label is placed at the geometric midpoint of the two border points
  const labelX = (sp.x + tp.x) / 2;
  const labelY = (sp.y + tp.y) / 2;

  // Resolve display label: prefer explicit `label` prop, fall back to edge data
  const displayLabel = label ?? (data as EdgeData | undefined)?.label;

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      style={style}
      label={displayLabel}
      labelX={labelX}
      labelY={labelY}
      labelStyle={{
        fill: "rgba(255,255,255,0.88)",
        fontSize: 11,
        fontWeight: 500,
        fontFamily: "inherit",
        ...labelStyle,
      }}
      labelBgStyle={{
        fill: "rgba(10,10,20,0.82)",
        ...labelBgStyle,
      }}
      labelBgPadding={[4, 8]}
      labelBgBorderRadius={6}
    />
  );
}
