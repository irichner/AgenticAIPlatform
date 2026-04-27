"use client";

import useSWR from "swr";
import { Loader2, Monitor, Trash2 } from "lucide-react";
import { api, type SessionOut } from "@/lib/api";
import { cn } from "@/lib/cn";

export function SessionsTab() {
  const { data: sessions, isLoading, mutate } = useSWR(
    "/auth/sessions",
    () => api.auth.sessions(),
  );

  async function revoke(id: string) {
    if (!confirm("Revoke this session? The device will be signed out.")) return;
    await api.auth.revokeSession(id);
    mutate();
  }

  return (
    <div className="p-6 space-y-4">
      <p className="text-sm text-text-2">
        All active sessions for your account. Revoking a session signs out that device immediately.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-text-3" size={20} />
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
          {(sessions ?? []).map((s) => (
            <div key={s.id} className="flex items-start gap-3 px-4 py-3 bg-surface-1">
              <Monitor size={16} className="mt-0.5 shrink-0 text-text-3" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-1 flex items-center gap-2">
                  {s.user_agent ? (
                    <span className="truncate max-w-xs">{s.user_agent}</span>
                  ) : (
                    <span className="text-text-3">Unknown device</span>
                  )}
                  {s.is_current && (
                    <span className="text-xs bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded shrink-0">
                      current
                    </span>
                  )}
                </p>
                <p className="text-xs text-text-3 mt-0.5">
                  Last seen {new Date(s.last_seen_at).toLocaleString()}
                  {s.ip ? ` · ${s.ip}` : ""}
                  {" · "}Expires {new Date(s.expires_at).toLocaleDateString()}
                </p>
              </div>
              {!s.is_current && (
                <button
                  onClick={() => revoke(s.id)}
                  className="text-text-3 hover:text-red-400 transition p-1 shrink-0"
                  title="Revoke session"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          {sessions?.length === 0 && (
            <p className="text-sm text-text-3 text-center py-6">No active sessions.</p>
          )}
        </div>
      )}
    </div>
  );
}
