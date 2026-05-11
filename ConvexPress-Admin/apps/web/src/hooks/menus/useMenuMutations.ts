/**
 * Menu System - Mutation Hooks
 *
 * Dedicated hooks for menu write operations. Wraps Convex useMutation calls
 * with proper typing for use across menu admin components.
 */

import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";

/**
 * Create a new named menu container.
 */
export function useCreateMenu() {
  return useMutation(api.menus.mutations.createMenu);
}

/**
 * Update a menu's name, slug, description, or settings.
 */
export function useUpdateMenu() {
  return useMutation(api.menus.mutations.updateMenu);
}

/**
 * Delete a menu and all its items, unassign from locations.
 */
export function useDeleteMenu() {
  return useMutation(api.menus.mutations.deleteMenu);
}

/**
 * Add a navigation item to a menu.
 */
export function useAddMenuItem() {
  return useMutation(api.menus.mutations.addMenuItem);
}

/**
 * Update a menu item's display attributes.
 */
export function useUpdateMenuItem() {
  return useMutation(api.menus.mutations.updateMenuItem);
}

/**
 * Delete a menu item (re-parents children).
 */
export function useDeleteMenuItem() {
  return useMutation(api.menus.mutations.deleteMenuItem);
}

/**
 * Reorder all items after drag-and-drop.
 */
export function useReorderMenuItems() {
  return useMutation(api.menus.mutations.reorderMenuItems);
}

/**
 * Assign a menu to a theme location (or unassign).
 */
export function useAssignMenuToLocation() {
  return useMutation(api.menus.mutations.assignMenuToLocation);
}

/**
 * Duplicate/clone a menu and all its items.
 */
export function useDuplicateMenu() {
  return useMutation(api.menus.mutations.duplicateMenu);
}
