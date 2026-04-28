/**
 * Org-scoped localStorage helpers.
 * All keys are namespaced as `org:{orgId}:{key}` so state never
 * bleeds between orgs when a user switches or re-authenticates.
 */

export function orgStorageKey(orgId: string, key: string): string {
  return `org:${orgId}:${key}`;
}

export function getOrgItem(orgId: string | null | undefined, key: string): string | null {
  if (!orgId || typeof window === "undefined") return null;
  try { return localStorage.getItem(orgStorageKey(orgId, key)); } catch { return null; }
}

export function setOrgItem(orgId: string | null | undefined, key: string, value: string): void {
  if (!orgId || typeof window === "undefined") return;
  try { localStorage.setItem(orgStorageKey(orgId, key), value); } catch { /* ignore */ }
}

export function removeOrgItem(orgId: string | null | undefined, key: string): void {
  if (!orgId || typeof window === "undefined") return;
  try { localStorage.removeItem(orgStorageKey(orgId, key)); } catch { /* ignore */ }
}

/** Remove all `org:{orgId}:*` keys from localStorage. */
export function clearOrgStorage(orgId: string): void {
  if (typeof window === "undefined") return;
  const prefix = `org:${orgId}:`;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(prefix)) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
}
