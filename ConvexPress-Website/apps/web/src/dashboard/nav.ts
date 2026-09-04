/**
 * Navigation model (pure). Turns either an admin-authored menu tree or the
 * page registry into the `NavItem[]` the shell renders. Nothing here knows
 * about React or Convex; see DashboardShell for the data plumbing.
 */

import { buildDashboardPath } from "@/lib/dashboard/config";
import { PAGE_GROUP_LABELS, PAGE_GROUP_ORDER, type DashboardPageDefinition } from "./types";

export type NavItemKind = "link" | "heading" | "separator";

export interface NavItem {
  id: string;
  kind: NavItemKind;
  label: string;
  /** Absolute href for links; "" for headings/separators. */
  href: string;
  /** Lucide kebab name, resolved by the renderer. */
  icon?: string;
  /** Badge source key (e.g. "notifications.unread"), looked up in myBadges. */
  badge?: string;
  /** Registry page id when the item points at a dashboard page. */
  pageId?: string;
  /** Match only the exact path (used for the home page). */
  exact: boolean;
  external: boolean;
  target?: string;
  rel?: string;
  children: NavItem[];
}

/** The subset of the backend MenuItemTreeNode the dashboard needs. */
export interface MenuTreeNode {
  _id: string;
  itemType: string;
  objectId?: string;
  label: string;
  url?: string;
  icon?: string;
  badge?: string;
  target?: string;
  linkRel?: string;
  isOrphaned?: boolean;
  children?: MenuTreeNode[];
}

export interface RegistryNavOptions {
  basePath: string;
  /** Capabilities held by the viewer; pages requiring one are hidden otherwise. */
  capabilities?: readonly string[];
  /** Include pages with defaultInSidebar=false (used by the mobile "all pages" list). */
  includeAll?: boolean;
  /** Emit group headings between groups. */
  withHeadings?: boolean;
  /** Which page ids are actually implemented on this site; missing ones are skipped. */
  implementedPageIds?: ReadonlySet<string>;
}

function isExternalHref(href: string): boolean {
  return /^(https?:)?\/\//u.test(href) || href.startsWith("mailto:") || href.startsWith("tel:");
}

/** Maps a menu tree (already visibility-filtered by the backend) to nav items. */
export function menuToNav(items: MenuTreeNode[] | undefined | null, basePath: string): NavItem[] {
  if (!items) return [];
  const out: NavItem[] = [];
  for (const item of items) {
    if (item.isOrphaned) continue;
    if (item.itemType === "heading") {
      out.push({ id: item._id, kind: "heading", label: item.label, href: "", exact: false, external: false, children: [] });
      continue;
    }
    if (item.itemType === "separator") {
      out.push({ id: item._id, kind: "separator", label: "", href: "", exact: false, external: false, children: [] });
      continue;
    }
    const href = (item.url ?? "").trim() || (item.itemType === "dashboard" ? buildDashboardPath(basePath, "") : "#");
    const external = isExternalHref(href);
    out.push({
      id: item._id,
      kind: "link",
      label: item.label,
      href,
      icon: item.icon || undefined,
      badge: item.badge || undefined,
      pageId: item.itemType === "dashboard" ? item.objectId : undefined,
      exact: item.itemType === "dashboard" && item.objectId === "home",
      external,
      target: item.target,
      rel: item.linkRel,
      children: menuToNav(item.children ?? [], basePath),
    });
  }
  return out;
}

/**
 * Generates the default sidebar from the registry when no menu is assigned:
 * grouped by registry group, optional headings, only enabled plugins (the
 * registry query already filtered plugins) and only pages whose capability
 * the viewer holds.
 */
export function registryToNav(pages: DashboardPageDefinition[], options: RegistryNavOptions): NavItem[] {
  const capabilities = new Set(options.capabilities ?? []);
  const visible = pages.filter((page) => {
    if (!options.includeAll && !page.defaultInSidebar) return false;
    if (page.capability && !capabilities.has(page.capability)) return false;
    if (options.implementedPageIds && !options.implementedPageIds.has(page.id)) return false;
    return true;
  });
  const out: NavItem[] = [];
  for (const group of PAGE_GROUP_ORDER) {
    const members = visible.filter((page) => page.group === group);
    if (members.length === 0) continue;
    if (options.withHeadings && group !== "overview") {
      out.push({
        id: `heading:${group}`,
        kind: "heading",
        label: PAGE_GROUP_LABELS[group],
        href: "",
        exact: false,
        external: false,
        children: [],
      });
    }
    for (const page of members) {
      out.push({
        id: `page:${page.id}`,
        kind: "link",
        label: page.title,
        href: buildDashboardPath(options.basePath, page.path),
        icon: page.icon,
        badge: page.badge,
        pageId: page.id,
        exact: page.path === "",
        external: false,
        children: [],
      });
    }
  }
  return out;
}

/** Whether a nav link is the active one for the current pathname. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.kind !== "link" || item.external) return false;
  const href = item.href.split(/[?#]/)[0] ?? "";
  const current = pathname.replace(/\/+$/u, "") || "/";
  const target = href.replace(/\/+$/u, "") || "/";
  if (item.exact) return current === target;
  return current === target || current.startsWith(`${target}/`);
}

/** Flattens links (for keyboard lists, quick links, and the mobile drawer). */
export function flattenNavLinks(items: NavItem[]): NavItem[] {
  const out: NavItem[] = [];
  for (const item of items) {
    if (item.kind === "link") out.push(item);
    if (item.children.length) out.push(...flattenNavLinks(item.children));
  }
  return out;
}

/** Badge count for an item, or 0 when it declares none. */
export function badgeCountFor(item: NavItem, badges: Record<string, number> | null | undefined): number {
  if (!item.badge || !badges) return 0;
  const value = badges[item.badge];
  return typeof value === "number" && value > 0 ? value : 0;
}

export function formatBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export interface PageMatch {
  page: DashboardPageDefinition;
  /** Remaining path after the page path, e.g. "/ORD-1" for "/orders/ORD-1". */
  subpath: string;
}

/**
 * Resolves the registry page for a base-relative remainder ("" | "/orders/1").
 * Longest page path wins so "/orders" does not swallow a hypothetical
 * "/orders-archive" page; "" maps to the landing page.
 */
export function resolvePageFromRemainder(
  remainder: string,
  pages: DashboardPageDefinition[],
  landingPage: string = "home",
): PageMatch | null {
  const normalized = remainder.replace(/\/+$/u, "");
  if (normalized === "" || normalized === "/") {
    const landing = pages.find((page) => page.id === landingPage) ?? pages.find((page) => page.path === "");
    return landing ? { page: landing, subpath: "" } : null;
  }
  let best: PageMatch | null = null;
  for (const page of pages) {
    if (!page.path) continue;
    const path = page.path.replace(/\/+$/u, "");
    if (normalized === path || normalized.startsWith(`${path}/`)) {
      if (!best || path.length > best.page.path.length) {
        best = { page, subpath: normalized.slice(path.length) };
      }
    }
  }
  return best;
}
