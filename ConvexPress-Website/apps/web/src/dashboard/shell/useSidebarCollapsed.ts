/**
 * Sidebar collapsed/expanded preference, persisted per browser. The site
 * default (`sidebarCollapsedByDefault`) applies until the member toggles it.
 */

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "convexpress.dashboard.sidebar-collapsed";

function readStored(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    // Storage blocked: fall back to the site default.
  }
  return null;
}

export function useSidebarCollapsed(defaultCollapsed: boolean): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(defaultCollapsed);

  // Hydrate from storage after mount so SSR and the first client render agree.
  useEffect(() => {
    const stored = readStored();
    setCollapsed(stored ?? defaultCollapsed);
  }, [defaultCollapsed]);

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Ignore storage failures; the toggle still works for the session.
      }
      return next;
    });
  }, []);

  return [collapsed, toggle];
}
