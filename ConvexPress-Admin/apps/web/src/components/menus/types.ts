/**
 * Menu System - Shared Admin Frontend Types
 *
 * Consolidated type definitions used across all menu admin components.
 * Derived from the Convex menuItems schema to avoid triple-definition.
 */

import type { Id } from "@backend/convex/_generated/dataModel";

/** Every item type the menu schema accepts (see schema/menus.ts). */
export type MenuItemType =
  | "page"
  | "post"
  | "category"
  | "tag"
  | "custom"
  /** Customer dashboard page from the dashboard registry (objectId = page id). */
  | "dashboard"
  /** Non-link section label. */
  | "heading"
  /** Visual divider. */
  | "separator";

export type MenuVisibility = "everyone" | "signedIn" | "signedOut";

/** A menu item as returned by the getMenu query (flat list). */
export interface MenuItem {
  _id: Id<"menuItems">;
  menuId: Id<"menus">;
  itemType: MenuItemType;
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
  /** Lucide icon name (kebab-case). */
  icon?: string;
  /** Live counter source, one of the dashboard registry's BADGE_SOURCES. */
  badge?: string;
  /** Dashboard items only: replaces the configured dashboard base path. */
  pathOverride?: string;
  visibility?: MenuVisibility;
  /** Website role slugs allowed to see the item. */
  roles?: string[];
  /** Membership plan slugs allowed to see the item. */
  membershipPlans?: string[];
  /** Website capability the viewer must hold. */
  capability?: string;
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

/** A row from menus.queries.getLinkableContent({ type: "dashboard" }). */
export interface LinkableDashboardPage {
  id: string;
  title: string;
  slug: string;
  url: string;
  type: "dashboard";
  icon: string;
  group: string;
  pluginId: string;
  description: string;
}
