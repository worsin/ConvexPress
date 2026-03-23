/**
 * Menu System - Shared Admin Frontend Types
 *
 * Consolidated type definitions used across all menu admin components.
 * Derived from the Convex menuItems schema to avoid triple-definition.
 */

import type { Id } from "@backend/convex/_generated/dataModel";

/** A menu item as returned by the getMenu query (flat list). */
export interface MenuItem {
  _id: Id<"menuItems">;
  menuId: Id<"menus">;
  itemType: "page" | "post" | "category" | "tag" | "custom";
  objectId?: string;
  label: string;
  title?: string;
  description?: string;
  url?: string;
  parentItemId?: Id<"menuItems">;
  position: number;
  depth?: number;
  target?: "_self" | "_blank";
  cssClasses?: string;
  linkRel?: string;
  isOrphaned?: boolean;
}

/** The full menu data shape returned by the getMenu query. */
export interface MenuData {
  _id: Id<"menus">;
  name: string;
  slug: string;
  description?: string;
  autoAddPages?: boolean;
  itemCount?: number;
  items: MenuItem[];
  assignedLocations: string[];
}
