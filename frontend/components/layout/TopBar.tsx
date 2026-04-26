"use client";

import { CommandBar } from "@/components/shared/CommandBar";

interface TopBarProps {
  title?: string;
  commandPlaceholder?: string;
  onCommand?: (prompt: string) => void;
  commandLoading?: boolean;
}

export function TopBar({ title, commandPlaceholder, onCommand, commandLoading }: TopBarProps) {
  return (
    <header className="flex items-center gap-3 h-14 px-4 border-b border-border glass shrink-0">
      {title && (
        <h1 className="text-sm font-semibold text-text-1 mr-2">{title}</h1>
      )}

      {onCommand && (
        <CommandBar
          placeholder={commandPlaceholder ?? "Ask me to build an agent…"}
          onSubmit={onCommand}
          loading={commandLoading}
          className="flex-1 max-w-xl"
        />
      )}

      {!onCommand && <div className="flex-1" />}
    </header>
  );
}
