"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "lanara_branding";

interface BrandingSettings {
  appName: string;
  appIcon: string | null; // data URL or null for default
}

interface BrandingContextValue extends BrandingSettings {
  setAppName: (name: string) => void;
  setAppIcon: (icon: string | null) => void;
}

const defaults: BrandingSettings = { appName: "Ask Lanara", appIcon: null };

const BrandingContext = createContext<BrandingContextValue>({
  ...defaults,
  setAppName: () => {},
  setAppIcon: () => {},
});

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<BrandingSettings>(defaults);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setSettings(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const persist = useCallback((next: BrandingSettings) => {
    setSettings(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  const setAppName = useCallback((appName: string) => {
    persist({ ...settings, appName: appName || defaults.appName });
  }, [settings, persist]);

  const setAppIcon = useCallback((appIcon: string | null) => {
    persist({ ...settings, appIcon });
  }, [settings, persist]);

  return (
    <BrandingContext.Provider value={{ ...settings, setAppName, setAppIcon }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
