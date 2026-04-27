"use client";

import { ReactNode } from "react";
import { useAuth } from "@/contexts/auth";

interface CanProps {
  permission: string;
  /** org_id to check against; defaults to currentOrg */
  orgId?: string;
  /** tenant_id for tenant-scoped permission checks */
  tenantId?: string;
  /** Rendered when the user lacks the permission */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Renders children only when the current user has the specified permission.
 * This is a cosmetic guard — the backend enforces permissions independently.
 */
export function Can({ permission, orgId, tenantId, fallback = null, children }: CanProps) {
  const { can, canTenant } = useAuth();
  const allowed = tenantId ? canTenant(permission, tenantId) : can(permission, orgId);
  return allowed ? <>{children}</> : <>{fallback}</>;
}
