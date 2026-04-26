import { cn } from "@/lib/cn";

type Status = "published" | "draft" | "archived" | "running" | "completed" | "failed" | "pending" | "awaiting_approval";

const styles: Record<Status, string> = {
  published: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  draft: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
  archived: "bg-zinc-700/15 text-zinc-600 border-zinc-700/25",
  running: "bg-violet-500/15 text-violet-400 border-violet-500/25 animate-pulse",
  completed: "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
  failed: "bg-rose-500/15 text-rose-400 border-rose-500/25",
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  awaiting_approval: "bg-orange-500/15 text-orange-400 border-orange-500/25 animate-pulse",
};

const dots: Record<Status, string> = {
  published: "bg-emerald-400",
  draft: "bg-zinc-500",
  archived: "bg-zinc-700",
  running: "bg-violet-400 animate-ping",
  completed: "bg-cyan-400",
  failed: "bg-rose-400",
  pending: "bg-amber-400",
  awaiting_approval: "bg-orange-400 animate-ping",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border",
        styles[status] ?? styles.draft
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", dots[status] ?? dots.draft)} />
      {status}
    </span>
  );
}
