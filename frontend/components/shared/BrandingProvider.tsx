"use client";

import { createContext, useContext } from "react";
import { useAuth } from "@/contexts/auth";

interface BrandingContextValue {
  appName: string;
  appIcon: string | null;
}

const BrandingContext = createContext<BrandingContextValue>({
  appName: "Lanara",
  appIcon: null,
});

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const { currentOrg } = useAuth();

  const appName = currentOrg?.name ?? "Lanara";
  const appIcon = currentOrg?.logo_url ?? null;

  return (
    <BrandingContext.Provider value={{ appName, appIcon }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
