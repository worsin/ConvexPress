/**
 * Settings-driven dashboard navigation (pure).
 *
 * Builds the member navigation from DASHBOARD_NAV_ITEMS plus the commerce,
 * subscription and membership pages in DASHBOARD_EXTENSION_NAV_ITEMS, keeping
 * only the items whose plugin is enabled in the public settings and whose
 * capability (when any) the viewer holds. Courses show only when the LMS
 * plugin is enabled; Orders/Addresses need commerce; Returns, Subscriptions,
 * Downloads, Reviews and Wishlist need their commerce sub-plugin; Membership
 * needs the membership plugin.
 *
 * The dashboard shell prefers an admin-assigned menu, then the live page
 * registry; this list is the client-side fallback that keeps the sidebar
 * populated while the registry loads or when it is unavailable, and it feeds
 * the legacy DashboardSidebar / DashboardMobileNav components.
 */

import { LEGACY_DASHBOARD_BASE_PATH, buildDashboardPath, stripBasePath } from "@/lib/dashboard/config";
import { isPublicPluginEnabled, type PublicPluginSettings } from "@/lib/plugins/public";
import { DASHBOARD_EXTENSION_NAV_ITEMS, DASHBOARD_NAV_ITEMS } from "./constants";
import type { DashboardNavItem } from "./types";

export interface BuildDashboardNavOptions {
  /** Capability predicate (e.g. `useCanFn()`); items with a capability are hidden when it returns false. */
  can?: (capability: string) => boolean;
  /** Configured dashboard base path; item paths are rebased onto it when it differs from `/dashboard`. */
  basePath?: string;
}

/** Id of the core item the extension block is inserted before. */
const EXTENSION_ANCHOR_ID = "courses";

/** The unfiltered, ordered list: core activity items, the commerce/membership block, then learning and account. */
export function allDashboardNavItems(): DashboardNavItem[] {
  const anchor = DASHBOARD_NAV_ITEMS.findIndex((item) => item.id === EXTENSION_ANCHOR_ID);
  if (anchor === -1) return [...DASHBOARD_NAV_ITEMS, ...DASHBOARD_EXTENSION_NAV_ITEMS];
  return [
    ...DASHBOARD_NAV_ITEMS.slice(0, anchor),
    ...DASHBOARD_EXTENSION_NAV_ITEMS,
    ...DASHBOARD_NAV_ITEMS.slice(anchor),
  ];
}

/** Whether one item passes its plugin and capability gates. */
export function isDashboardNavItemVisible(
  item: DashboardNavItem,
  settings: PublicPluginSettings,
  can?: (capability: string) => boolean,
): boolean {
  if (item.plugin && !isPublicPluginEnabled(item.plugin, settings)) return false;
  if (item.capability && can && !can(item.capability)) return false;
  return true;
}

/** Rebases a legacy `/dashboard/...` path onto the configured base path. */
export function rebaseDashboardNavPath(to: string, basePath: string | undefined): string {
  if (!basePath) return to;
  const remainder = stripBasePath(to, LEGACY_DASHBOARD_BASE_PATH);
  return remainder === null ? to : buildDashboardPath(basePath, remainder);
}

export function buildDashboardNavItems(
  settings: PublicPluginSettings,
  options: BuildDashboardNavOptions = {},
): DashboardNavItem[] {
  return allDashboardNavItems()
    .filter((item) => isDashboardNavItemVisible(item, settings, options.can))
    .map((item) => (options.basePath ? { ...item, to: rebaseDashboardNavPath(item.to, options.basePath) } : item));
}
