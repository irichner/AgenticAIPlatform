"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Trash2, Layers, Check, X, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";
import type { BusinessUnit, Agent, AgentGroup } from "@/lib/api";

const zoneAccents = [
  { ring: "ring-violet/30", text: "text-violet", bar: "bg-violet", badge: "bg-violet/15 text-violet border-violet/20" },
  { ring: "ring-cyan/30", text: "text-cyan", bar: "bg-cyan", badge: "bg-cyan/15 text-cyan border-cyan/20" },
  { ring: "ring-amber/30", text: "text-amber", bar: "bg-amber", badge: "bg-amber/15 text-amber border-amber/20" },
  { ring: "ring-rose/30", text: "text-rose", bar: "bg-rose", badge: "bg-rose/15 text-rose border-rose/20" },
  { ring: "ring-emerald/30", text: "text-emerald", bar: "bg-emerald", badge: "bg-emerald/15 text-emerald border-emerald/20" },
];

interface UnitCardProps {
  unit: BusinessUnit;
  agents: Agent[];
  groups: AgentGroup[];
  index: number;
  onCreateAgent: (unitId: string) => void;
  onCreateGroup: (unitId: string, name: string) => Promise<void>;
  onDeleteGroup: (groupId: string) => Promise<void>;
  onDeleteUnit: (unitId: string) => Promise<void>;
}

export function UnitCard({
  unit,
  agents,
  groups,
  index,
  onCreateGroup,
  onDeleteGroup,
  onDeleteUnit,
}: UnitCardProps) {
  const accent = zoneAccents[index % zoneAccents.length];
  const published = agents.filter((a) => a.status === "published").length;
  const attainmentPct = Math.round(55 + ((index * 17 + 31) % 45));

  const [addingGroup, setAddingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingGroup) inputRef.current?.focus();
  }, [addingGroup]);

  const commitGroup = async () => {
    const name = groupName.trim();
    if (!name) { setAddingGroup(false); setGroupName(""); return; }
    setSavingGroup(true);
    try {
      await onCreateGroup(unit.id, name);
    } finally {
      setSavingGroup(false);
      setAddingGroup(false);
      setGroupName("");
    }
  };

  const agentsInGroup = (groupId: string) => agents.filter((a) => a.group_id === groupId).length;
  const ungrouped = agents.filter((a) => !a.group_id).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35, ease: "easeOut" }}
      className={cn(
        "glass glass-hover rounded-2xl p-5 ring-1 flex flex-col gap-4",
        accent.ring
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-text-1 text-sm leading-snug">{unit.name}</h3>
          {unit.description && (
            <p className="text-xs text-text-3 mt-0.5 line-clamp-1">{unit.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-rose-400 flex items-center gap-0.5">
                <AlertTriangle className="w-3 h-3" />Sure?
              </span>
              <button
                onClick={async () => {
                  setDeleting(true);
                  await onDeleteUnit(unit.id);
                }}
                disabled={deleting}
                className="text-xs px-1.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/35 text-rose-400 transition-colors disabled:opacity-40"
              >
                {deleting ? "…" : "Delete"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-text-3 hover:text-text-2 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1 rounded-lg text-text-3 hover:text-rose-400 hover:bg-rose-400/10 transition-colors"
              title="Delete swarm"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Attainment bar */}
      <div>
        <div className="flex justify-between text-xs text-text-3 mb-1.5">
          <span>Token budget</span>
          <span className={cn("font-semibold", accent.text)}>{attainmentPct}%</span>
        </div>
        <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${attainmentPct}%` }}
            transition={{ delay: index * 0.06 + 0.2, duration: 0.6, ease: "easeOut" }}
            className={cn("h-full rounded-full", accent.bar)}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 text-xs text-text-3">
        <div className="flex items-center gap-1.5">
          <Bot className="w-3.5 h-3.5" />
          <span>
            <span className="text-text-2 font-medium">{agents.length}</span> agents
          </span>
        </div>
        <div className="w-px h-3 bg-border" />
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald" />
          <span>
            <span className="text-text-2 font-medium">{published}</span> live
          </span>
        </div>
        <div className="w-px h-3 bg-border" />
        <div className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" />
          <span>
            <span className="text-text-2 font-medium">{groups.length}</span> swarms
          </span>
        </div>
      </div>

      {/* Groups section */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-text-3 uppercase tracking-widest px-0.5">Agent Swarms</p>

        <AnimatePresence initial={false}>
          {groups.map((group) => (
            <GroupRow
              key={group.id}
              group={group}
              agentCount={agentsInGroup(group.id)}
              accent={accent.badge}
              onDelete={onDeleteGroup}
            />
          ))}
        </AnimatePresence>

        {ungrouped > 0 && (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-text-3">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 shrink-0" />
            <span className="flex-1">Ungrouped</span>
            <span className="text-text-3">{ungrouped}</span>
          </div>
        )}

        {groups.length === 0 && ungrouped === 0 && (
          <p className="text-xs text-text-3 px-2 py-1">No swarms yet.</p>
        )}

        {/* Inline new group input */}
        <AnimatePresence>
          {addingGroup && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-1.5 px-2 py-1"
            >
              <input
                ref={inputRef}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitGroup();
                  if (e.key === "Escape") { setAddingGroup(false); setGroupName(""); }
                }}
                placeholder="Swarm name…"
                disabled={savingGroup}
                className="flex-1 bg-surface-2 border border-border rounded-lg px-2 py-1 text-xs text-text-1 placeholder:text-text-3 outline-none focus:border-violet disabled:opacity-50"
              />
              <button
                onClick={commitGroup}
                disabled={savingGroup || !groupName.trim()}
                className="text-emerald-400 hover:text-emerald-300 disabled:opacity-40 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => { setAddingGroup(false); setGroupName(""); }}
                className="text-text-3 hover:text-text-2 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </motion.div>
  );
}

function GroupRow({
  group,
  agentCount,
  accent,
  onDelete,
}: {
  group: AgentGroup;
  agentCount: number;
  accent: string;
  onDelete: (id: string) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try { await onDelete(group.id); } finally { setDeleting(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 6 }}
      className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-2 transition-colors"
    >
      <Layers className="w-3 h-3 text-text-3 shrink-0" />
      <span className="flex-1 text-xs text-text-2 truncate">{group.name}</span>
      <span className={cn("text-xs px-1.5 py-0.5 rounded-full border font-medium", accent)}>
        {agentCount}
      </span>
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="opacity-0 group-hover:opacity-100 text-text-3 hover:text-rose-400 transition-all disabled:opacity-40"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </motion.div>
  );
}
