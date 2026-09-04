/**
 * Dashboard extension — page and widget registries.
 *
 * The customer dashboard on the website is assembled from two catalogs:
 *
 *   Pages    – the screens a dashboard can contain (orders, tickets, profile…).
 *              Menus link to them by id; the website renders one page module
 *              per id (apps/web/src/dashboard/pages/<id>/manifest.tsx).
 *   Widgets  – the cards that can be placed on the dashboard home grid.
 *              Layouts reference them by id; the website renders one widget
 *              module per id (apps/web/src/dashboard/widgets/<id>/manifest.tsx).
 *
 * Platform plugins (commerce, tickets, LMS…) declare their entries here.
 * v2 extensions declare theirs in `convex/extensions/<id>/dashboard.ts`
 * (exporting `pages` and `widgets`); the codegen script merges those into
 * `_dashboardIndex.generated.ts`, which this module reads.
 *
 * Pure TypeScript: importable from the admin web app for the menu builder and
 * layout editor. Never put Convex imports here.
 */

import { extensionDashboardContributions } from "../../schema/_dashboardIndex.generated";

export type DashboardPluginId =
  | "core"
  | "commerce"
  | "commerceDigital"
  | "commerceReviews"
  | "commerceSubscriptions"
  | "commerceWishlists"
  | "commerceReturns"
  | "membership"
  | "tickets"
  | "knowledgeBase"
  | "lms"
  | "forms"
  | (string & {});

export interface DashboardPageDefinition {
  /** Stable id, also the website page module folder name. */
  id: string;
  title: string;
  /** Lucide icon name (kebab-case), resolved by the website renderer. */
  icon: string;
  description: string;
  /** Path under the dashboard base path, e.g. "/orders". "" is the home page. */
  path: string;
  /** Plugin that must be enabled for the page to exist. */
  pluginId: DashboardPluginId;
  /** Website capability required, when the page is not for every member. */
  capability?: string;
  /** Group used by the admin menu builder and the default sidebar. */
  group: "overview" | "activity" | "commerce" | "learning" | "support" | "account";
  /** Included in the generated default sidebar when no menu is assigned. */
  defaultInSidebar: boolean;
  /** Live badge shown next to the item (see BADGE_SOURCES). */
  badge?: DashboardBadgeSource;
}

export type DashboardWidgetSize = "sm" | "md" | "lg" | "xl";

export interface DashboardWidgetDefinition {
  /** Stable id, also the website widget module folder name. */
  id: string;
  title: string;
  description: string;
  icon: string;
  pluginId: DashboardPluginId;
  capability?: string;
  /** Sizes the widget renders well at; the grid snaps resizes to these. */
  sizes: DashboardWidgetSize[];
  defaultSize: DashboardWidgetSize;
  /** Settings the admin or member can tune; rendered by the layout editor. */
  settings?: DashboardWidgetSetting[];
  /** Present in a fresh default layout. */
  defaultInHome: boolean;
  /** Category for the widget picker. */
  category: "overview" | "activity" | "commerce" | "learning" | "support" | "content";
}

export interface DashboardWidgetSetting {
  key: string;
  label: string;
  kind: "number" | "toggle" | "select" | "text";
  defaultValue: string | number | boolean;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
}

/** Badge counters the website resolves in one subscription for the viewer. */
export const BADGE_SOURCES = [
  "notifications.unread",
  "tickets.awaitingYou",
  "orders.active",
  "cart.items",
  "courses.inProgress",
] as const;
export type DashboardBadgeSource = (typeof BADGE_SOURCES)[number];

/** Widget grid geometry shared by the admin editor and the website grid. */
export const DASHBOARD_GRID = {
  columns: 12,
  rowHeight: 96,
  gap: 16,
  sizes: {
    sm: { w: 3, h: 2 },
    md: { w: 4, h: 3 },
    lg: { w: 6, h: 3 },
    xl: { w: 12, h: 4 },
  } as Record<DashboardWidgetSize, { w: number; h: number }>,
} as const;

// ─── Pages ──────────────────────────────────────────────────────────────────

export const CORE_DASHBOARD_PAGES: DashboardPageDefinition[] = [
  { id: "home", title: "Dashboard", icon: "layout-dashboard", description: "Your overview, built from widgets.", path: "", pluginId: "core", group: "overview", defaultInSidebar: true },
  { id: "notifications", title: "Notifications", icon: "bell", description: "Everything that needs your attention, in one inbox.", path: "/notifications", pluginId: "core", group: "activity", defaultInSidebar: true, badge: "notifications.unread" },
  { id: "posts", title: "My posts", icon: "file-text", description: "Content you have written.", path: "/posts", pluginId: "core", capability: "edit_posts", group: "activity", defaultInSidebar: true },
  { id: "comments", title: "My comments", icon: "message-square", description: "Comments you have left across the site.", path: "/comments", pluginId: "core", group: "activity", defaultInSidebar: true },
  { id: "orders", title: "Orders", icon: "shopping-bag", description: "Order history, tracking, and receipts.", path: "/orders", pluginId: "commerce", group: "commerce", defaultInSidebar: true, badge: "orders.active" },
  { id: "subscriptions", title: "Subscriptions", icon: "repeat", description: "Plans, renewals, and payment methods.", path: "/subscriptions", pluginId: "commerceSubscriptions", group: "commerce", defaultInSidebar: true },
  { id: "returns", title: "Returns", icon: "package-open", description: "Return requests and refunds.", path: "/returns", pluginId: "commerceReturns", group: "commerce", defaultInSidebar: true },
  { id: "downloads", title: "Downloads", icon: "download", description: "Digital purchases ready to download.", path: "/downloads", pluginId: "commerceDigital", group: "commerce", defaultInSidebar: true },
  { id: "wishlist", title: "Wishlist", icon: "heart", description: "Saved products.", path: "/wishlist", pluginId: "commerceWishlists", group: "commerce", defaultInSidebar: true },
  { id: "reviews", title: "My reviews", icon: "star", description: "Reviews you have written.", path: "/reviews", pluginId: "commerceReviews", group: "commerce", defaultInSidebar: false },
  { id: "addresses", title: "Addresses", icon: "map-pin", description: "Shipping and billing addresses.", path: "/addresses", pluginId: "commerce", group: "commerce", defaultInSidebar: true },
  { id: "membership", title: "Membership", icon: "badge-check", description: "Your plan, benefits, and billing.", path: "/membership", pluginId: "membership", group: "commerce", defaultInSidebar: true },
  { id: "courses", title: "My courses", icon: "graduation-cap", description: "Courses in progress and completed.", path: "/courses", pluginId: "lms", group: "learning", defaultInSidebar: true, badge: "courses.inProgress" },
  { id: "tickets", title: "Support tickets", icon: "life-buoy", description: "Conversations with support.", path: "/tickets", pluginId: "tickets", group: "support", defaultInSidebar: true, badge: "tickets.awaitingYou" },
  { id: "help", title: "Help center", icon: "book-open", description: "Guides and answers.", path: "/help", pluginId: "knowledgeBase", group: "support", defaultInSidebar: true },
  { id: "profile", title: "Profile", icon: "user", description: "Name, avatar, bio, and social links.", path: "/profile", pluginId: "core", group: "account", defaultInSidebar: true },
  { id: "settings", title: "Settings", icon: "settings", description: "Email, notification, and account preferences.", path: "/settings", pluginId: "core", group: "account", defaultInSidebar: true },
  { id: "security", title: "Security", icon: "shield-check", description: "Password, sessions, and sign-in activity.", path: "/security", pluginId: "core", group: "account", defaultInSidebar: true },
];

// ─── Widgets ────────────────────────────────────────────────────────────────

export const CORE_DASHBOARD_WIDGETS: DashboardWidgetDefinition[] = [
  { id: "welcome", title: "Welcome", description: "Greeting, avatar, and the quickest next steps.", icon: "sparkles", pluginId: "core", sizes: ["md", "lg", "xl"], defaultSize: "lg", defaultInHome: true, category: "overview" },
  { id: "quick-links", title: "Quick links", description: "Shortcuts to the pages this member uses most.", icon: "link", pluginId: "core", sizes: ["sm", "md", "lg"], defaultSize: "md", defaultInHome: true, category: "overview", settings: [{ key: "limit", label: "Links shown", kind: "number", defaultValue: 6, min: 3, max: 12 }] },
  { id: "notifications", title: "Notifications", description: "Latest unread notifications with one-tap actions.", icon: "bell", pluginId: "core", sizes: ["md", "lg"], defaultSize: "md", defaultInHome: true, category: "activity", settings: [{ key: "limit", label: "Items shown", kind: "number", defaultValue: 5, min: 3, max: 15 }] },
  { id: "my-content", title: "My content", description: "Recent posts and their status.", icon: "file-text", pluginId: "core", capability: "edit_posts", sizes: ["md", "lg"], defaultSize: "md", defaultInHome: false, category: "content" },
  { id: "my-comments", title: "My comments", description: "Recent comments and replies to them.", icon: "message-square", pluginId: "core", sizes: ["md", "lg"], defaultSize: "md", defaultInHome: false, category: "activity" },
  { id: "content-performance", title: "Content performance", description: "Views and engagement on your posts.", icon: "bar-chart-3", pluginId: "core", capability: "edit_posts", sizes: ["lg", "xl"], defaultSize: "lg", defaultInHome: false, category: "content" },
  { id: "orders", title: "Recent orders", description: "Latest orders with status and tracking.", icon: "shopping-bag", pluginId: "commerce", sizes: ["md", "lg", "xl"], defaultSize: "lg", defaultInHome: true, category: "commerce", settings: [{ key: "limit", label: "Orders shown", kind: "number", defaultValue: 4, min: 2, max: 10 }] },
  { id: "subscription", title: "Subscription", description: "Current plan, next renewal, and payment method.", icon: "repeat", pluginId: "commerceSubscriptions", sizes: ["sm", "md"], defaultSize: "md", defaultInHome: true, category: "commerce" },
  { id: "downloads", title: "Downloads", description: "Digital purchases ready to grab.", icon: "download", pluginId: "commerceDigital", sizes: ["sm", "md"], defaultSize: "md", defaultInHome: false, category: "commerce" },
  { id: "wishlist", title: "Wishlist", description: "Saved products and price changes.", icon: "heart", pluginId: "commerceWishlists", sizes: ["sm", "md"], defaultSize: "md", defaultInHome: false, category: "commerce" },
  { id: "membership", title: "Membership", description: "Plan, status, and benefits at a glance.", icon: "badge-check", pluginId: "membership", sizes: ["sm", "md"], defaultSize: "md", defaultInHome: true, category: "commerce" },
  { id: "courses", title: "Continue learning", description: "Courses in progress with resume buttons.", icon: "graduation-cap", pluginId: "lms", sizes: ["md", "lg", "xl"], defaultSize: "lg", defaultInHome: true, category: "learning" },
  { id: "tickets", title: "Support tickets", description: "Open conversations and replies waiting on you.", icon: "life-buoy", pluginId: "tickets", sizes: ["md", "lg"], defaultSize: "md", defaultInHome: true, category: "support", settings: [{ key: "limit", label: "Tickets shown", kind: "number", defaultValue: 3, min: 1, max: 8 }] },
  { id: "help-search", title: "Help search", description: "Search the knowledge base without leaving the dashboard.", icon: "search", pluginId: "knowledgeBase", sizes: ["md", "lg"], defaultSize: "md", defaultInHome: false, category: "support" },
];

// ─── Merge with extension contributions ─────────────────────────────────────

const contributedPages: DashboardPageDefinition[] = [];
const contributedWidgets: DashboardWidgetDefinition[] = [];
for (const contribution of extensionDashboardContributions) {
  contributedPages.push(...(contribution.pages ?? []));
  contributedWidgets.push(...(contribution.widgets ?? []));
}

export const DASHBOARD_PAGES: DashboardPageDefinition[] = [...CORE_DASHBOARD_PAGES, ...contributedPages];
export const DASHBOARD_WIDGETS: DashboardWidgetDefinition[] = [...CORE_DASHBOARD_WIDGETS, ...contributedWidgets];

export function getDashboardPage(id: string): DashboardPageDefinition | undefined {
  return DASHBOARD_PAGES.find((page: DashboardPageDefinition) => page.id === id);
}

export function getDashboardWidget(id: string): DashboardWidgetDefinition | undefined {
  return DASHBOARD_WIDGETS.find((widget: DashboardWidgetDefinition) => widget.id === id);
}

/** Settings key that gates a plugin, e.g. "commerce" → "commerceEnabled". */
export function pluginSettingsKey(pluginId: DashboardPluginId): string | null {
  if (pluginId === "core") return null;
  return `${pluginId}Enabled`;
}

/** Commerce sub-plugins also require the parent commerce plugin. */
export function pluginIsEnabled(pluginId: DashboardPluginId, flags: Record<string, unknown>): boolean {
  if (pluginId === "core") return true;
  const key = pluginSettingsKey(pluginId);
  if (!key) return true;
  if (flags[key] !== true) return false;
  if (pluginId.startsWith("commerce") && pluginId !== "commerce") {
    return flags.commerceEnabled === true;
  }
  return true;
}

// ─── Layouts ────────────────────────────────────────────────────────────────

export interface DashboardLayoutItem {
  /** Unique within the layout; lets the same widget appear twice. */
  key: string;
  widgetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  settings?: Record<string, string | number | boolean>;
  /** Member hid this widget (user layouts only). */
  hidden?: boolean;
}

/** The layout every fresh site starts with, filtered by enabled plugins. */
export function buildDefaultLayoutItems(flags: Record<string, unknown>): DashboardLayoutItem[] {
  const items: DashboardLayoutItem[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const widget of DASHBOARD_WIDGETS) {
    if (!widget.defaultInHome || !pluginIsEnabled(widget.pluginId, flags)) continue;
    const size = DASHBOARD_GRID.sizes[widget.defaultSize];
    if (x + size.w > DASHBOARD_GRID.columns) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    items.push({ key: widget.id, widgetId: widget.id, x, y, w: size.w, h: size.h });
    x += size.w;
    rowHeight = Math.max(rowHeight, size.h);
  }
  return items;
}
