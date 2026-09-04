/**
 * Dashboard config + path hooks.
 *
 *   useDashboardConfig()   resolved `dashboardConfig` (defaults merged) + load state
 *   useDashboardPath()     href builder bound to the configured base path
 *   useDashboardEnabled()  the `dashboardEnabled` plugin flag (null while loading)
 *
 * Every dashboard link goes through `useDashboardPath()`; the base path is a
 * site setting and must never be hardcoded (see dashboard/contracts.ts).
 */

import { useCallback, useMemo } from "react";

import { useSettings } from "@/contexts/SettingsContext";
import { buildDashboardPath, resolveDashboardConfig } from "@/lib/dashboard/config";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import type { DashboardConfig } from "@/lib/layout/types";

export interface DashboardConfigResult {
  config: DashboardConfig;
  /** False until public settings have arrived; consumers may render a skeleton. */
  isLoaded: boolean;
}

export function useDashboardConfig(): DashboardConfigResult {
  const settings = useSettings();
  const raw = settings?.dashboardConfig;
  const config = useMemo(() => resolveDashboardConfig(raw), [raw]);
  return { config, isLoaded: settings !== null };
}

export interface DashboardPathHelpers {
  basePath: string;
  /** Builds an href under the base path: to("/orders/123") → "/account/orders/123". */
  to: (path?: string) => string;
}

export function useDashboardPath(): DashboardPathHelpers {
  const { config } = useDashboardConfig();
  const basePath = config.basePath;
  const to = useCallback((path: string = "") => buildDashboardPath(basePath, path), [basePath]);
  return useMemo(() => ({ basePath, to }), [basePath, to]);
}

/** null while settings load; otherwise the resolved plugin flag. */
export function useDashboardEnabled(): boolean | null {
  const settings = useSettings();
  if (settings === null) return null;
  return isPublicPluginEnabled("dashboard", settings);
}
