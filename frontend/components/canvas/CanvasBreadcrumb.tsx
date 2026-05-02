"use client";

import { ChevronRight, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/cn";

type CanvasNav = { level: "root" } | { level: "swarm"; swarmId: string };

interface CanvasBreadcrumbProps {
  nav: CanvasNav;
  swarmName: string | null;
  onNavigateRoot: () => void;
}

export function CanvasBreadcrumb({ nav, swarmName, onNavigateRoot }: CanvasBreadcrumbProps) {
  if (nav.level === "root") {
    return (
      <div className="flex items-center gap-1.5">
        <LayoutGrid className="w-3.5 h-3.5 text-text-3" />
        <span className="text-sm font-medium text-text-3">Canvas</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onNavigateRoot}
        className="flex items-center gap-1.5 text-sm text-text-3 hover:text-text-2 transition-colors"
      >
        <LayoutGrid className="w-3.5 h-3.5" />
        <span>Canvas</span>
      </button>
      <ChevronRight className="w-3.5 h-3.5 text-text-3" />
      <span
        className={cn("text-sm font-medium", swarmName ? "text-violet" : "text-text-3")}
        data-testid="breadcrumb-current"
      >
        {swarmName ?? nav.swarmId}
      </span>
    </div>
  );
}
