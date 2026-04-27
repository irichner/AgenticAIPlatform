"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import useSWR from "swr";

export interface MeOrg {
  id: string;
  name: string;
  slug: string;
  role_key: string;
}

export interface MeUser {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  email_verified: boolean;
  orgs: MeOrg[];
  permissions: Record<string, string[]>; // "org:<id>" | "tenant:<id>" → permission IDs
}

interface AuthContextValue {
  user: MeUser | null;
  loading: boolean;
  currentOrg: MeOrg | null;
  setCurrentOrg: (org: MeOrg) => void;
  /** Check org-scoped permission for currentOrg */
  can: (permission: string, orgId?: string) => boolean;
  canTenant: (permission: string, tenantId: string) => boolean;
  logout: () => Promise<void>;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchMe(): Promise<MeUser | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Failed to fetch user");
  return res.json();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading, mutate } = useSWR<MeUser | null>("/api/auth/me", fetchMe, {
    dedupingInterval: 60_000,
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const [currentOrg, setCurrentOrgState] = useState<MeOrg | null>(null);

  // Restore last org from localStorage, or pick first org
  useEffect(() => {
    if (!user?.orgs?.length) return;
    const stored = typeof window !== "undefined" ? localStorage.getItem("lanara_org_id") : null;
    const found = stored ? user.orgs.find((o) => o.id === stored) : null;
    setCurrentOrgState(found ?? user.orgs[0]);
  }, [user]);

  const setCurrentOrg = useCallback((org: MeOrg) => {
    setCurrentOrgState(org);
    if (typeof window !== "undefined") localStorage.setItem("lanara_org_id", org.id);
  }, []);

  const can = useCallback(
    (permission: string, orgId?: string) => {
      if (!user) return false;
      const id = orgId ?? currentOrg?.id;
      if (!id) return false;
      const perms = user.permissions[`org:${id}`] ?? [];
      return perms.includes("*") || perms.includes(permission);
    },
    [user, currentOrg],
  );

  const canTenant = useCallback(
    (permission: string, tenantId: string) => {
      if (!user) return false;
      const perms = user.permissions[`tenant:${tenantId}`] ?? [];
      return perms.includes("*") || perms.includes(permission);
    },
    [user],
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    await mutate(null);
    window.location.href = "/login";
  }, [mutate]);

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        loading: isLoading,
        currentOrg,
        setCurrentOrg,
        can,
        canTenant,
        logout,
        refresh: () => mutate(),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
