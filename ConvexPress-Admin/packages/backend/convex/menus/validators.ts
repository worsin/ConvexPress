/**
 * Menu System - Shared Argument Validators
 *
 * Reusable Convex argument validators for menu mutations and queries.
 * Centralizes validation logic so mutations and queries stay clean.
 *
 * Convention: each exported object is an args shape (Record<string, Validator>)
 * ready to spread into a Convex function's `args` field.
 */

import { v } from "convex/values";
import {
  menuItemTypeValidator,
  menuItemTargetValidator,
} from "../schema/menus";

// ─── Re-exports for convenience ──────────────────────────────────────────────

export { menuItemTypeValidator, menuItemTargetValidator };

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum menu name length in characters. */
export const MAX_NAME_LENGTH = 200;

/** Maximum slug length in characters. */
export const MAX_SLUG_LENGTH = 200;

/** Maximum description length in characters. */
export const MAX_DESCRIPTION_LENGTH = 500;

/** Maximum label length in characters. */
export const MAX_LABEL_LENGTH = 200;

/** Maximum title attribute length in characters. */
export const MAX_TITLE_LENGTH = 200;

/** Maximum CSS classes string length in characters. */
export const MAX_CSS_CLASSES_LENGTH = 500;

/** Maximum link rel string length in characters. */
export const MAX_LINK_REL_LENGTH = 200;

/** Maximum nesting depth for menu items. */
export const MAX_DEPTH = 5;

/** Default menu locations registered by the theme. */
export const DEFAULT_MENU_LOCATIONS = [
  {
    slug: "header",
    name: "Primary Navigation",
    description: "Main site navigation displayed in the header",
  },
  {
    slug: "footer",
    name: "Footer Navigation",
    description: "Navigation links in the site footer",
  },
  {
    slug: "sidebar",
    name: "Sidebar Navigation",
    description: "Navigation menu for sidebar widget areas",
  },
  {
    slug: "mobile",
    name: "Mobile Navigation",
    description:
      "Navigation menu for mobile hamburger menu (defaults to Primary if unset)",
  },
  {
    slug: "social",
    name: "Social Links Menu",
    description: "Social media icon links (detects URLs to render icons)",
  },
] as const;

// ─── Mutation Args ──────────────────────────────────────────────────────────

/**
 * Arguments for creating a new menu.
 */
export const createMenuArgs = {
  name: v.string(),
  slug: v.optional(v.string()),
  description: v.optional(v.string()),
  autoAddPages: v.optional(v.boolean()),
};

/**
 * Arguments for updating an existing menu.
 */
export const updateMenuArgs = {
  menuId: v.id("menus"),
  name: v.optional(v.string()),
  slug: v.optional(v.string()),
  description: v.optional(v.string()),
  autoAddPages: v.optional(v.boolean()),
};

/**
 * Arguments for deleting a menu.
 */
export const deleteMenuArgs = {
  menuId: v.id("menus"),
};

/**
 * Arguments for adding a menu item.
 */
export const addMenuItemArgs = {
  menuId: v.id("menus"),
  itemType: menuItemTypeValidator,
  objectId: v.optional(v.string()),
  label: v.string(),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  url: v.optional(v.string()),
  parentItemId: v.optional(v.id("menuItems")),
  position: v.optional(v.number()),
  target: v.optional(menuItemTargetValidator),
  cssClasses: v.optional(v.string()),
  linkRel: v.optional(v.string()),
};

/**
 * Arguments for updating a menu item's display attributes.
 */
export const updateMenuItemArgs = {
  itemId: v.id("menuItems"),
  label: v.optional(v.string()),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  url: v.optional(v.string()),
  target: v.optional(menuItemTargetValidator),
  cssClasses: v.optional(v.string()),
  linkRel: v.optional(v.string()),
};

/**
 * Arguments for deleting a menu item.
 */
export const deleteMenuItemArgs = {
  itemId: v.id("menuItems"),
};

/**
 * Arguments for reordering menu items (drag-and-drop).
 */
export const reorderMenuItemsArgs = {
  menuId: v.id("menus"),
  items: v.array(
    v.object({
      itemId: v.id("menuItems"),
      parentItemId: v.optional(v.id("menuItems")),
      position: v.number(),
      depth: v.number(),
    }),
  ),
};

/**
 * Arguments for assigning a menu to a location (or unassigning).
 */
export const assignMenuToLocationArgs = {
  locationSlug: v.string(),
  menuId: v.optional(v.id("menus")),
};

// ─── Query Args ─────────────────────────────────────────────────────────────

/**
 * Arguments for getting a single menu with its items.
 */
export const getMenuArgs = {
  menuId: v.id("menus"),
};

/**
 * Arguments for getting a menu item tree.
 */
export const getMenuItemTreeArgs = {
  menuId: v.id("menus"),
};

/**
 * Arguments for getting a menu by location (website rendering).
 */
export const getMenuForLocationArgs = {
  locationSlug: v.string(),
};

/**
 * Arguments for getting linkable content for the add-items panel.
 */
export const getLinkableContentArgs = {
  type: v.union(
    v.literal("page"),
    v.literal("post"),
    v.literal("category"),
    v.literal("tag"),
  ),
  search: v.optional(v.string()),
  limit: v.optional(v.number()),
};
