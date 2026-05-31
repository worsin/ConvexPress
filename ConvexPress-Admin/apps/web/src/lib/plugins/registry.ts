import {
  BookOpen,
  Download,
  GraduationCap,
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

/**
 * Platform-shipped plugin ids — the closed union of extensions that
 * ship hand-edited into this file. v2 user-added extensions discovered
 * by the scanner at the bottom of this file widen `AdminPluginId` at
 * runtime to any string.
 */
export type BuiltinAdminPluginId =
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
  | "gallery"
  | "lms";

/**
 * Union of platform-shipped + v2 extension ids. Retains literal
 * autocomplete on the builtins via the `BuiltinAdminPluginId | (string & {})`
 * pattern (which is a known TS trick to keep literals while accepting any
 * string) so consumers passing one of the builtins still get type-safe
 * narrowing.
 */
export type AdminPluginId = BuiltinAdminPluginId | (string & {});

/**
 * Platform-shipped settings keys, strongly typed. v2 extensions add
 * their own `<id>Enabled` keys at runtime via a `Record<string, boolean>`
 * intersection so the type stays open.
 */
export interface BuiltinPluginSettingsValues {
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
  lmsEnabled: boolean;
}

export type PluginSettingsValues = BuiltinPluginSettingsValues & Record<string, boolean>;

/**
 * The contract a plugin/extension must satisfy. Identical for platform
 * plugins (hand-edited in `PLATFORM_PLUGINS` below) and v2 extensions
 * (default-exported from `extensions[.local]/<id>/manifest.ts`).
 *
 * v2 extension manifests should export an `AdminPluginDefinition` as
 * their default export — see `extension-kit/references/manifest.example.ts`.
 */
export interface AdminPluginDefinition {
  id: AdminPluginId;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Key into PluginSettingsValues. By convention: `<id>Enabled`. */
  settingsKey: string;
  navSectionIds: string[];
  adminAccessPrefixes: string[];
  routePrefixes: string[];
  /**
   * Optional. Whether the extension is enabled by default on a fresh
   * install. v2 extensions should set this in their manifest; platform
   * plugins set it via `DEFAULT_PLUGIN_SETTINGS` below.
   */
  defaultEnabled?: boolean;
  /**
   * Optional. Source: "platform" = hand-edited in this repo;
   * "official" = scanner-discovered from apps/web/src/extensions/;
   * "local" = scanner-discovered from apps/web/src/extensions.local/.
   * Populated automatically — extensions don't need to set this.
   */
  source?: "platform" | "official" | "local";
}

/*
 * Registry audit (Phase 1.1, 2026-04-15):
 *   - adminAccessPrefixes corrected to the real TanStack admin paths. The
 *     admin shell uses a `_admin` layout group, not an `/admin` URL segment,
 *     so the router sees `/commerce/bundles`, not `/admin/commerce/bundles`.
 *   - Gallery no longer claims `/admin/media`. The core Media Library is
 *     not a Gallery sub-resource and must remain available when Gallery is
 *     disabled.
 *   - Wishlist admin prefix `/commerce/wishlists` is retained with a
 *     matching admin route and nav entry.
 *   - Every commerce sub-extension also implicitly depends on the `commerce`
 *     plugin being enabled. Phase 1 guard will enforce this via a parent-
 *     plugin check in requirePluginEnabled.
 */
/**
 * Hand-edited list of platform-shipped plugins. v2 extensions are
 * discovered by the scanner below and merged into the exported
 * `ADMIN_PLUGINS` array at module load.
 */
const PLATFORM_PLUGINS: AdminPluginDefinition[] = [
  {
    id: "commerce",
    title: "Commerce",
    description:
      "Products, cart, checkout, orders, customers, payments, shipping, and tax.",
    icon: ShoppingCart,
    settingsKey: "commerceEnabled",
    navSectionIds: ["commerce"],
    adminAccessPrefixes: ["/commerce"],
    routePrefixes: ["/shop", "/products", "/categories", "/cart", "/checkout", "/track"],
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
    routePrefixes: ["/pricing", "/signup", "/dashboard/subscriptions"],
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
    routePrefixes: ["/dashboard/membership"],
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
    routePrefixes: ["/support"],
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
  {
    id: "lms",
    title: "LMS",
    description:
      "Courses, topics, and lessons with AI-assisted authoring and membership-gated access.",
    icon: GraduationCap,
    settingsKey: "lmsEnabled",
    navSectionIds: ["lms"],
    adminAccessPrefixes: ["/lms"],
    routePrefixes: ["/courses", "/account/courses"],
    defaultEnabled: true,
  },
];

// ─── Extension v2 scanner ────────────────────────────────────────────────────
//
// User-shipped extensions discovered at build time from two roots:
//
//   apps/web/src/extensions/<id>/manifest.ts        (official, tracked)
//   apps/web/src/extensions.local/<id>/manifest.ts  (user, gitignored)
//
// Each manifest must default-export an AdminPluginDefinition. Vite's
// `import.meta.glob` resolves these statically at build time, so the
// scanner is zero-cost at runtime. Empty folders produce no entries.

interface ManifestModule {
  default: AdminPluginDefinition;
}

const officialExtensionModules = import.meta.glob<ManifestModule>(
  "../../extensions/*/manifest.ts",
  { eager: true },
);
const localExtensionModules = import.meta.glob<ManifestModule>(
  "../../extensions.local/*/manifest.ts",
  { eager: true },
);

function pluginsFromModules(
  modules: Record<string, ManifestModule>,
  source: "official" | "local",
): AdminPluginDefinition[] {
  return Object.values(modules)
    .map((mod) => mod.default)
    .filter((manifest): manifest is AdminPluginDefinition => Boolean(manifest))
    .map((manifest) => ({ ...manifest, source }));
}

const OFFICIAL_EXTENSIONS = pluginsFromModules(officialExtensionModules, "official");
const LOCAL_EXTENSIONS = pluginsFromModules(localExtensionModules, "local");

/**
 * The merged plugin registry: platform-shipped + v2 official extensions
 * + v2 local extensions. Consumers of this app refer to this array; they
 * cannot tell the difference between platform and v2 entries.
 */
export const ADMIN_PLUGINS: AdminPluginDefinition[] = [
  ...PLATFORM_PLUGINS.map<AdminPluginDefinition>((p) => ({ ...p, source: "platform" })),
  ...OFFICIAL_EXTENSIONS,
  ...LOCAL_EXTENSIONS,
];

export const PLUGINS_NAV_SECTION = {
  id: "plugins",
  label: "Extensions",
  to: "/plugins",
  icon: Puzzle,
  capability: "manage_options",
} as const;

/** Platform-shipped default-enabled state for each builtin plugin. */
const PLATFORM_DEFAULT_SETTINGS: BuiltinPluginSettingsValues = {
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
  lmsEnabled: true,
};

/**
 * Default settings for ALL plugins — built by merging platform defaults
 * with each v2 extension's manifest `defaultEnabled`. v2 extensions that
 * omit `defaultEnabled` default to `false`.
 */
export const DEFAULT_PLUGIN_SETTINGS: PluginSettingsValues = (() => {
  const merged: Record<string, boolean> = { ...PLATFORM_DEFAULT_SETTINGS };
  for (const ext of [...OFFICIAL_EXTENSIONS, ...LOCAL_EXTENSIONS]) {
    if (!merged.hasOwnProperty(ext.settingsKey)) {
      merged[ext.settingsKey] = ext.defaultEnabled ?? false;
    }
  }
  return merged as PluginSettingsValues;
})();

/**
 * Parent-dependency map. A child plugin is only considered enabled if
 * its parent is also enabled. v2 extensions can declare a parent in
 * their manifest (TBD field); for now this is the platform list.
 */
export const PLUGIN_PARENT: Partial<Record<string, AdminPluginId>> = {
  commerceDigital: "commerce",
  commerceReviews: "commerce",
  commerceWishlists: "commerce",
  commerceBundles: "commerce",
  commerceReturns: "commerce",
  commerceSubscriptions: "commerce",
};

export function getPluginDefinition(pluginId: AdminPluginId) {
  return ADMIN_PLUGINS.find((plugin) => plugin.id === pluginId) ?? null;
}

export function getPluginParent(pluginId: AdminPluginId) {
  return PLUGIN_PARENT[pluginId] ?? null;
}

export function isPluginEnabled(
  pluginId: AdminPluginId,
  values: Partial<PluginSettingsValues> | null | undefined,
) {
  const plugin = getPluginDefinition(pluginId);
  if (!plugin) return true;
  const merged = { ...DEFAULT_PLUGIN_SETTINGS, ...(values ?? {}) };
  const parentId = getPluginParent(pluginId);
  if (parentId && !isPluginEnabled(parentId, merged)) {
    return false;
  }
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
