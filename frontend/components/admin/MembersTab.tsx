"use client";

import { useState } from "react";
import useSWR from "swr";
import { UserPlus, Trash2, Loader2 } from "lucide-react";
import { api, type MemberOut, type RoleOut } from "@/lib/api";
import { useAuth } from "@/contexts/auth";

export function MembersTab() {
  const { currentOrg } = useAuth();
  const orgId = currentOrg?.id ?? "";

  const { data: members, mutate, isLoading } = useSWR(
    orgId ? `/orgs/${orgId}/members` : null,
    () => api.orgs.members.list(orgId),
  );
  const { data: roles } = useSWR(
    orgId ? `/orgs/${orgId}/roles` : null,
    () => api.orgs.roles.list(orgId),
  );

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");

  const orgRoles = (roles ?? []).filter((r) => r.scope === "org");

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail || !inviteRoleId) return;
    setInviting(true);
    setError("");
    try {
      await api.orgs.members.invite(orgId, { email: inviteEmail, role_id: inviteRoleId });
      setInviteEmail("");
      mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite");
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(userId: string, roleId: string) {
    await api.orgs.members.updateRole(orgId, userId, roleId);
    mutate();
  }

  async function handleRemove(userId: string) {
    if (!confirm("Remove this member?")) return;
    await api.orgs.members.remove(orgId, userId);
    mutate();
  }

  if (!orgId) return <p className="text-sm text-text-3 p-4">No org selected.</p>;

  return (
    <div className="space-y-6 p-6">
      {/* Invite form */}
      <div className="bg-surface-1 border border-border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-text-1 mb-3">Invite member</h3>
        <form onSubmit={handleInvite} className="flex gap-2 flex-wrap">
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="colleague@company.com"
            className="flex-1 min-w-48 rounded-lg border border-border bg-surface-0 px-3 py-1.5
                       text-sm text-text-1 placeholder-text-3 focus:outline-none focus:ring-2
                       focus:ring-violet/50"
          />
          <select
            required
            value={inviteRoleId}
            onChange={(e) => setInviteRoleId(e.target.value)}
            className="rounded-lg border border-border bg-surface-0 px-3 py-1.5 text-sm text-text-1
                       focus:outline-none focus:ring-2 focus:ring-violet/50"
          >
            <option value="">Select role…</option>
            {orgRoles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={inviting}
            className="flex items-center gap-1.5 rounded-lg bg-violet px-3 py-1.5 text-sm
                       font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {inviting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Invite
          </button>
        </form>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>

      {/* Member list */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-text-3" size={20} />
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
          {(members ?? []).map((m) => (
            <MemberRow
              key={m.user_id}
              member={m}
              orgRoles={orgRoles}
              onRoleChange={handleRoleChange}
              onRemove={handleRemove}
            />
          ))}
          {members?.length === 0 && (
            <p className="text-sm text-text-3 text-center py-6">No members yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

function MemberRow({
  member,
  orgRoles,
  onRoleChange,
  onRemove,
}: {
  member: MemberOut;
  orgRoles: RoleOut[];
  onRoleChange: (userId: string, roleId: string) => void;
  onRemove: (userId: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-surface-1">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-1 truncate">
          {member.full_name ?? member.email}
        </p>
        {member.full_name && (
          <p className="text-xs text-text-3 truncate">{member.email}</p>
        )}
      </div>
      <select
        value={member.role_id}
        onChange={(e) => onRoleChange(member.user_id, e.target.value)}
        className="rounded border border-border bg-surface-0 px-2 py-1 text-xs text-text-2
                   focus:outline-none focus:ring-1 focus:ring-violet/50"
      >
        {orgRoles.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
      <button
        onClick={() => onRemove(member.user_id)}
        className="text-text-3 hover:text-red-400 transition p-1"
        title="Remove member"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
