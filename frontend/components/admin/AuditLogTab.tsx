"use client";

import { useState } from "react";
import useSWR from "swr";
import { Download, RefreshCw, Loader2 } from "lucide-react";
import { api, type AuditLogEntry } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/cn";

export function AuditLogTab() {
  const { currentOrg } = useAuth();
  const orgId = currentOrg?.id ?? "";

  const [actionFilter, setActionFilter] = useState("");
  const [limit, setLimit] = useState(100);

  const { data: entries, isLoading, mutate } = useSWR(
    orgId ? [`/orgs/${orgId}/audit-log`, actionFilter, limit] : null,
    () => api.orgs.auditLog.list(orgId, { action: actionFilter || undefined, limit }),
    { refreshInterval: 30_000 },
  );

  if (!orgId) return <p className="text-sm text-text-3 p-4">No org selected.</p>;

  return (
    <div className="flex flex-col gap-4 p-6 h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          placeholder="Filter by action…"
          className="rounded-lg border border-border bg-surface-0 px-3 py-1.5 text-sm text-text-1
                     placeholder-text-3 focus:outline-none focus:ring-2 focus:ring-violet/50 w-48"
        />
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="rounded-lg border border-border bg-surface-0 px-2 py-1.5 text-sm text-text-2"
        >
          <option value={50}>Last 50</option>
          <option value={100}>Last 100</option>
          <option value={500}>Last 500</option>
        </select>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5
                     text-sm text-text-2 hover:bg-surface-2 transition"
        >
          <RefreshCw size={14} />
        </button>
        <a
          href={api.orgs.auditLog.exportUrl(orgId)}
          download="audit-log.csv"
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5
                     text-sm text-text-2 hover:bg-surface-2 transition ml-auto"
        >
          <Download size={14} />
          Export CSV
        </a>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-text-3" size={20} />
        </div>
      ) : (
        <div className="overflow-auto rounded-lg border border-border">
          <table className="w-full text-xs text-text-2">
            <thead>
              <tr className="border-b border-border bg-surface-1">
                {["Time", "Actor", "Action", "Target", "IP"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-text-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(entries ?? []).map((e) => (
                <AuditRow key={e.id} entry={e} />
              ))}
            </tbody>
          </table>
          {entries?.length === 0 && (
            <p className="text-center text-text-3 py-6 text-sm">No audit events found.</p>
          )}
        </div>
      )}
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const time = new Date(entry.at).toLocaleString();
  return (
    <tr className="hover:bg-surface-1 transition-colors">
      <td className="px-3 py-2 whitespace-nowrap text-text-3">{time}</td>
      <td className="px-3 py-2 text-text-2">{entry.actor_email ?? "—"}</td>
      <td className="px-3 py-2 font-mono text-violet">{entry.action}</td>
      <td className="px-3 py-2 text-text-2 max-w-xs truncate">
        {entry.target_type ? `${entry.target_type}:${entry.target_id ?? ""}` : "—"}
      </td>
      <td className="px-3 py-2 text-text-3">{entry.ip ?? "—"}</td>
    </tr>
  );
}
