import {
  BookOpen,
  Download,
  Heart,
  Package,
  Puzzle,
  Repeat,
  RotateCcw,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Star,
  TicketCheck,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

export type AdminPluginId =
  | "commerce"
  | "commerceDigital"
  | "commerceReviews"
  | "commerceWishlists"
  | "commerceBundles"
  | "commerceReturns"
  | "commerceSubscriptions"
  | "membership"
  | "knowledgeBase"
  | "tickets"
  | "customFields"
  | "recipes"
  | "gallery";

export interface PluginSettingsValues {
  commerceEnabled: boolean;
  commerceDigitalEnabled: boolean;
  commerceReviewsEnabled: boolean;
  commerceWishlistsEnabled: boolean;
  commerceBundlesEnabled: boolean;
  commerceReturnsEnabled: boolean;
  commerceSubscriptionsEnabled: boolean;
  membershipEnabled: boolean;
  knowledgeBaseEnabled: boolean;
  ticketsEnabled: boolean;
  customFieldsEnabled: boolean;
  recipesEnabled: boolean;
  galleryEnabled: boolean;
}

export interface AdminPluginDefinition {
  id: AdminPluginId;
  title: string;
  description: string;
  icon: LucideIcon;
  settingsKey: keyof PluginSettingsValues;
  navSectionIds: string[];
  adminAccessPrefixes: string[];
  routePrefixes: string[];
}

/*
 * Registry audit (Phase 1.1, 2026-04-15):
 *   - adminAccessPrefixes corrected to the real TanStack admin paths. The
 *     admin shell uses a `_admin` layout group, not an `/admin` URL segment,
 *     so the router sees `/commerce/bundles`, not `/admin/commerce/bundles`.
 *   - Gallery no longer claims `/admin/media`. The core Media Library is
 *     not a Gallery sub-resource and must remain available when Gallery is
 *     disabled.
 *   - Wishlist admin prefix `/commerce/wishlists` is retained. The matching
 *     admin route set is TODO (Phase 3.8 — Wishlists admin pages) per the
 *     no-feature-removal rule: we build the route, we do not drop the claim.
 *   - Every commerce sub-extension also implicitly depends on the `commerce`
 *     plugin being enabled. Phase 1 guard will enforce this via a parent-
 *     plugin check in requirePluginEnabled.
 */
export const ADMIN_PLUGINS: AdminPluginDefinition[] = [
  {
    id: "commerce",
    title: "Commerce",
    description:
      "Products, cart, checkout, orders, customers, payments, shipping, and tax.",
    icon: ShoppingCart,
    settingsKey: "commerceEnabled",
    navSectionIds: ["commerce"],
    adminAccessPrefixes: ["/commerce"],
    routePrefixes: ["/shop", "/products", "/cart", "/checkout", "/track"],
  },
  {
    id: "commerceDigital",
    title: "Digital Products",
    description:
      "Downloadable files, secure download tokens, license keys, and customer download management.",
    icon: Download,
    settingsKey: "commerceDigitalEnabled",
    navSectionIds: [],
    adminAccessPrefixes: ["/commerce/digital"],
    routePrefixes: ["/dashboard/downloads"],
  },
  {
    id: "commerceReviews",
    title: "Product Reviews",
    description:
      "Star ratings, text reviews, moderation queue, helpful votes, and verified purchase badges.",
    icon: Star,
    settingsKey: "commerceReviewsEnabled",
    navSectionIds: [],
    adminAccessPrefixes: ["/commerce/reviews"],
    routePrefixes: ["/dashboard/reviews"],
  },
  {
    id: "commerceWishlists",
    title: "Wishlists",
    description:
      "Customer wishlists with multiple lists, sharing, move-to-cart, and guest merge.",
    icon: Heart,
    settingsKey: "commerceWishlistsEnabled",
    navSectionIds: [],
    // TODO (Phase 3.8): Build the admin wishlist pages to match this claim.
    adminAccessPrefixes: ["/commerce/wishlists"],
    routePrefixes: ["/dashboard/wishlist", "/wishlist"],
  },
  {
    id: "commerceBundles",
    title: "Product Bundles",
    description:
      "Bundle products with component selection, dynamic pricing, and availability checks.",
    icon: Package,
    settingsKey: "commerceBundlesEnabled",
    navSectionIds: [],
    adminAccessPrefixes: ["/commerce/bundles"],
    routePrefixes: ["/bundles"],
  },
  {
    id: "commerceReturns",
    title: "Returns & RMA",
    description:
      "Return requests, approval workflows, return labels, restocking, and refund integration.",
    icon: RotateCcw,
    settingsKey: "commerceReturnsEnabled",
    navSectionIds: [],
    adminAccessPrefixes: ["/commerce/returns"],
    routePrefixes: ["/dashboard/returns"],
  },
  {
    id: "commerceSubscriptions",
    title: "Commerce Subscriptions",
    description:
      "Recurring billing, subscription products, invoices, renewals, and dunning.",
    icon: Repeat,
    settingsKey: "commerceSubscriptionsEnabled",
    navSectionIds: [],
    adminAccessPrefixes: ["/commerce/subscriptions"],
    routePrefixes: ["/account/subscriptions"],
  },
  {
    id: "membership",
    title: "Membership",
    description:
      "Plans, grants, restriction rules, and membership-driven access control.",
    icon: ShieldCheck,
    settingsKey: "membershipEnabled",
    navSectionIds: ["membership"],
    adminAccessPrefixes: ["/membership"],
    routePrefixes: ["/account/membership"],
  },
  {
    id: "knowledgeBase",
    title: "Knowledge Base",
    description:
      "Articles, collections, tags, analytics, and KB settings for customer self-service.",
    icon: BookOpen,
    settingsKey: "knowledgeBaseEnabled",
    navSectionIds: ["kb"],
    adminAccessPrefixes: ["/kb"],
    // Public KB lives at /help on the website; /kb is reserved for admin-
    // linked public article URLs for backwards compatibility.
    routePrefixes: ["/kb", "/help"],
  },
  {
    id: "tickets",
    title: "Support Tickets",
    description:
      "Ticket inbox, canned responses, ticket analytics, and support deflection analytics.",
    icon: TicketCheck,
    settingsKey: "ticketsEnabled",
    navSectionIds: ["tickets"],
    adminAccessPrefixes: ["/tickets", "/support"],
    routePrefixes: ["/tickets", "/support"],
  },
  {
    id: "customFields",
    title: "Custom Fields",
    description:
      "Field groups, editor metaboxes, and custom content metadata rules.",
    icon: SlidersHorizontal,
    settingsKey: "customFieldsEnabled",
    navSectionIds: ["custom-fields"],
    adminAccessPrefixes: ["/custom-fields"],
    routePrefixes: ["/custom-fields"],
  },
  {
    id: "recipes",
    title: "Recipes",
    description:
      "Recipe content, recipe categories, recipe card imports, and public recipe pages.",
    icon: UtensilsCrossed,
    settingsKey: "recipesEnabled",
    navSectionIds: ["recipes"],
    adminAccessPrefixes: ["/recipes"],
    routePrefixes: ["/recipes"],
  },
  {
    id: "gallery",
    title: "Image Galleries",
    description:
      "Albums, gallery categories, embedded image grids, and public gallery pages.",
    icon: SlidersHorizontal,
    // Narrowed: Gallery no longer claims `/admin/media` — the core Media
    // Library is independent of the Gallery extension.
    settingsKey: "galleryEnabled",
    navSectionIds: ["gallery"],
    adminAccessPrefixes: ["/gallery"],
    routePrefixes: ["/gallery"],
  },
];

export const PLUGINS_NAV_SECTION = {
  id: "plugins",
  label: "Extensions",
  to: "/plugins",
  icon: Puzzle,
  capability: "manage_options",
} as const;

export const DEFAULT_PLUGIN_SETTINGS: PluginSettingsValues = {
  commerceEnabled: false,
  commerceDigitalEnabled: false,
  commerceReviewsEnabled: false,
  commerceWishlistsEnabled: false,
  commerceBundlesEnabled: false,
  commerceReturnsEnabled: false,
  commerceSubscriptionsEnabled: false,
  membershipEnabled: false,
  knowledgeBaseEnabled: true,
  ticketsEnabled: true,
  customFieldsEnabled: true,
  recipesEnabled: true,
  galleryEnabled: true,
};

export function getPluginDefinition(pluginId: AdminPluginId) {
  return ADMIN_PLUGINS.find((plugin) => plugin.id === pluginId) ?? null;
}

export function isPluginEnabled(
  pluginId: AdminPluginId,
  values: Partial<PluginSettingsValues> | null | undefined,
) {
  const plugin = getPluginDefinition(pluginId);
  if (!plugin) return true;
  const merged = { ...DEFAULT_PLUGIN_SETTINGS, ...(values ?? {}) };
  return Boolean(merged[plugin.settingsKey]);
}

export function isPluginNavSectionEnabled(
  sectionId: string,
  values: Partial<PluginSettingsValues> | null | undefined,
) {
  const pluginId = getPluginIdForNavSection(sectionId);
  return pluginId ? isPluginEnabled(pluginId, values) : true;
}

export function getPluginIdForNavSection(sectionId: string): AdminPluginId | null {
  const plugin = ADMIN_PLUGINS.find((entry) =>
    entry.navSectionIds.includes(sectionId),
  );
  return plugin?.id ?? null;
}

export function getPluginIdForAdminAccess(
  adminAccessPath: string,
): AdminPluginId | null {
  const plugin = ADMIN_PLUGINS.find((entry) =>
    entry.adminAccessPrefixes.some(
      (prefix) =>
        adminAccessPath === prefix || adminAccessPath.startsWith(prefix + "/"),
    ),
  );
  return plugin?.id ?? null;
}

export function getPluginIdForRoutePath(pathname: string): AdminPluginId | null {
  const plugin = ADMIN_PLUGINS.find((entry) =>
    entry.routePrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
    ),
  );
  return plugin?.id ?? null;
}
