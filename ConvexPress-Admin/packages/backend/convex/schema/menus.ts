/**
 * Menu System - Schema
 *
 * Three tables implementing WordPress's Navigation Menus feature:
 *   - `menus` - Named menu containers (WordPress equivalent: nav_menu taxonomy terms)
 *   - `menuItems` - Individual navigation items within menus (WordPress equivalent: nav_menu_item post type)
 *   - `menuLocations` - Theme-registered locations and their assigned menus
 *
 * Unlike WordPress, which overloads the taxonomy and post systems to store menus,
 * ConvexPress uses three dedicated Convex tables with proper typing and indexes.
 *
 * Key design decisions:
 *   - Menu items support 5 link types: page, post, category, tag, custom
 *   - Hierarchy via self-referencing `parentItemId` (max 5 levels)
 *   - `objectId` is a string because it can reference posts or terms tables
 *   - `itemCount` on menus is denormalized for fast admin list display
 *   - Menu locations are database records (not config-only) to support real-time assignment
 *   - `isOrphaned` marks items whose linked content has been deleted (not cascade-deleted)
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Shared Validators (used by schema and functions) ───────────────────────

export const menuItemTypeValidator = v.union(
  v.literal("page"),
  v.literal("post"),
  v.literal("category"),
  v.literal("tag"),
  v.literal("custom"),
);

export const menuItemTargetValidator = v.union(
  v.literal("_self"),
  v.literal("_blank"),
);

// ─── Tables ─────────────────────────────────────────────────────────────────

export const menuTables = {
  /**
   * Menu containers. Each menu is a named, ordered collection of navigation items.
   *
   * Indexes support:
   *   - Slug-based uniqueness checks and lookups
   *   - Name-based uniqueness checks and alphabetical listing
   */
  menus: defineTable({
    // === Identity ===
    name: v.string(), // Menu name (e.g., "Main Navigation", "Footer Links")
    slug: v.string(), // URL-safe identifier, auto-generated from name
    description: v.optional(v.string()), // Optional description for admin reference

    // === Settings ===
    autoAddPages: v.optional(v.boolean()), // Auto-add new top-level pages (default false)

    // === Cache ===
    itemCount: v.optional(v.number()), // Cached count of menu items (for admin list)

    // === Authorship ===
    createdBy: v.string(), // User identifier of creator

    // === Timestamps ===
    createdAt: v.number(),
    updatedAt: v.number(),

    // === WordPress Import Fields ===
    wpTermId: v.optional(v.number()), // Original WordPress nav_menu term ID
    wpSourceSiteId: v.optional(v.id("wordpressSites")), // Source WordPress site
  })
    .index("by_slug", ["slug"])
    .index("by_name", ["name"]),

  /**
   * Individual navigation items within menus. Supports hierarchical nesting
   * via self-referencing `parentItemId`.
   *
   * Indexes support:
   *   - Get all items for a menu (admin editor, website rendering)
   *   - Get items sorted by position within a menu
   *   - Get siblings (items with same parent in same menu)
   *   - Find items referencing a specific content object (orphan marking)
   *   - Find children of a specific item (re-parenting on delete)
   */
  menuItems: defineTable({
    // === Relationship ===
    menuId: v.id("menus"), // Parent menu

    // === Item Type ===
    itemType: menuItemTypeValidator,

    // === Object Reference (for content-linked items) ===
    objectId: v.optional(v.string()), // ID of the linked object (post ID, term ID)
    // String because it could be Id<"posts"> or Id<"terms">
    // Null/undefined for custom links

    // === Display ===
    label: v.string(), // Navigation label (displayed text)
    title: v.optional(v.string()), // Title attribute (hover tooltip)
    description: v.optional(v.string()), // Optional description text
    url: v.optional(v.string()), // Explicit URL (required for custom links, computed for content links)

    // === Hierarchy ===
    parentItemId: v.optional(v.id("menuItems")), // Parent menu item (undefined = top-level)
    position: v.number(), // Sort order within siblings (0-indexed)
    depth: v.optional(v.number()), // Nesting depth (0 = top-level, 1 = child, etc.)

    // === Attributes ===
    target: v.optional(menuItemTargetValidator),
    cssClasses: v.optional(v.string()), // Space-separated CSS class names
    linkRel: v.optional(v.string()), // Link relationship (rel attribute, e.g., "nofollow")

    // === Status ===
    isOrphaned: v.optional(v.boolean()), // True if the linked object has been deleted

    // === Timestamps ===
    createdAt: v.number(),
    updatedAt: v.number(),

    // === WordPress Import Fields ===
    wpPostId: v.optional(v.number()), // Original WordPress nav_menu_item post ID
    wpSourceSiteId: v.optional(v.id("wordpressSites")), // Source WordPress site
  })
    .index("by_menu", ["menuId"])
    .index("by_menu_position", ["menuId", "position"])
    .index("by_menu_parent", ["menuId", "parentItemId"])
    .index("by_object", ["itemType", "objectId"])
    .index("by_parent_item", ["parentItemId"]),

  /**
   * Theme-registered menu locations and their assigned menus.
   * Each location can have at most one menu. A menu can be at multiple locations.
   *
   * Indexes support:
   *   - Slug-based lookup (website rendering: "get menu for header")
   *   - Find all locations assigned to a specific menu (cascading unassign on delete)
   */
  menuLocations: defineTable({
    // === Identity ===
    slug: v.string(), // Location identifier (e.g., "header", "footer", "sidebar")
    name: v.string(), // Human-readable name (e.g., "Primary Navigation")
    description: v.optional(v.string()), // Description for admin reference

    // === Assignment ===
    menuId: v.optional(v.id("menus")), // Currently assigned menu (undefined = no menu)

    // === Timestamps ===
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_menu", ["menuId"]),
};
