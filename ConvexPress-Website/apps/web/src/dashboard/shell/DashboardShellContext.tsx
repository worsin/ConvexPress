/**
 * Shell context: everything the chrome and the widgets share (config, nav,
 * badges, registry). Provided by DashboardShell; widgets such as quick-links
 * read the resolved sidebar from here instead of re-fetching menus.
 */

import { createContext, useContext } from "react";

import type { DashboardConfig } from "@/lib/layout/types";
import type { NavItem } from "../nav";
import type { DashboardRegistryPayload } from "../types";

export interface DashboardShellValue {
  config: DashboardConfig;
  /** Resolved sidebar navigation (menu or registry fallback). */
  sidebarNav: NavItem[];
  topbarNav: NavItem[];
  profileNav: NavItem[];
  /** Whether the sidebar came from an assigned menu (vs. generated). */
  sidebarFromMenu: boolean;
  badges: Record<string, number> | null;
  registry: DashboardRegistryPayload | null;
  /** Builds an href under the configured base path. */
  to: (path?: string) => string;
  /** True in the compact account frame (dashboard plugin disabled). */
  compact: boolean;
}

export const DashboardShellContext = createContext<DashboardShellValue | null>(null);

export function useDashboardShell(): DashboardShellValue {
  const value = useContext(DashboardShellContext);
  if (!value) {
    throw new Error("useDashboardShell must be used inside DashboardShell");
  }
  return value;
}

/** Same as useDashboardShell but tolerant: null outside the shell (e.g. header UserMenu). */
export function useOptionalDashboardShell(): DashboardShellValue | null {
  return useContext(DashboardShellContext);
}
