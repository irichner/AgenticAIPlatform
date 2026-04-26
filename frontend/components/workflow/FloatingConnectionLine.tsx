"use client";

import { getBezierPath, Position } from "@xyflow/react";
import type { ConnectionLineComponentProps } from "@xyflow/react";

export function FloatingConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
}: ConnectionLineComponentProps) {
  // Determine which side the preview line exits toward the cursor
  const dx = toX - fromX;
  const dy = toY - fromY;
  const fromPosition =
    Math.abs(dx) >= Math.abs(dy)
      ? dx >= 0 ? Position.Right : Position.Left
      : dy >= 0 ? Position.Bottom : Position.Top;

  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: Position.Left,
  });

  return (
    <g>
      <path
        fill="none"
        stroke="rgba(139,92,246,0.5)"
        strokeWidth={2}
        strokeDasharray="5"
        d={path}
      />
      <circle cx={toX} cy={toY} r={4} fill="rgba(139,92,246,0.7)" />
    </g>
  );
}
