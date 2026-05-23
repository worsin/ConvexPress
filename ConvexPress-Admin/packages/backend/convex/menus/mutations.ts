/**
 * Menu System - Mutations
 *
 * All write operations for the menu lifecycle:
 *   createMenu          - Create a new named menu container
 *   updateMenu          - Update menu name, slug, description, or settings
 *   deleteMenu          - Delete a menu and all its items, unassign from locations
 *   addMenuItem         - Add a navigation item to a menu
 *   updateMenuItem      - Update a menu item's display attributes
 *   deleteMenuItem      - Delete a menu item (re-parents children)
 *   reorderMenuItems    - Reorder all items after drag-and-drop
 *   assignMenuToLocation - Assign/unassign a menu to a theme location
 *
 * Authorization:
 *   All mutations require the `menu.{action}` capability, which is
 *   granted only to the Administrator role. This matches WordPress's
 *   `edit_theme_options` capability requirement for menu management.
 *
 * All menu-level mutations emit events via the Event Dispatcher System.
 * Item-level mutations do NOT emit events (too granular).
 */

import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireCan , getUserIdentifier } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { MENU_EVENTS, SYSTEM } from "../events/constants";
import {
  createMenuArgs,
  updateMenuArgs,
  deleteMenuArgs,
  addMenuItemArgs,
  updateMenuItemArgs,
  deleteMenuItemArgs,
  reorderMenuItemsArgs,
  assignMenuToLocationArgs,
  MAX_NAME_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_DEPTH,
  DEFAULT_MENU_LOCATIONS,
} from "./validators";
import {
  generateSlugFromName,
  validateMenuItemObject,
  resolveMenuItemUrl,
  calculateDepthFromParent,
} from "./internals";

// ─── Create Menu ────────────────────────────────────────────────────────────

/**
 * Create a new named menu container.
 *
 * Flow:
 *   1. Authenticate + check menu.create capability
 *   2. Validate name is not empty and unique
 *   3. Generate slug from name if not provided
 *   4. Validate slug uniqueness (with collision handling)
 *   5. Insert menu record
 *   6. Emit menu.created event
 *
 * @returns Id<"menus">
 */
export const createMenu = mutation({
  args: createMenuArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "menu.create");

    // ── Validate name ───────────────────────────────────────────────────
    const trimmedName = args.name.trim();
    if (!trimmedName) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Menu name is required",
      });
    }
    if (trimmedName.length > MAX_NAME_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Menu name must be ${MAX_NAME_LENGTH} characters or fewer`,
      });
    }

    // ── Check name uniqueness ───────────────────────────────────────────
    const existingByName = await ctx.db
      .query("menus")
      .withIndex("by_name", (q) => q.eq("name", trimmedName))
      .unique();

    if (existingByName) {
      throw new ConvexError({
        code: "CONFLICT",
        message: `Menu "${trimmedName}" already exists`,
      });
    }

    // ── Generate and validate slug ──────────────────────────────────────
    let slug = args.slug?.trim() || generateSlugFromName(trimmedName);

    // Handle slug collisions by appending -2, -3, etc.
    let slugCandidate = slug;
    let suffix = 2;
    while (true) {
      const existingBySlug = await ctx.db
        .query("menus")
        .withIndex("by_slug", (q) => q.eq("slug", slugCandidate))
        .unique();

      if (!existingBySlug) {
        slug = slugCandidate;
        break;
      }
      slugCandidate = `${slug}-${suffix}`;
      suffix++;

      if (suffix > 100) {
        throw new ConvexError({
          code: "CONFLICT",
          message: `Unable to generate unique slug for "${trimmedName}"`,
        });
      }
    }

    // ── Insert menu ─────────────────────────────────────────────────────
    const now = Date.now();
    const menuId = await ctx.db.insert("menus", {
      name: trimmedName,
      slug,
      description: args.description?.trim(),
      autoAddPages: args.autoAddPages ?? false,
      itemCount: 0,
      createdBy: getUserIdentifier(user),
      createdAt: now,
      updatedAt: now,
    });

    // ── Emit event ──────────────────────────────────────────────────────
    await emitEvent(ctx, MENU_EVENTS.CREATED, SYSTEM.MENU, {
      menuId,
      name: trimmedName,
    });

    return menuId;
  },
});

// ─── Update Menu ────────────────────────────────────────────────────────────

/**
 * Update a menu's name, slug, description, or settings.
 * Only sends changed fields in the patch.
 *
 * @returns Id<"menus">
 */
export const updateMenu = mutation({
  args: updateMenuArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "menu.update");

    // ── Fetch existing menu ─────────────────────────────────────────────
    const menu = await ctx.db.get("menus", args.menuId);
    if (!menu) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Menu not found",
      });
    }

    const changes: string[] = [];
    const patch: Partial<{
      name: string;
      slug: string;
      description: string | undefined;
      autoAddPages: boolean;
      updatedAt: number;
    }> = {};

    // ── Validate and track name change ──────────────────────────────────
    if (args.name !== undefined) {
      const trimmedName = args.name.trim();
      if (!trimmedName) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Menu name is required",
        });
      }
      if (trimmedName.length > MAX_NAME_LENGTH) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Menu name must be ${MAX_NAME_LENGTH} characters or fewer`,
        });
      }

      if (trimmedName !== menu.name) {
        // Check uniqueness (exclude self)
        const existingByName = await ctx.db
          .query("menus")
          .withIndex("by_name", (q) => q.eq("name", trimmedName))
          .unique();

        if (
          existingByName &&
          existingByName._id.toString() !== args.menuId.toString()
        ) {
          throw new ConvexError({
            code: "CONFLICT",
            message: `Menu "${trimmedName}" already exists`,
          });
        }

        patch.name = trimmedName;
        changes.push("name");
      }
    }

    // ── Validate and track slug change ──────────────────────────────────
    if (args.slug !== undefined) {
      const trimmedSlug = args.slug.trim();
      if (trimmedSlug && trimmedSlug !== menu.slug) {
        const existingBySlug = await ctx.db
          .query("menus")
          .withIndex("by_slug", (q) => q.eq("slug", trimmedSlug))
          .unique();

        if (
          existingBySlug &&
          existingBySlug._id.toString() !== args.menuId.toString()
        ) {
          throw new ConvexError({
            code: "CONFLICT",
            message: `Menu slug "${trimmedSlug}" already exists`,
          });
        }

        patch.slug = trimmedSlug;
        changes.push("slug");
      }
    }

    // ── Track description change ────────────────────────────────────────
    if (args.description !== undefined) {
      const trimmedDesc = args.description.trim();
      if (trimmedDesc !== (menu.description ?? "")) {
        patch.description = trimmedDesc || undefined;
        changes.push("description");
      }
    }

    // ── Track autoAddPages change ───────────────────────────────────────
    if (
      args.autoAddPages !== undefined &&
      args.autoAddPages !== (menu.autoAddPages ?? false)
    ) {
      patch.autoAddPages = args.autoAddPages;
      changes.push("autoAddPages");
    }

    // ── Apply patch if there are changes ────────────────────────────────
    if (changes.length > 0) {
      patch.updatedAt = Date.now();
      await ctx.db.patch("menus", args.menuId, patch);

      // ── Emit event ────────────────────────────────────────────────────
      await emitEvent(ctx, MENU_EVENTS.UPDATED, SYSTEM.MENU, {
        menuId: args.menuId,
        changes,
      });
    }

    return args.menuId;
  },
});

// ─── Delete Menu ────────────────────────────────────────────────────────────

/**
 * Delete a menu and all its items.
 * Also unassigns the menu from all locations.
 *
 * This is a destructive operation - all items are permanently deleted
 * and all location assignments are cleared.
 *
 * @returns Id<"menus">
 */
export const deleteMenu = mutation({
  args: deleteMenuArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "menu.delete");

    // ── Fetch menu ──────────────────────────────────────────────────────
    const menu = await ctx.db.get("menus", args.menuId);
    if (!menu) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Menu not found",
      });
    }

    // ── Delete all menu items ───────────────────────────────────────────
    const items = await ctx.db
      .query("menuItems")
      .withIndex("by_menu", (q) => q.eq("menuId", args.menuId))
      .collect();

    for (const item of items) {
      await ctx.db.delete("menuItems", item._id);
    }

    // ── Unassign from all locations ─────────────────────────────────────
    const locations = await ctx.db
      .query("menuLocations")
      .withIndex("by_menu", (q) => q.eq("menuId", args.menuId))
      .collect();

    for (const location of locations) {
      await ctx.db.patch("menuLocations", location._id, {
        menuId: undefined,
        updatedAt: Date.now(),
      });
    }

    // ── Delete the menu ─────────────────────────────────────────────────
    const menuName = menu.name;
    await ctx.db.delete("menus", args.menuId);

    // ── Emit event ──────────────────────────────────────────────────────
    await emitEvent(ctx, MENU_EVENTS.DELETED, SYSTEM.MENU, {
      menuId: args.menuId,
      name: menuName,
    });

    return args.menuId;
  },
});

// ─── Add Menu Item ──────────────────────────────────────────────────────────

/**
 * Add a navigation item to a menu.
 *
 * Flow:
 *   1. Auth + capability check
 *   2. Validate menu exists
 *   3. Validate item type + required fields (URL for custom, objectId for content)
 *   4. Validate label is not empty
 *   5. Validate parent item belongs to same menu (if specified)
 *   6. Calculate position and depth
 *   7. Enforce max depth of 5
 *   8. Resolve URL for content-linked items
 *   9. Insert menu item
 *   10. Increment menus.itemCount
 *
 * @returns Id<"menuItems">
 */
export const addMenuItem = mutation({
  args: addMenuItemArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "menu.add_item");

    // ── Validate menu exists ────────────────────────────────────────────
    const menu = await ctx.db.get("menus", args.menuId);
    if (!menu) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Menu not found",
      });
    }

    // ── Validate item type requirements ─────────────────────────────────
    if (args.itemType === "custom") {
      if (!args.url || !args.url.trim()) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "URL is required for custom links",
        });
      }
    } else {
      // Content-linked items require objectId
      if (!args.objectId) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Object ID is required for ${args.itemType} menu items`,
        });
      }

      // Validate the referenced object exists
      try {
        await validateMenuItemObject(ctx, args.itemType, args.objectId);
      } catch (error: unknown) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: error instanceof Error ? error.message : `Referenced ${args.itemType} not found`,
        });
      }
    }

    // ── Validate label ──────────────────────────────────────────────────
    const trimmedLabel = args.label.trim();
    if (!trimmedLabel) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Navigation label is required",
      });
    }
    if (trimmedLabel.length > MAX_LABEL_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Navigation label must be ${MAX_LABEL_LENGTH} characters or fewer`,
      });
    }

    // ── Validate parent item ────────────────────────────────────────────
    let parentItemId = args.parentItemId;
    if (parentItemId) {
      const parentItem = await ctx.db.get("menuItems", parentItemId);
      if (!parentItem) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Parent menu item not found",
        });
      }
      if (parentItem.menuId.toString() !== args.menuId.toString()) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Parent menu item belongs to a different menu",
        });
      }
    }

    // ── Calculate depth ─────────────────────────────────────────────────
    let depth: number;
    try {
      depth = await calculateDepthFromParent(
        ctx,
        parentItemId?.toString(),
      );
    } catch (error: unknown) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: error instanceof Error ? error.message : `Maximum menu nesting depth is ${MAX_DEPTH} levels`,
      });
    }

    if (depth > MAX_DEPTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Maximum menu nesting depth is ${MAX_DEPTH} levels`,
      });
    }

    // ── Calculate position ──────────────────────────────────────────────
    let position = args.position;
    if (position === undefined) {
      // Append to end of siblings
      const siblings = await ctx.db
        .query("menuItems")
        .withIndex("by_menu", (q) => q.eq("menuId", args.menuId))
        .collect();

      const filteredSiblings = siblings.filter((item) => {
        const itemParent = item.parentItemId?.toString();
        const argsParent = parentItemId?.toString();
        return itemParent === argsParent;
      });

      position = filteredSiblings.length;
    }

    // ── Resolve URL for content-linked items ────────────────────────────
    let resolvedUrl = args.url?.trim();
    if (args.itemType !== "custom" && args.objectId) {
      const contentUrl = await resolveMenuItemUrl(
        ctx,
        args.itemType,
        args.objectId,
      );
      if (contentUrl) {
        resolvedUrl = contentUrl;
      }
    }

    // ── Insert menu item ────────────────────────────────────────────────
    const now = Date.now();
    const itemId = await ctx.db.insert("menuItems", {
      menuId: args.menuId,
      itemType: args.itemType,
      objectId: args.objectId,
      label: trimmedLabel,
      title: args.title?.trim(),
      description: args.description?.trim(),
      url: resolvedUrl,
      parentItemId,
      position,
      depth,
      target: args.target,
      cssClasses: args.cssClasses?.trim(),
      linkRel: args.linkRel?.trim(),
      createdAt: now,
      updatedAt: now,
    });

    // ── Increment menu item count ───────────────────────────────────────
    await ctx.db.patch("menus", args.menuId, {
      itemCount: (menu.itemCount ?? 0) + 1,
      updatedAt: now,
    });

    return itemId;
  },
});

// ─── Update Menu Item ───────────────────────────────────────────────────────

/**
 * Update a menu item's display attributes (label, title, description, etc.).
 * Position/hierarchy changes use reorderMenuItems.
 *
 * @returns Id<"menuItems">
 */
export const updateMenuItem = mutation({
  args: updateMenuItemArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "menu.update_item");

    // ── Fetch item ──────────────────────────────────────────────────────
    const item = await ctx.db.get("menuItems", args.itemId);
    if (!item) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Menu item not found",
      });
    }

    const patch: Partial<{
      label: string;
      title: string;
      description: string;
      url: string;
      target: "_self" | "_blank";
      cssClasses: string;
      linkRel: string;
      updatedAt: number;
    }> = {};

    // ── Validate label ──────────────────────────────────────────────────
    if (args.label !== undefined) {
      const trimmedLabel = args.label.trim();
      if (!trimmedLabel) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Navigation label is required",
        });
      }
      if (trimmedLabel.length > MAX_LABEL_LENGTH) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Navigation label must be ${MAX_LABEL_LENGTH} characters or fewer`,
        });
      }
      patch.label = trimmedLabel;
    }

    // ── Validate URL for custom items ───────────────────────────────────
    if (args.url !== undefined && item.itemType === "custom") {
      if (!args.url.trim()) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "URL is required for custom links",
        });
      }
      patch.url = args.url.trim();
    } else if (args.url !== undefined) {
      patch.url = args.url.trim();
    }

    // ── Optional display attributes ─────────────────────────────────────
    if (args.title !== undefined) patch.title = args.title.trim();
    if (args.description !== undefined)
      patch.description = args.description.trim();
    if (args.target !== undefined) patch.target = args.target;
    if (args.cssClasses !== undefined) patch.cssClasses = args.cssClasses.trim();
    if (args.linkRel !== undefined) patch.linkRel = args.linkRel.trim();

    // ── Apply patch ─────────────────────────────────────────────────────
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = Date.now();
      await ctx.db.patch("menuItems", args.itemId, patch);
    }

    return args.itemId;
  },
});

// ─── Delete Menu Item ───────────────────────────────────────────────────────

/**
 * Delete a menu item. Children are re-parented to the deleted item's parent
 * (or made top-level if the deleted item was top-level). This preserves the
 * menu structure below the deleted item.
 *
 * After deletion, siblings are re-sequenced to close the position gap.
 *
 * @returns Id<"menuItems">
 */
export const deleteMenuItem = mutation({
  args: deleteMenuItemArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "menu.delete_item");

    // ── Fetch item ──────────────────────────────────────────────────────
    const item = await ctx.db.get("menuItems", args.itemId);
    if (!item) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Menu item not found",
      });
    }

    const now = Date.now();

    // ── Re-parent children ──────────────────────────────────────────────
    const children = await ctx.db
      .query("menuItems")
      .withIndex("by_parent_item", (q) => q.eq("parentItemId", args.itemId))
      .collect();

    for (const child of children) {
      const newDepth = Math.max(0, (child.depth ?? 0) - 1);
      await ctx.db.patch("menuItems", child._id, {
        parentItemId: item.parentItemId, // May be undefined (top-level)
        depth: newDepth,
        updatedAt: now,
      });
    }

    // ── Delete the item ─────────────────────────────────────────────────
    const menuId = item.menuId;
    const deletedParentItemId = item.parentItemId;
    await ctx.db.delete("menuItems", args.itemId);

    // ── Re-sequence siblings to close the gap ───────────────────────────
    const allMenuItems = await ctx.db
      .query("menuItems")
      .withIndex("by_menu", (q) => q.eq("menuId", menuId))
      .collect();

    const siblings = allMenuItems.filter((i) => {
      const iParent = i.parentItemId?.toString();
      const deletedParent = deletedParentItemId?.toString();
      return iParent === deletedParent;
    });

    // Sort by current position and reassign 0..N
    siblings.sort((a, b) => a.position - b.position);
    for (let i = 0; i < siblings.length; i++) {
      if (siblings[i].position !== i) {
        await ctx.db.patch("menuItems", siblings[i]._id, {
          position: i,
          updatedAt: now,
        });
      }
    }

    // ── Decrement menu item count ───────────────────────────────────────
    const menu = await ctx.db.get("menus", menuId);
    if (menu) {
      await ctx.db.patch("menus", menuId, {
        itemCount: Math.max(0, (menu.itemCount ?? 0) - 1),
        updatedAt: now,
      });
    }

    return args.itemId;
  },
});

// ─── Reorder Menu Items ─────────────────────────────────────────────────────

/**
 * Reorder all items in a menu after a drag-and-drop operation.
 * The client sends the complete new tree structure (parentItemId, position, depth
 * for every item). This mutation applies the new structure atomically.
 *
 * Only send the final state on dragEnd (debounce during drag).
 *
 * @returns true
 */
export const reorderMenuItems = mutation({
  args: reorderMenuItemsArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "menu.reorder");

    // ── Validate menu exists ────────────────────────────────────────────
    const menu = await ctx.db.get("menus", args.menuId);
    if (!menu) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Menu not found",
      });
    }

    // ── Validate all items belong to this menu ──────────────────────────
    const now = Date.now();

    for (const itemUpdate of args.items) {
      const item = await ctx.db.get("menuItems", itemUpdate.itemId);
      if (!item) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: `Menu item ${itemUpdate.itemId} not found`,
        });
      }
      if (item.menuId.toString() !== args.menuId.toString()) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Menu item ${itemUpdate.itemId} does not belong to this menu`,
        });
      }

      // Validate max depth
      if (itemUpdate.depth > MAX_DEPTH) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Maximum menu nesting depth is ${MAX_DEPTH} levels`,
        });
      }
    }

    // ── Apply new positions ─────────────────────────────────────────────
    for (const itemUpdate of args.items) {
      await ctx.db.patch("menuItems", itemUpdate.itemId, {
        parentItemId: itemUpdate.parentItemId,
        position: itemUpdate.position,
        depth: itemUpdate.depth,
        updatedAt: now,
      });
    }

    return true;
  },
});

// ─── Assign Menu to Location ────────────────────────────────────────────────

/**
 * Assign a menu to a theme location, or unassign (pass menuId as undefined).
 *
 * A single menu can be assigned to multiple locations.
 * Each location can have at most one menu.
 *
 * @returns Id<"menuLocations">
 */
export const assignMenuToLocation = mutation({
  args: assignMenuToLocationArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "menu.assign_location");

    // ── Find location by slug ───────────────────────────────────────────
    let location = await ctx.db
      .query("menuLocations")
      .withIndex("by_slug", (q) => q.eq("slug", args.locationSlug))
      .unique();

    if (!location) {
      const defaultLocation = DEFAULT_MENU_LOCATIONS.find(
        (entry) => entry.slug === args.locationSlug,
      );
      if (!defaultLocation) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: `Menu location "${args.locationSlug}" not found`,
        });
      }
      const now = Date.now();
      const locationId = await ctx.db.insert("menuLocations", {
        slug: defaultLocation.slug,
        name: defaultLocation.name,
        description: defaultLocation.description,
        createdAt: now,
        updatedAt: now,
      });
      location = (await ctx.db.get(locationId))!;
    }

    // ── Validate menu exists if assigning ────────────────────────────────
    if (args.menuId) {
      const menu = await ctx.db.get("menus", args.menuId);
      if (!menu) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Menu not found",
        });
      }
    }

    // ── Update location assignment ──────────────────────────────────────
    const now = Date.now();
    await ctx.db.patch("menuLocations", location._id, {
      menuId: args.menuId, // undefined = unassign
      updatedAt: now,
    });

    // ── Emit event ──────────────────────────────────────────────────────
    await emitEvent(ctx, "menu.location_assigned", SYSTEM.MENU, {
      menuId: args.menuId,
      location: args.locationSlug,
    });

    return location._id;
  },
});

// ─── Duplicate Menu ──────────────────────────────────────────────────────────

/**
 * Duplicate/clone a menu and all its items.
 * Creates a new menu with " (Copy)" appended to the name.
 * All items are copied, preserving hierarchy.
 *
 * @returns Id<"menus"> - The new menu ID
 */
export const duplicateMenu = mutation({
  args: {
    menuId: v.id("menus"),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "menu.create");

    // Validate source menu exists
    const sourceMenu = await ctx.db.get("menus", args.menuId);
    if (!sourceMenu) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Menu not found",
      });
    }

    // Delegate to internal mutation which handles the full clone logic
    await ctx.scheduler.runAfter(
      0,
      internal.menus.internals.duplicateMenu,
      {
        menuId: args.menuId,
        createdBy: getUserIdentifier(user),
      },
    );

    // Emit event for the clone
    await emitEvent(ctx, MENU_EVENTS.CREATED, SYSTEM.MENU, {
      menuId: args.menuId, // Reference to source
      name: `${sourceMenu.name} (Copy)`,
    });

    return args.menuId;
  },
});
