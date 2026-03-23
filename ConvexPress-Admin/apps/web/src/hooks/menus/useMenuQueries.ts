/**
 * Menu System - Query Hooks
 *
 * Dedicated hooks for menu data fetching. Wraps Convex useQuery calls
 * with proper typing for use across menu admin components.
 */

import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";

/**
 * Fetch all menus with assigned location names.
 * Used by the admin menu list page (/admin/menus).
 */
export function useMenus() {
  return useQuery(api.menus.queries.listMenus);
}

/**
 * Fetch a single menu with all its items and assigned locations.
 * Used by the admin menu editor page (/admin/menus/$menuId/edit).
 */
export function useMenu(menuId: Id<"menus">) {
  return useQuery(api.menus.queries.getMenu, { menuId });
}

/**
 * Fetch all theme-registered menu locations with assigned menu names.
 * Used by the admin locations page and the menu editor's location checkboxes.
 */
export function useMenuLocations() {
  return useQuery(api.menus.queries.getMenuLocations);
}

/**
 * Fetch linkable content (pages, posts, categories, tags) for the add-items panel.
 * Supports search filtering and limit.
 */
export function useLinkableContent(
  type: "page" | "post" | "category" | "tag",
  options?: { search?: string; limit?: number },
) {
  return useQuery(api.menus.queries.getLinkableContent, {
    type,
    search: options?.search,
    limit: options?.limit,
  });
}

/**
 * Fetch a menu for a specific location (public, for website rendering).
 * Returns null if no menu is assigned to the location.
 */
export function useMenuForLocation(locationSlug: string) {
  return useQuery(api.menus.queries.getMenuForLocation, { locationSlug });
}
