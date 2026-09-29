import { publicMenuDocumentHref } from "../helpers/publicDocumentHref";
/**
 * Menu System - Queries
 *
 * All read operations for menus:
 *   listMenus          - List all menus with assigned locations (admin)
 *   getMenu            - Get a single menu with its items and locations (admin edit)
 *   getMenuItemTree    - Get menu items as a hierarchical tree (admin builder)
 *   getMenuForLocation - Get the menu assigned to a location (website, public)
 *   getMenuLocations   - Get all locations with assigned menu names (admin)
 *   getLinkableContent  - Get content available for adding as menu items (admin)
 *
 * Authorization:
 *   - listMenus, getMenu, getMenuItemTree, getMenuLocations, getLinkableContent:
 *     Require authentication (admin routes)
 *   - getMenuForLocation: PUBLIC - no auth required (website rendering)
 */

import { ConvexError } from "convex/values";
import { query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { createContentDiscoveryEvaluator } from "../helpers/publicContent";
import { getValidMembershipGrants } from "../membership/access";
import { membershipAuthorityReader } from "../helpers/membershipAuthority";
import { sanitizeUrl } from "../helpers/sanitize";
import { getCurrentUser } from "../helpers/permissions";
import {
  getMenuArgs,
  getMenuItemTreeArgs,
  getMenuForLocationArgs,
  getLinkableContentArgs,
  DEFAULT_MENU_LOCATIONS,
  MAX_DEPTH,
} from "./validators";
import { publicMenuResultValidator, type PublicMenuItem, type PublicMenuResult } from "./publicContract";
import type { Doc, Id } from "../_generated/dataModel";
import { buildMenuItemTree, resolveMenuItemUrl } from "./internals";
import { DASHBOARD_PAGES, getDashboardPage, pluginIsEnabled } from "../extensions/dashboard/registry";
import { menuItemVisibleFor, type MenuViewer } from "../extensions/dashboard/visibility";
import { getDefaults, type SettingsSection } from "../settings/defaults";
import { resolveUserRole } from "../helpers/permissions";

const DASHBOARD_DEFAULT_BASE = "/dashboard";

/** Merged settings section (defaults + stored) without auth; public-safe fields only. */
async function getMergedSettingsSection(ctx: QueryCtx, section: SettingsSection, budget?: RequestReadLedger): Promise<Record<string, unknown>> {
  budget?.beforeRead();
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_section", (q) => q.eq("section", section))
    .unique();
  budget?.record(doc);
  return { ...getDefaults(section), ...((doc?.values as Record<string, unknown>) ?? {}) };
}

/** Who is looking at the menu: signed-in state, role, membership plans, capabilities. */
export async function resolveMenuViewer(
  ctx: QueryCtx,
  budget?: RequestReadLedger,
): Promise<MenuViewer> {
  const user = await getCurrentUser(ctx, budget);
  if (!user || user.status !== "active") {
    return { signedIn: false, roleSlug: null, planSlugs: [], capabilities: [] };
  }
  const role = await resolveUserRole(ctx, user, budget);
  const planSlugs: string[] = [];
  const grants = await getValidMembershipGrants(ctx, user._id, budget);
  const authority = membershipAuthorityReader(ctx, budget);
  for (const grant of grants) {
    const plan = grant.planId ? await authority.plan(grant.planId) : null;
    if (plan?.status === "active" && plan.slug) planSlugs.push(plan.slug);
  }
  return {
    signedIn: true,
    roleSlug: role?.slug ?? null,
    planSlugs: [...new Set(planSlugs)],
    capabilities: role?.capabilities ?? [],
  };
}

// ─── List Menus (Admin) ─────────────────────────────────────────────────────

/**
 * List all menus with their assigned location names.
 * Used by the admin menu list page (/admin/menus).
 *
 * Requires authentication.
 * Returns menus sorted alphabetically by name.
 */
export const listMenus = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    // ── Fetch all menus ─────────────────────────────────────────────────
    // Bounded to 100 menus - sites rarely have more than 20
    const menus = await ctx.db.query("menus").take(100);

    // Sort alphabetically by name
    menus.sort((a, b) => a.name.localeCompare(b.name));

    // ── Build location map ──────────────────────────────────────────────
    // Bounded to 50 locations - themes typically define 5-10 locations
    const allLocations = await ctx.db.query("menuLocations").take(50);

    // Map menuId -> array of location names
    const locationMap = new Map<string, string[]>();
    for (const loc of allLocations) {
      if (loc.menuId) {
        const menuIdStr = loc.menuId.toString();
        if (!locationMap.has(menuIdStr)) {
          locationMap.set(menuIdStr, []);
        }
        locationMap.get(menuIdStr)!.push(loc.name);
      }
    }

    // ── Return menus with location names ────────────────────────────────
    return menus.map((menu) => ({
      ...menu,
      assignedLocations: locationMap.get(menu._id.toString()) ?? [],
    }));
  },
});

// ─── Get Menu (Admin Edit) ──────────────────────────────────────────────────

/**
 * Get a single menu with all its items and assigned locations.
 * Used by the admin menu editor page (/admin/menus/$menuId/edit).
 *
 * Items are returned as a flat list sorted by position.
 * The client can build a tree from the flat list if needed.
 */
export const getMenu = query({
  args: getMenuArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    // ── Fetch menu ──────────────────────────────────────────────────────
    const menu = await ctx.db.get("menus", args.menuId);
    if (!menu) return null;

    // ── Fetch all items for this menu ───────────────────────────────────
    // Bounded to 500 items per menu
    const items = await ctx.db
      .query("menuItems")
      .withIndex("by_menu", (q) => q.eq("menuId", args.menuId))
      .take(500);

    // Sort by position
    items.sort((a, b) => a.position - b.position);

    // ── Fetch assigned locations ────────────────────────────────────────
    // Bounded to 20 locations per menu
    const locations = await ctx.db
      .query("menuLocations")
      .withIndex("by_menu", (q) => q.eq("menuId", args.menuId))
      .take(20);

    const assignedLocations = locations.map((loc) => loc.slug);

    return {
      ...menu,
      items,
      assignedLocations,
    };
  },
});

// ─── Get Menu Item Tree (Admin Builder) ─────────────────────────────────────

/**
 * Get menu items as a hierarchical tree structure.
 * Alternative to the flat list from getMenu, useful for the drag-and-drop builder.
 */
export const getMenuItemTree = query({
  args: getMenuItemTreeArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    // ── Fetch all items for this menu ───────────────────────────────────
    // Bounded to 500 items per menu
    const items = await ctx.db
      .query("menuItems")
      .withIndex("by_menu", (q) => q.eq("menuId", args.menuId))
      .take(500);

    // Sort by position before building tree
    items.sort((a, b) => a.position - b.position);

    return buildMenuItemTree(items);
  },
});

// ─── Get Menu for Location (Website - PUBLIC) ───────────────────────────────

/**
 * Get the menu assigned to a specific theme location.
 * This is a PUBLIC query - no authentication required.
 * Used by the website's <SiteMenu> component.
 *
 * Returns the menu with items built into a hierarchical tree.
 * Filters out orphaned items. Resolves current URLs for content-linked items.
 * Returns null if no menu is assigned to the location.
 *
 * PERFORMANCE: This is on the critical path for every page load.
 * Convex caching handles most of the performance concern.
 */
/** Reject browser-normalized destinations before applying the shared URL policy. */
function publicHref(raw: string | undefined): string | undefined {
  if (!raw || /[\u0000-\u001f\u007f\\]/.test(raw) || raw.trim().startsWith("//")) return undefined;
  return sanitizeUrl(raw) || undefined;
}
async function boundedRows<T extends object>(
  query: AsyncIterable<T>,
  limit: number,
  budget: RequestReadLedger,
): Promise<T[]> {
  const rows: T[] = [],
    iterator = query[Symbol.asyncIterator]();
  try {
    while (true) {
      budget.beforeRead();
      const next = await iterator.next();
      if (next.done) return rows;
      budget.record(next.value);
      if (rows.length >= limit)
        throw new ConvexError({
          code: "MENU_READ_BUDGET",
          message: "The menu exceeds its supported item limit.",
        });
      rows.push(next.value);
    }
  } finally {
    await iterator.return?.();
  }
}

/** Shared viewer-safe reader for theme locations and canonical menu references. */
export async function readPublicMenu(
  ctx: QueryCtx,
  selector: {locationSlug: string} | {menuId: string},
  budget = new RequestReadLedger({queries:4096,documents:8192,bytes:8*1024*1024,documentBytes:512*1024}),
  sourcePosts?: {beforeRead(): void; record(kind: "post", post: Doc<"posts">): void},
) {
  return createPublicMenuReader(ctx, budget, sourcePosts)(selector);
}

/** Fresh read-only snapshot reader: different selectors may resolve to the same
 * menu. Share its measured projection without retaining it across requests or
 * reusing it after a mutation writes menu, content, viewer, or policy state. */
export function createPublicMenuReader(
  ctx: QueryCtx,
  budget: RequestReadLedger,
  sourcePosts?: {beforeRead(): void; record(kind: "post", post: Doc<"posts">): void},
) {
  const menus = new Map<string, Promise<PublicMenuResult | null>>();
  return async (selector: {locationSlug: string} | {menuId: string}): Promise<PublicMenuResult | null> => {
    let menuId = 'menuId' in selector ? ctx.db.normalizeId('menus', selector.menuId) : null;
    if ('locationSlug' in selector) {
      let locationSlug = selector.locationSlug;
      budget.beforeRead();
      let location = budget.record(await ctx.db.query('menuLocations').withIndex('by_slug',q=>q.eq('slug',locationSlug)).unique());
      // Early Menu blocks defaulted to "primary" before the registered location
      // was aligned with "header". Preserve actual custom locations, including
      // unassigned ones, instead of rewriting saved content or their authority.
      if (!location && locationSlug === 'primary') {
        locationSlug = 'header';
        budget.beforeRead();
        location = budget.record(await ctx.db.query('menuLocations').withIndex('by_slug',q=>q.eq('slug',locationSlug)).unique());
      }
      menuId = location?.menuId ?? null;
      if (!menuId && locationSlug === 'header') {
        const menus = await boundedRows(ctx.db.query('menus'),50,budget);
        const preferred = menus.find(m=>m.slug==='main-navigation') ?? menus.find(m=>m.name.toLowerCase()==='main navigation') ?? menus[0];
        menuId = preferred?._id ?? null;
      }
    }
    if (!menuId) return null;
    let projected = menus.get(menuId);
    if (!projected) {
      projected = projectMenu(menuId);
      menus.set(menuId, projected);
    }
    return projected;
  };
  async function projectMenu(menuId: Id<"menus">): Promise<PublicMenuResult | null> {
    budget.beforeRead();
    const menu = budget.record(await ctx.db.get("menus", menuId));
    if (!menu) return null;
    const allItems = await boundedRows(
      ctx.db.query("menuItems").withIndex("by_menu_position", (q) => q.eq("menuId", menu._id)),
      500,
      budget,
    );
    const viewer = await resolveMenuViewer(ctx, budget);
    const plugins = await getMergedSettingsSection(ctx, "plugins", budget);
    const dashboard = await getMergedSettingsSection(ctx, "dashboard", budget);
    const dashboardBasePath =
      typeof dashboard.basePath === "string" ? dashboard.basePath : "/dashboard";
    const byId = new Map(allItems.map((item) => [String(item._id), item]));
    const resolved = new Map<string, { visible: boolean; url?: string; depth: number }>();
    const visiting = new Set<string>();
    const targets = new Map<string, string | undefined>();
    const discover = createContentDiscoveryEvaluator(ctx, budget);
    const targetUrl = async (item: Doc<"menuItems">): Promise<string | undefined> => {
      if (item.itemType === "custom") return publicHref(item.url);
      if (!item.objectId) return undefined;
      const key = `${item.itemType}:${item.objectId}:${item.pathOverride ?? ""}`;
      if (targets.has(key)) return targets.get(key);
      let url: string | undefined;
      if (item.itemType === "page" || item.itemType === "post") {
        const id = ctx.db.normalizeId("posts", item.objectId);
        if (id) {
          sourcePosts?.beforeRead(); budget.beforeRead();
          const post = budget.record(await ctx.db.get("posts", id));
          if (post) sourcePosts?.record("post", post);
          if (
            post &&
            post.type === item.itemType &&
            (await discover(post))
          ) {
            url = publicMenuDocumentHref(post);
          }
        }
      } else if (item.itemType === "category" || item.itemType === "tag") {
        const id = ctx.db.normalizeId("terms", item.objectId);
        if (id) {
          budget.beforeRead();
          const term = budget.record(await ctx.db.get("terms", id));
          if (term?.taxonomy === (item.itemType === "category" ? "category" : "post_tag"))
            url = `/${item.itemType}/${term.slug}`;
        }
      } else if (item.itemType === "dashboard") {
        const page = getDashboardPage(item.objectId);
        if (
          page &&
          pluginIsEnabled(page.pluginId, plugins) &&
          (!page.capability || viewer.capabilities.includes(page.capability))
        )
          url = await resolveMenuItemUrl(ctx, item.itemType, item.objectId, {
            dashboardBasePath,
            pathOverride: item.pathOverride,
          });
      }
      url = publicHref(url);
      targets.set(key, url);
      return url;
    };
    const inspect = async (
      id: string,
    ): Promise<{ visible: boolean; url?: string; depth: number }> => {
      if (resolved.has(id)) return resolved.get(id)!;
      const hidden = { visible: false, depth: 0 };
      if (visiting.has(id)) return hidden;
      const item = byId.get(id);
      if (!item || item.isOrphaned || !menuItemVisibleFor(item, viewer)) {
        resolved.set(id, hidden);
        return hidden;
      }
      visiting.add(id);
      try {
        let depth = 0;
        if (item.parentItemId) {
          const parent = await inspect(String(item.parentItemId));
          if (!parent.visible || parent.depth >= MAX_DEPTH) {
            resolved.set(id, hidden);
            return hidden;
          }
          depth = parent.depth + 1;
        }
        const isLabel = item.itemType === "heading" || item.itemType === "separator";
        const url = isLabel ? undefined : await targetUrl(item);
        const result = { visible: isLabel || !!url, url, depth };
        resolved.set(id, result);
        return result;
      } finally {
        visiting.delete(id);
      }
    };
    for (const item of allItems) await inspect(String(item._id));
    const nodes = new Map<string, PublicMenuItem>(),
      roots: PublicMenuItem[] = [];
    for (const item of allItems) {
      const result = resolved.get(String(item._id));
      if (!result?.visible) continue;
      nodes.set(String(item._id), {
        _id: String(item._id),
        menuId: String(menu._id),
        itemType: item.itemType,
        label: item.label,
        title: item.title,
        description: item.description,
        url: result.url,
        parentItemId: item.parentItemId ? String(item.parentItemId) : undefined,
        position: item.position,
        depth: result.depth,
        target: item.target,
        cssClasses: item.cssClasses,
        linkRel:
          item.target === "_blank"
            ? [
                ...new Set([
                  ...(item.linkRel ?? "").split(/\s+/).filter(Boolean),
                  "noopener",
                  "noreferrer",
                ]),
              ].join(" ")
            : item.linkRel,
        icon: item.icon,
        badge: item.badge,
        children: [],
      });
    }
    for (const node of nodes.values()) {
      if (node.parentItemId) nodes.get(node.parentItemId)!.children.push(node);
      else roots.push(node);
    }
    return { menu: { _id: menu._id, name: menu.name, slug: menu.slug }, items: roots };
  }
}
export const getMenuForLocation = query({
  args: getMenuForLocationArgs,
  returns: publicMenuResultValidator,
  handler: (ctx, args) => readPublicMenu(ctx, args),
});

// ─── Get Menu Locations (Admin) ─────────────────────────────────────────────

/**
 * Get all theme-registered menu locations with their assigned menu names.
 * Used by the admin locations page (/admin/menus/locations) and
 * the menu editor's location checkboxes.
 */
export const getMenuLocations = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    // ── Fetch all locations ─────────────────────────────────────────────
    // Bounded to 50 locations - themes define a limited number
    const storedLocations = await ctx.db.query("menuLocations").take(50);
    const bySlug = new Map(storedLocations.map((location) => [location.slug, location]));
    const locations = [
      ...DEFAULT_MENU_LOCATIONS.map((location) => ({
        _id: location.slug,
        slug: location.slug,
        name: location.name,
        description: location.description,
        menuId: null,
        createdAt: 0,
        updatedAt: 0,
        ...bySlug.get(location.slug),
      })),
      ...storedLocations.filter(
        (location) =>
          !DEFAULT_MENU_LOCATIONS.some((defaultLocation) => defaultLocation.slug === location.slug),
      ),
    ];

    // ── Resolve menu names ──────────────────────────────────────────────
    const locationsWithMenuName = await Promise.all(
      locations.map(async (location) => {
        let menuName: string | null = null;
        if (location.menuId) {
          const menu = await ctx.db.get("menus", location.menuId);
          menuName = menu?.name ?? null;
        }
        return {
          ...location,
          menuName,
        };
      }),
    );

    return locationsWithMenuName;
  },
});

// ─── Get Linkable Content (Admin Add Items Panel) ───────────────────────────

/**
 * Get content available for adding as menu items.
 * Used by the admin "Add Menu Items" sidebar panels.
 *
 * Supports:
 *   - Pages: published, sorted by menuOrder then title
 *   - Posts: published, sorted by publishedAt desc
 *   - Categories: all, sorted alphabetically
 *   - Tags: all, sorted alphabetically
 *
 * Optional text search on title/name.
 */
export const getLinkableContent = query({
  args: getLinkableContentArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const limit = Math.min(args.limit ?? 20, 100);
    const searchLower = args.search?.trim().toLowerCase();

    if (args.type === "dashboard") {
      // ── Dashboard pages from the registry ─────────────────────────────
      const pluginFlags = await getMergedSettingsSection(ctx, "plugins");
      return DASHBOARD_PAGES.filter(
        (page) =>
          pluginIsEnabled(page.pluginId, pluginFlags) &&
          (!searchLower || page.title.toLowerCase().includes(searchLower)),
      )
        .slice(0, limit)
        .map((page) => ({
          id: page.id,
          title: page.title,
          slug: page.id,
          url: `${DASHBOARD_DEFAULT_BASE}${page.path}`,
          type: "dashboard" as const,
          icon: page.icon,
          group: page.group,
          pluginId: page.pluginId,
          description: page.description,
        }));
    }

    if (args.type === "page" || args.type === "post") {
      // ── Pages / Posts ─────────────────────────────────────────────────
      // Bounded to 5000 published items for menu linking
      const contentType = args.type as "post" | "page";
      const posts = await ctx.db
        .query("posts")
        .withIndex("by_type_status", (q) =>
          q.eq("type", contentType).eq("status", "publish"),
        )
        .take(5000);

      // Filter by search
      let filtered = posts;
      if (searchLower) {
        filtered = posts.filter((p) =>
          p.title.toLowerCase().includes(searchLower),
        );
      }

      // Sort
      if (args.type === "page") {
        filtered.sort((a, b) => {
          const orderA = a.menuOrder ?? 0;
          const orderB = b.menuOrder ?? 0;
          if (orderA !== orderB) return orderA - orderB;
          return a.title.localeCompare(b.title);
        });
      } else {
        filtered.sort(
          (a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0),
        );
      }

      return filtered.slice(0, limit).map((p) => ({
        id: p._id.toString(),
        label: p.title,
        type: args.type,
        url:
          args.type === "page"
            ? (p.path ?? `/${p.slug}`)
            : `/blog/${p.slug}`,
      }));
    }

    if (args.type === "category" || args.type === "tag") {
      // ── Categories / Tags ─────────────────────────────────────────────
      // Bounded to 2000 terms for menu linking
      const taxonomy = args.type === "category" ? "category" : "post_tag";
      const terms = await ctx.db
        .query("terms")
        .withIndex("by_taxonomy", (q) => q.eq("taxonomy", taxonomy))
        .take(2000);

      // Filter by search
      let filtered = terms;
      if (searchLower) {
        filtered = terms.filter((t) =>
          t.name.toLowerCase().includes(searchLower),
        );
      }

      // Sort alphabetically
      filtered.sort((a, b) => a.name.localeCompare(b.name));

      return filtered.slice(0, limit).map((t) => ({
        id: t._id.toString(),
        label: t.name,
        type: args.type,
        url:
          args.type === "category"
            ? `/category/${t.slug}`
            : `/tag/${t.slug}`,
      }));
    }

    return [];
  },
});
