/**
 * Customer dashboard — settings draft model and structure preview (pure).
 *
 * Mirrors the backend "dashboard" settings section
 * (packages/backend/convex/settings/defaults.ts → DashboardSettings) so the
 * admin page can validate before autosave and render a live preview of the
 * shell: which sidebar / top bar / profile menu the member will see, built
 * from the assigned menus or generated from the page registry.
 */

import {
  DASHBOARD_DEFAULTS,
  type DashboardSettings,
} from "@backend/convex/settings/defaults";
import {
  pluginIsEnabled,
  type DashboardPageDefinition,
} from "@backend/convex/extensions/dashboard/registry";

export type DashboardSettingsDraft = DashboardSettings;

/** Same rule as validateDashboard() on the backend. */
export const BASE_PATH_PATTERN = /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/u;

export const SIDEBAR_WIDTH_MIN = 200;
export const SIDEBAR_WIDTH_MAX = 360;

/** Location value meaning "no menu assigned — generate from the registry". */
export const GENERATED_FROM_REGISTRY = "";

export const DASHBOARD_LOCATION_SLUGS = {
  sidebar: "dashboard-sidebar",
  topbar: "dashboard-topbar",
  profile: "dashboard-profile",
} as const;

const LAYOUTS = ["sidebar", "topbar", "both"] as const;
const BRAND_MARKS = ["site", "custom", "none"] as const;
const FOOTERS = ["minimal", "full", "none"] as const;

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Coerce the stored section (or null) into a fully-populated draft. */
export function createDashboardDraft(source: Record<string, unknown> | null | undefined): DashboardSettingsDraft {
  const s = source ?? {};
  const width = Number(s.sidebarWidth);
  return {
    basePath: text(s.basePath, DASHBOARD_DEFAULTS.basePath),
    layout: pick(s.layout, LAYOUTS, DASHBOARD_DEFAULTS.layout),
    sidebarLocation: text(s.sidebarLocation, DASHBOARD_DEFAULTS.sidebarLocation),
    topbarLocation: text(s.topbarLocation, DASHBOARD_DEFAULTS.topbarLocation),
    profileLocation: text(s.profileLocation, DASHBOARD_DEFAULTS.profileLocation),
    sidebarCollapsedByDefault: bool(s.sidebarCollapsedByDefault, DASHBOARD_DEFAULTS.sidebarCollapsedByDefault),
    sidebarWidth: Number.isFinite(width) && width > 0 ? Math.round(width) : DASHBOARD_DEFAULTS.sidebarWidth,
    showThemeToggle: bool(s.showThemeToggle, DASHBOARD_DEFAULTS.showThemeToggle),
    showNotificationBell: bool(s.showNotificationBell, DASHBOARD_DEFAULTS.showNotificationBell),
    showSearch: bool(s.showSearch, DASHBOARD_DEFAULTS.showSearch),
    brandMark: pick(s.brandMark, BRAND_MARKS, DASHBOARD_DEFAULTS.brandMark),
    customLogoUrl: text(s.customLogoUrl, DASHBOARD_DEFAULTS.customLogoUrl),
    landingPage: text(s.landingPage, DASHBOARD_DEFAULTS.landingPage),
    footerVariant: pick(s.footerVariant, FOOTERS, DASHBOARD_DEFAULTS.footerVariant),
    membersCanEditHome: bool(s.membersCanEditHome, DASHBOARD_DEFAULTS.membersCanEditHome),
    welcomeHeadline: text(s.welcomeHeadline, DASHBOARD_DEFAULTS.welcomeHeadline),
  };
}

export type DashboardDraftErrors = Partial<Record<keyof DashboardSettingsDraft, string>>;

/** Client-side mirror of the backend validation so autosave never sends a bad draft. */
export function validateDashboardDraft(draft: DashboardSettingsDraft): DashboardDraftErrors {
  const errors: DashboardDraftErrors = {};
  if (!BASE_PATH_PATTERN.test(draft.basePath)) {
    errors.basePath = "Use a lowercase path like /dashboard or /members/area — no trailing slash.";
  }
  if (
    !Number.isFinite(draft.sidebarWidth) ||
    draft.sidebarWidth < SIDEBAR_WIDTH_MIN ||
    draft.sidebarWidth > SIDEBAR_WIDTH_MAX
  ) {
    errors.sidebarWidth = `Sidebar width must be between ${SIDEBAR_WIDTH_MIN} and ${SIDEBAR_WIDTH_MAX} pixels.`;
  }
  if (draft.brandMark === "custom" && draft.customLogoUrl.trim() === "") {
    errors.customLogoUrl = "Pick a logo or switch the brand mark back to the site logo.";
  }
  if (draft.customLogoUrl.trim() && !/^(https?:\/\/|\/)/u.test(draft.customLogoUrl.trim())) {
    errors.customLogoUrl = "Logo must be an absolute URL or a site-relative path.";
  }
  if (draft.welcomeHeadline.length > 120) {
    errors.welcomeHeadline = "Keep the headline under 120 characters.";
  }
  return errors;
}

/** The values payload for settings.mutations.updateSection. */
export function draftToSectionValues(draft: DashboardSettingsDraft): Record<string, unknown> {
  return {
    basePath: draft.basePath.trim(),
    layout: draft.layout,
    sidebarLocation: draft.sidebarLocation,
    topbarLocation: draft.topbarLocation,
    profileLocation: draft.profileLocation,
    sidebarCollapsedByDefault: draft.sidebarCollapsedByDefault,
    sidebarWidth: Math.round(draft.sidebarWidth),
    showThemeToggle: draft.showThemeToggle,
    showNotificationBell: draft.showNotificationBell,
    showSearch: draft.showSearch,
    brandMark: draft.brandMark,
    customLogoUrl: draft.customLogoUrl.trim(),
    landingPage: draft.landingPage,
    footerVariant: draft.footerVariant,
    membersCanEditHome: draft.membersCanEditHome,
    welcomeHeadline: draft.welcomeHeadline,
  };
}

// ─── Structure preview ──────────────────────────────────────────────────────

export const PAGE_GROUP_LABELS: Record<DashboardPageDefinition["group"], string> = {
  overview: "Overview",
  activity: "Activity",
  commerce: "Shopping",
  learning: "Learning",
  support: "Support",
  account: "Account",
};

export const PAGE_GROUP_ORDER: DashboardPageDefinition["group"][] = [
  "overview",
  "activity",
  "commerce",
  "learning",
  "support",
  "account",
];

export interface PreviewNode {
  key: string;
  kind: "link" | "heading" | "separator";
  label: string;
  icon?: string;
  badge?: string;
  /** Path the link resolves to (dashboard items: base path + page path, or override). */
  href?: string;
  /** Why the item may be hidden for some viewers (visibility rules or a disabled plugin). */
  note?: string;
  children?: PreviewNode[];
}

/** The subset of a menu item the preview needs (matches menus.queries.getMenu rows). */
export interface PreviewMenuItem {
  _id: string;
  itemType: string;
  objectId?: string;
  label: string;
  url?: string;
  parentItemId?: string;
  position: number;
  icon?: string;
  badge?: string;
  pathOverride?: string;
  visibility?: string;
  roles?: string[];
  membershipPlans?: string[];
  capability?: string;
  isOrphaned?: boolean;
}

export function describeVisibility(item: Pick<PreviewMenuItem, "visibility" | "roles" | "membershipPlans" | "capability">): string | undefined {
  const parts: string[] = [];
  if (item.visibility === "signedIn") parts.push("signed-in only");
  if (item.visibility === "signedOut") parts.push("signed-out only");
  if (item.roles && item.roles.length > 0) parts.push(`roles: ${item.roles.join(", ")}`);
  if (item.membershipPlans && item.membershipPlans.length > 0) parts.push(`plans: ${item.membershipPlans.join(", ")}`);
  if (item.capability) parts.push(`needs ${item.capability}`);
  return parts.length ? parts.join(" · ") : undefined;
}

/** Resolve the path a dashboard menu item links to. */
export function dashboardItemHref(
  item: Pick<PreviewMenuItem, "objectId" | "pathOverride">,
  pages: DashboardPageDefinition[],
  basePath: string,
): string {
  const page = pages.find((entry) => entry.id === item.objectId);
  const root = (item.pathOverride && item.pathOverride.trim()) || basePath;
  return `${root}${page?.path ?? ""}`;
}

/**
 * Build the preview tree from a menu's flat rows. Dashboard items pick up the
 * registry icon/badge when the row has none; plugin-disabled pages are noted.
 */
export function buildPreviewFromMenu(
  rows: PreviewMenuItem[],
  pages: DashboardPageDefinition[],
  pluginFlags: Record<string, unknown>,
  basePath: string,
): PreviewNode[] {
  const sorted = [...rows].sort((a, b) => a.position - b.position);
  const nodes = new Map<string, PreviewNode>();
  const roots: PreviewNode[] = [];

  const toNode = (row: PreviewMenuItem): PreviewNode | null => {
    if (row.isOrphaned) return null;
    if (row.itemType === "separator") return { key: row._id, kind: "separator", label: "" };
    if (row.itemType === "heading") return { key: row._id, kind: "heading", label: row.label };
    const node: PreviewNode = { key: row._id, kind: "link", label: row.label, icon: row.icon, badge: row.badge, href: row.url };
    const notes: string[] = [];
    if (row.itemType === "dashboard") {
      const page = pages.find((entry) => entry.id === row.objectId);
      if (page) {
        node.icon = row.icon || page.icon;
        node.badge = row.badge || page.badge;
        node.href = dashboardItemHref(row, pages, basePath);
        if (!pluginIsEnabled(page.pluginId, pluginFlags)) notes.push(`hidden — ${page.pluginId} plugin is off`);
      } else {
        notes.push("page missing from registry");
      }
    }
    const visibility = describeVisibility(row);
    if (visibility) notes.push(visibility);
    if (notes.length) node.note = notes.join(" · ");
    return node;
  };

  for (const row of sorted) {
    const node = toNode(row);
    if (!node) continue;
    nodes.set(row._id, node);
    const parent = row.parentItemId ? nodes.get(row.parentItemId) : undefined;
    if (parent) {
      parent.children = parent.children ?? [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/** Sidebar generated from the registry when no menu is assigned. */
export function buildSidebarFromRegistry(
  pages: DashboardPageDefinition[],
  pluginFlags: Record<string, unknown>,
  basePath: string,
): PreviewNode[] {
  const out: PreviewNode[] = [];
  for (const group of PAGE_GROUP_ORDER) {
    const members = pages.filter(
      (page) => page.group === group && page.defaultInSidebar && pluginIsEnabled(page.pluginId, pluginFlags),
    );
    if (members.length === 0) continue;
    if (group !== "overview") out.push({ key: `heading-${group}`, kind: "heading", label: PAGE_GROUP_LABELS[group] });
    for (const page of members) {
      out.push({
        key: page.id,
        kind: "link",
        label: page.title,
        icon: page.icon,
        badge: page.badge,
        href: `${basePath}${page.path}`,
        note: page.capability ? `needs ${page.capability}` : undefined,
      });
    }
  }
  return out;
}

/** Top bar generated from the registry: the overview + activity pages. */
export function buildTopbarFromRegistry(
  pages: DashboardPageDefinition[],
  pluginFlags: Record<string, unknown>,
  basePath: string,
): PreviewNode[] {
  return pages
    .filter(
      (page) =>
        (page.group === "overview" || page.group === "activity") &&
        page.defaultInSidebar &&
        pluginIsEnabled(page.pluginId, pluginFlags),
    )
    .map((page) => ({
      key: page.id,
      kind: "link" as const,
      label: page.title,
      icon: page.icon,
      badge: page.badge,
      href: `${basePath}${page.path}`,
    }));
}

/** Profile dropdown generated from the registry: account pages + sign out. */
export function buildProfileFromRegistry(
  pages: DashboardPageDefinition[],
  pluginFlags: Record<string, unknown>,
  basePath: string,
): PreviewNode[] {
  const account = pages
    .filter((page) => page.group === "account" && pluginIsEnabled(page.pluginId, pluginFlags))
    .map((page) => ({
      key: page.id,
      kind: "link" as const,
      label: page.title,
      icon: page.icon,
      href: `${basePath}${page.path}`,
    }));
  return [
    { key: "home", kind: "link", label: "Dashboard", icon: "layout-dashboard", href: basePath },
    ...account,
    { key: "sep", kind: "separator", label: "" },
    { key: "sign-out", kind: "link", label: "Sign out", icon: "log-out" },
  ];
}

export function welcomePreview(headline: string, name = "Avery"): string {
  return headline.replaceAll("{name}", name);
}
