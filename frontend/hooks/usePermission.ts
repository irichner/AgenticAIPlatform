"use client";

import { useAuth } from "@/contexts/auth";

/** Returns true if the current user has the given org-scoped permission. */
export function usePermission(permission: string, orgId?: string): boolean {
  const { can } = useAuth();
  return can(permission, orgId);
}

/** Returns true if the current user has the given tenant-scoped permission. */
export function useTenantPermission(permission: string, tenantId: string): boolean {
  const { canTenant } = useAuth();
  return canTenant(permission, tenantId);
}
