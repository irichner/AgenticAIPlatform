"use client";

import { useState, type FormEvent } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { useBranding } from "@/components/shared/BrandingProvider";

interface CommandBarProps {
  placeholder?: string;
  onSubmit: (value: string) => void;
  loading?: boolean;
  className?: string;
}

export function CommandBar({
  placeholder,
  onSubmit,
  loading = false,
  className,
}: CommandBarProps) {
  const [value, setValue] = useState("");
  const { appName } = useBranding();
  const resolvedPlaceholder = placeholder ?? `Ask ${appName} to build an agent…`;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    onSubmit(trimmed);
    setValue("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "flex items-center gap-3 glass rounded-2xl px-4 py-2.5 focus-within:border-violet/50 transition-colors",
        className
      )}
    >
      <Sparkles className="w-4 h-4 text-violet shrink-0" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={resolvedPlaceholder}
        disabled={loading}
        className="flex-1 bg-transparent text-sm text-text-1 placeholder:text-text-3 outline-none min-w-0"
      />
      <button
        type="submit"
        disabled={!value.trim() || loading}
        className="shrink-0 w-7 h-7 rounded-lg bg-violet/20 hover:bg-violet/35 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
      >
        <ArrowRight className="w-3.5 h-3.5 text-violet" />
      </button>
    </form>
  );
}
