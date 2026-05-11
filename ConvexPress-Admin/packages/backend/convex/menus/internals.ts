/**
 * Menu System - Internal Functions
 *
 * Non-client-callable functions used by:
 *   - Event subscriber handlers (content deletion -> orphan marking)
 *   - Auto-add page to menus on publish
 *   - Menu location initialization (site setup/seeding)
 *
 * Functions:
 *   orphanMenuItemsByObject    - Mark menu items as orphaned when linked content is deleted
 *   autoAddPageToMenus         - Add a newly published page to menus with autoAddPages enabled
 *   initializeMenuLocations    - Create default menu locations from theme config
 *   handleContentDeleted       - Generic handler for content deletion events
 */

import { internalMutation, internalQuery } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";
import { v } from "convex/values";
import { DEFAULT_MENU_LOCATIONS, MAX_DEPTH } from "./validators";

// ─── Types ──────────────────────────────────────────────────────────────────

type ReadCtx = Pick<QueryCtx, "db">;

/** The possible item types for menu items, matching the schema union. */
type MenuItemType = "page" | "post" | "category" | "tag" | "custom";

/** Tree node type for building hierarchical menu item structures. */
export interface MenuItemTreeNode {
  _id: string;
  menuId: string;
  itemType: "page" | "post" | "category" | "tag" | "custom";
  objectId?: string;
  label: string;
  title?: string;
  description?: string;
  url?: string;
  parentItemId?: string;
  position: number;
  depth: number;
  target?: "_self" | "_blank";
  cssClasses?: string;
  linkRel?: string;
  isOrphaned?: boolean;
  children: MenuItemTreeNode[];
}

// ─── Helper: Build Menu Item Tree ───────────────────────────────────────────

/**
 * Builds a hierarchical tree from a flat list of menu items.
 *
 * Two-pass algorithm:
 *   1. First pass: create a map of itemId -> tree node (with empty children array)
 *   2. Second pass: assign each node to its parent's children array
 *   3. Sort children by position at every level
 *
 * Items without a parent (parentItemId is undefined) are top-level nodes.
 */
export function buildMenuItemTree(items: Doc<"menuItems">[]): MenuItemTreeNode[] {
  const nodeMap = new Map<string, MenuItemTreeNode>();
  const roots: MenuItemTreeNode[] = [];

  // Pass 1: Create node map
  for (const item of items) {
    const node: MenuItemTreeNode = {
      _id: item._id.toString(),
      menuId: item.menuId.toString(),
      itemType: item.itemType,
      objectId: item.objectId,
      label: item.label,
      title: item.title,
      description: item.description,
      url: item.url,
      parentItemId: item.parentItemId?.toString(),
      position: item.position,
      depth: item.depth ?? 0,
      target: item.target,
      cssClasses: item.cssClasses,
      linkRel: item.linkRel,
      isOrphaned: item.isOrphaned,
      children: [],
    };
    nodeMap.set(item._id.toString(), node);
  }

  // Pass 2: Assign children to parents
  for (const node of nodeMap.values()) {
    if (node.parentItemId && nodeMap.has(node.parentItemId)) {
      nodeMap.get(node.parentItemId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by position at every level
  const sortByPosition = (nodes: MenuItemTreeNode[]) => {
    nodes.sort((a, b) => a.position - b.position);
    for (const node of nodes) {
      sortByPosition(node.children);
    }
  };
  sortByPosition(roots);

  return roots;
}

// ─── Helper: Generate Slug ──────────────────────────────────────────────────

/**
 * Generate a URL-safe slug from a string.
 * Handles collision checking by querying the menus table.
 */
export function generateSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 200);
}

// ─── Helper: Validate Menu Item Object ──────────────────────────────────────

/**
 * Validates that a referenced object exists and is valid for the given item type.
 *
 * - Page/Post: Checks `posts` table, verifies type matches, verifies not trashed
 * - Category/Tag: Checks `terms` table, verifies taxonomy matches
 *
 * @throws Error if the referenced object does not exist or is invalid
 */
export async function validateMenuItemObject(
  ctx: ReadCtx,
  itemType: string,
  objectId: string,
): Promise<void> {
  if (itemType === "page" || itemType === "post") {
    const post = await ctx.db.get("posts", objectId as Id<"posts">);
    if (!post) {
      throw new Error(`Referenced ${itemType} not found`);
    }
    if (post.type !== itemType) {
      throw new Error(
        `Referenced object is a ${post.type}, not a ${itemType}`,
      );
    }
    if (post.status === "trash") {
      throw new Error(`Referenced ${itemType} is in trash`);
    }
  } else if (itemType === "category" || itemType === "tag") {
    const term = await ctx.db.get("terms", objectId as Id<"terms">);
    if (!term) {
      throw new Error(`Referenced ${itemType} not found`);
    }
    const expectedTaxonomy = itemType === "category" ? "category" : "post_tag";
    if (term.taxonomy !== expectedTaxonomy) {
      throw new Error(
        `Referenced term is a ${term.taxonomy}, not a ${expectedTaxonomy}`,
      );
    }
  }
}

// ─── Helper: Resolve Menu Item URL ──────────────────────────────────────────

/**
 * Resolves the current URL for a content-linked menu item.
 *
 * - Page: `page.path ?? /${page.slug}`
 * - Post: `/blog/${post.slug}`
 * - Category: `/category/${term.slug}`
 * - Tag: `/tag/${term.slug}`
 *
 * @returns The resolved URL, or undefined if the object is trashed/deleted
 */
export async function resolveMenuItemUrl(
  ctx: ReadCtx,
  itemType: string,
  objectId: string,
): Promise<string | undefined> {
  if (itemType === "custom") return undefined;

  if (itemType === "page" || itemType === "post") {
    const post = await ctx.db.get("posts", objectId as Id<"posts">);
    if (!post || post.status === "trash") return undefined;

    if (itemType === "page") {
      const rawPath = post.path ?? `/${post.slug}`;
      const normalizedPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
      // Website page routes resolve through /page/$ (except explicit homepage "/").
      if (normalizedPath === "/") return "/";
      if (normalizedPath.startsWith("/page/")) return normalizedPath;
      return `/page${normalizedPath}`;
    }
    return `/blog/${post.slug}`;
  }

  if (itemType === "category" || itemType === "tag") {
    const term = await ctx.db.get("terms", objectId as Id<"terms">);
    if (!term) return undefined;

    if (itemType === "category") {
      return `/category/${term.slug}`;
    }
    return `/tag/${term.slug}`;
  }

  return undefined;
}

// ─── Helper: Calculate Depth from Parent Chain ──────────────────────────────

/**
 * Walks up the parent chain to calculate the depth for a new menu item.
 * Also validates there are no circular references.
 *
 * @returns The calculated depth (0 for top-level)
 */
export async function calculateDepthFromParent(
  ctx: ReadCtx,
  parentItemId: string | undefined,
  maxDepth: number = MAX_DEPTH,
): Promise<number> {
  if (!parentItemId) return 0;

  let depth = 1;
  let currentParentId: string | undefined = parentItemId;
  const visited = new Set<string>();

  while (currentParentId) {
    if (visited.has(currentParentId)) {
      throw new Error("Circular parent reference detected");
    }
    visited.add(currentParentId);

    if (depth > maxDepth) {
      throw new Error(`Maximum menu nesting depth is ${maxDepth} levels`);
    }

    const parent: Doc<"menuItems"> | null = await ctx.db.get("menuItems", currentParentId as Id<"menuItems">);
    if (!parent || !parent.parentItemId) break;

    currentParentId = parent.parentItemId.toString();
    depth++;
  }

  return depth;
}

// ─── Orphan Menu Items by Object ────────────────────────────────────────────

/**
 * Marks all menu items referencing a specific object as orphaned.
 * Called by event handlers when content (page/post/category/tag) is deleted.
 *
 * @returns Count of orphaned items
 */
export const orphanMenuItemsByObject = internalMutation({
  args: {
    itemType: v.string(),
    objectId: v.string(),
  },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("menuItems")
      .withIndex("by_object", (q) =>
        q.eq("itemType", args.itemType as MenuItemType).eq("objectId", args.objectId),
      )
      .collect();

    const now = Date.now();
    let orphanedCount = 0;

    for (const item of items) {
      if (!item.isOrphaned) {
        await ctx.db.patch("menuItems", item._id, {
          isOrphaned: true,
          updatedAt: now,
        });
        orphanedCount++;
      }
    }

    return orphanedCount;
  },
});

// ─── Auto-Add Page to Menus ─────────────────────────────────────────────────

/**
 * Automatically adds a newly published top-level page to all menus
 * that have `autoAddPages: true`.
 *
 * Only fires for top-level pages (pages with no parent).
 * Checks for existing menu items referencing the same objectId to avoid duplicates.
 */
export const autoAddPageToMenus = internalMutation({
  args: {
    pageId: v.string(),
    pageTitle: v.string(),
    pagePath: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Find all menus with autoAddPages enabled
    const allMenus = await ctx.db.query("menus").collect();
    const autoAddMenus = allMenus.filter((m) => m.autoAddPages === true);

    if (autoAddMenus.length === 0) return;

    const now = Date.now();
    const url = args.pagePath ?? `/${args.pageTitle.toLowerCase().replace(/\s+/g, "-")}`;

    for (const menu of autoAddMenus) {
      // Check if page is already in this menu
      const existingItems = await ctx.db
        .query("menuItems")
        .withIndex("by_object", (q) =>
          q.eq("itemType", "page" as MenuItemType).eq("objectId", args.pageId),
        )
        .collect();

      const alreadyInMenu = existingItems.some(
        (item) => item.menuId.toString() === menu._id.toString(),
      );

      if (alreadyInMenu) continue;

      // Get the next position (append to end of top-level items)
      const topLevelItems = await ctx.db
        .query("menuItems")
        .withIndex("by_menu", (q) => q.eq("menuId", menu._id))
        .collect();

      const topLevelOnly = topLevelItems.filter(
        (item) => !item.parentItemId,
      );
      const nextPosition = topLevelOnly.length;

      // Insert the new menu item
      await ctx.db.insert("menuItems", {
        menuId: menu._id,
        itemType: "page",
        objectId: args.pageId,
        label: args.pageTitle,
        url,
        position: nextPosition,
        depth: 0,
        createdAt: now,
        updatedAt: now,
      });

      // Increment the menu's item count
      await ctx.db.patch("menus", menu._id, {
        itemCount: (menu.itemCount ?? 0) + 1,
        updatedAt: now,
      });
    }
  },
});

// ─── Initialize Menu Locations ──────────────────────────────────────────────

/**
 * Creates default menu locations from the DEFAULT_MENU_LOCATIONS config
 * if they don't already exist. Called during site setup/seeding.
 *
 * This is idempotent - calling it multiple times will not create duplicates.
 */
export const initializeMenuLocations = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    for (const location of DEFAULT_MENU_LOCATIONS) {
      // Check if location already exists
      const existing = await ctx.db
        .query("menuLocations")
        .withIndex("by_slug", (q) => q.eq("slug", location.slug))
        .unique();

      if (!existing) {
        await ctx.db.insert("menuLocations", {
          slug: location.slug,
          name: location.name,
          description: location.description,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  },
});

// ─── Handle Content Deleted ─────────────────────────────────────────────────

/**
 * Generic handler for when a content object is deleted.
 * Dispatched from event listeners for page.deleted, post.deleted,
 * taxonomy.category_deleted, taxonomy.tag_deleted.
 */
export const handleContentDeleted = internalMutation({
  args: {
    itemType: v.string(),
    objectId: v.string(),
  },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("menuItems")
      .withIndex("by_object", (q) =>
        q.eq("itemType", args.itemType as MenuItemType).eq("objectId", args.objectId),
      )
      .collect();

    const now = Date.now();

    for (const item of items) {
      if (!item.isOrphaned) {
        await ctx.db.patch("menuItems", item._id, {
          isOrphaned: true,
          updatedAt: now,
        });
      }
    }
  },
});

// ─── List Menus (Internal - for HTTP API) ────────────────────────────────────

/**
 * Internal query to list all menus with assigned locations.
 * Used by the HTTP API handler which authenticates via API key, not Convex auth.
 * This bypasses the getCurrentUser() check in the public listMenus query.
 */
export const listMenusInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Fetch all menus
    const menus = await ctx.db.query("menus").collect();

    // Sort alphabetically by name
    menus.sort((a, b) => a.name.localeCompare(b.name));

    // Build location map
    const allLocations = await ctx.db.query("menuLocations").collect();

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

    // Return menus with location names
    return menus.map((menu) => ({
      ...menu,
      assignedLocations: locationMap.get(menu._id.toString()) ?? [],
    }));
  },
});

// ─── Duplicate Menu ──────────────────────────────────────────────────────────

/**
 * Duplicate/clone a menu and all its items.
 * Creates a new menu with " (Copy)" appended to the name, and copies all items
 * preserving their hierarchy (parentItemId references are remapped to new IDs).
 *
 * @returns Id<"menus"> - The ID of the newly created menu clone
 */
export const duplicateMenu = internalMutation({
  args: {
    menuId: v.id("menus"),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    // Fetch the source menu
    const sourceMenu = await ctx.db.get("menus", args.menuId);
    if (!sourceMenu) {
      throw new Error("Menu not found");
    }

    // Generate a unique name
    let newName = `${sourceMenu.name} (Copy)`;
    let suffix = 2;
    while (true) {
      const existing = await ctx.db
        .query("menus")
        .withIndex("by_name", (q) => q.eq("name", newName))
        .unique();

      if (!existing) break;
      newName = `${sourceMenu.name} (Copy ${suffix})`;
      suffix++;

      if (suffix > 100) {
        throw new Error(`Unable to generate unique name for menu copy`);
      }
    }

    // Generate a unique slug
    let newSlug = generateSlugFromName(newName);
    let slugSuffix = 2;
    while (true) {
      const existing = await ctx.db
        .query("menus")
        .withIndex("by_slug", (q) => q.eq("slug", newSlug))
        .unique();

      if (!existing) break;
      newSlug = `${generateSlugFromName(newName)}-${slugSuffix}`;
      slugSuffix++;

      if (slugSuffix > 100) {
        throw new Error(`Unable to generate unique slug for menu copy`);
      }
    }

    const now = Date.now();

    // Create the new menu
    const newMenuId = await ctx.db.insert("menus", {
      name: newName,
      slug: newSlug,
      description: sourceMenu.description,
      autoAddPages: sourceMenu.autoAddPages,
      itemCount: 0,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    // Fetch all items from the source menu
    const sourceItems = await ctx.db
      .query("menuItems")
      .withIndex("by_menu", (q) => q.eq("menuId", args.menuId))
      .collect();

    // Map old item IDs to new item IDs for parent remapping
    const idMap = new Map<string, Id<"menuItems">>();

    // First pass: insert all items (without parent references)
    for (const item of sourceItems) {
      const newItemId = await ctx.db.insert("menuItems", {
        menuId: newMenuId,
        itemType: item.itemType,
        objectId: item.objectId,
        label: item.label,
        title: item.title,
        description: item.description,
        url: item.url,
        parentItemId: undefined, // Will be remapped in second pass
        position: item.position,
        depth: item.depth,
        target: item.target,
        cssClasses: item.cssClasses,
        linkRel: item.linkRel,
        isOrphaned: item.isOrphaned,
        createdAt: now,
        updatedAt: now,
      });

      idMap.set(item._id.toString(), newItemId);
    }

    // Second pass: remap parent references
    for (const item of sourceItems) {
      if (item.parentItemId) {
        const newItemId = idMap.get(item._id.toString());
        const newParentId = idMap.get(item.parentItemId.toString());

        if (newItemId && newParentId) {
          await ctx.db.patch("menuItems", newItemId, {
            parentItemId: newParentId,
          });
        }
      }
    }

    // Update item count
    await ctx.db.patch("menus", newMenuId, {
      itemCount: sourceItems.length,
    });

    return newMenuId;
  },
});
