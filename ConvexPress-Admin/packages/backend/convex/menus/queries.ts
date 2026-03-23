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
import { getCurrentUser } from "../helpers/permissions";
import {
  getMenuArgs,
  getMenuItemTreeArgs,
  getMenuForLocationArgs,
  getLinkableContentArgs,
} from "./validators";
import { buildMenuItemTree, resolveMenuItemUrl } from "./internals";

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
export const getMenuForLocation = query({
  args: getMenuForLocationArgs,
  handler: async (ctx, args) => {
    // ── Find location by slug ───────────────────────────────────────────
    const location = await ctx.db
      .query("menuLocations")
      .withIndex("by_slug", (q) => q.eq("slug", args.locationSlug))
      .unique();

    // If no location is registered/assigned yet, provide a safe fallback
    // for the primary website navigation so public pages are still navigable.
    let menuId = location?.menuId ?? null;
    if (!menuId && args.locationSlug === "header") {
      // Bounded to 50 menus - sites rarely have more than 10 menus
      const menus = await ctx.db.query("menus").take(50);
      if (menus.length > 0) {
        const preferred =
          menus.find((m) => m.slug === "main-navigation") ??
          menus.find((m) => m.name.toLowerCase() === "main navigation") ??
          menus[0];
        menuId = preferred?._id ?? null;
      }
    }

    if (!menuId) return null;

    // ── Get the assigned menu ───────────────────────────────────────────
    const menu = await ctx.db.get("menus", menuId);
    if (!menu) return null;

    // ── Get all items, sorted by position ───────────────────────────────
    // Bounded to 500 items max - menus rarely exceed 100 items.
    // This is on the critical path for every page load.
    const allItems = await ctx.db
      .query("menuItems")
      .withIndex("by_menu", (q) => q.eq("menuId", menu._id))
      .take(500);

    allItems.sort((a, b) => a.position - b.position);

    // ── Filter out orphaned items ───────────────────────────────────────
    const activeItems = allItems.filter((item) => item.isOrphaned !== true);

    // ── Resolve current URLs for content-linked items ───────────────────
    const resolvedItems = await Promise.all(
      activeItems.map(async (item) => {
        if (item.itemType !== "custom" && item.objectId) {
          const currentUrl = await resolveMenuItemUrl(
            ctx,
            item.itemType,
            item.objectId,
          );
          return {
            ...item,
            url: currentUrl ?? item.url,
          };
        }
        return item;
      }),
    );

    // ── Build tree ──────────────────────────────────────────────────────
    const tree = buildMenuItemTree(resolvedItems);

    return {
      menu: {
        _id: menu._id,
        name: menu.name,
        slug: menu.slug,
      },
      items: tree,
    };
  },
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
    const locations = await ctx.db.query("menuLocations").take(50);

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
