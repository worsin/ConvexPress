/**
 * Data plumbing for the shell navigation.
 *
 *   useDashboardMenu(location)  one menu location → NavItem[] (skips the query when empty)
 *   useDashboardRegistry()      the plugin-filtered page/widget registry
 *   useDashboardBadges()        live badge counters (one subscription)
 *
 * Subscriptions are kept deliberately few: the backend caps concurrent
 * queries per client, so the shell subscribes to exactly the menus its layout
 * renders and shares registry/badges through DashboardShellContext.
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { menuToNav, navItemsFromDashboardNav, registryToNav, type MenuTreeNode, type NavItem } from "../nav";
import { listPageModuleIds } from "../registry";
import type { DashboardRegistryPayload } from "../types";
import { useSettings } from "@/contexts/SettingsContext";
import { useCanFn } from "@/hooks/useCan";
import { buildDashboardNavItems } from "@/lib/layout/dashboardNav";

interface MenuPayload {
  menu: { _id: string; name: string; slug: string };
  items: MenuTreeNode[];
}

export interface DashboardMenuResult {
  /** undefined while loading; null when no menu is assigned; else the nav. */
  nav: NavItem[] | null | undefined;
  isLoading: boolean;
}

export function useDashboardMenu(location: string, basePath: string, enabled: boolean = true): DashboardMenuResult {
  const slug = location.trim();
  const data = useQuery(
    api.menus.queries.getMenuForLocation,
    enabled && slug ? { locationSlug: slug } : "skip",
  ) as MenuPayload | null | undefined;
  return useMemo(() => {
    if (!enabled || !slug) return { nav: null, isLoading: false };
    if (data === undefined) return { nav: undefined, isLoading: true };
    if (data === null) return { nav: null, isLoading: false };
    const nav = menuToNav(data.items, basePath);
    return { nav: nav.length ? nav : null, isLoading: false };
  }, [basePath, data, enabled, slug]);
}

export function useDashboardRegistry(): DashboardRegistryPayload | null {
  const data = useQuery(api.extensions.dashboard.queries.registry, {}) as
    | DashboardRegistryPayload
    | undefined;
  return data ?? null;
}

export function useDashboardBadges(enabled: boolean = true): Record<string, number> | null {
  const data = useQuery(api.extensions.dashboard.queries.myBadges, enabled ? {} : "skip") as
    | Record<string, number>
    | undefined;
  return data ?? null;
}

/** The generated sidebar: registry pages grouped, gated by capability, limited to implemented modules. */
export function useRegistryNav(
  registry: DashboardRegistryPayload | null,
  basePath: string,
  options: { withHeadings?: boolean; includeAll?: boolean } = {},
): NavItem[] {
  const can = useCanFn();
  return useMemo(() => {
    if (!registry) return [];
    return registryToNav(registry.pages, {
      basePath,
      can,
      withHeadings: options.withHeadings ?? true,
      includeAll: options.includeAll ?? false,
      implementedPageIds: new Set(listPageModuleIds()),
    });
  }, [basePath, can, options.includeAll, options.withHeadings, registry]);
}

/**
 * Settings-driven fallback navigation: DASHBOARD_NAV_ITEMS plus the commerce,
 * subscription and membership pages, gated by the public plugin flags and the
 * viewer's capabilities, limited to implemented modules. Renders while the
 * registry query is still loading (SSR included) or when it is unavailable.
 */
export function useFallbackNav(basePath: string): NavItem[] {
  const settings = useSettings();
  const can = useCanFn();
  return useMemo(() => {
    const implemented = new Set(listPageModuleIds());
    const items = buildDashboardNavItems(settings, { can, basePath }).filter((item) => implemented.has(item.id));
    return navItemsFromDashboardNav(items);
  }, [basePath, can, settings]);
}
