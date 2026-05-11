/**
 * @deprecated 2026-05-11 — Legacy in-admin Theme/Template Builder.
 *
 * STATUS:  Frozen. Hidden from active nav. Do NOT extend or fix issues here.
 * REASON:  A pre-built section enum + preset theme picker limits what each
 *          site can look like. Replaced by AI-generated React components,
 *          one per route, generated per site by the design:* skill kit.
 * REPLACEMENT:  See ConvexPress-Website/design-kit/README.md
 * REMOVAL:  Safe to delete once at least one site is fully shipped via the
 *           skill kit and nothing else references this file.
 */
/**
 * Layout System - Mutations
 *
 * Write operations for layout configurations:
 *   create    — Creates a new layout
 *   update    — Patches an existing layout
 *   duplicate — Copies a layout as a "custom" type with "(Copy)" suffix
 *   remove    — Deletes a layout (preset layouts cannot be deleted)
 */

import { ConvexError } from "convex/values";
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { createArgs, updateArgs } from "./validators";

/**
 * Create a new layout.
 *
 * @auth settings.update_general capability required
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const create = mutation({
  args: createArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "settings.update_general");

    // Check for duplicate slug
    const existing = await ctx.db
      .query("layouts")
      .withIndex("by_slug", (q: ConvexQueryBuilder) => q.eq("slug", args.slug))
      .first();

    if (existing) {
      throw new ConvexError({
        code: "DUPLICATE_SLUG",
        message: `A layout with slug "${args.slug}" already exists`,
      });
    }

    const now = Date.now();
    const layoutId = await ctx.db.insert("layouts", {
      ...args,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    return layoutId;
  },
});

/**
 * Update an existing layout (patch semantics).
 *
 * @auth settings.update_general capability required
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const update = mutation({
  args: updateArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCan(ctx, "settings.update_general");

    const layout = await ctx.db.get(args.id);
    if (!layout) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Layout not found",
      });
    }

    // If slug is being changed, check for duplicates
    if (args.slug && args.slug !== layout.slug) {
      const existing = await ctx.db
        .query("layouts")
        .withIndex("by_slug", (q: ConvexQueryBuilder) => q.eq("slug", args.slug))
        .first();

      if (existing) {
        throw new ConvexError({
          code: "DUPLICATE_SLUG",
          message: `A layout with slug "${args.slug}" already exists`,
        });
      }
    }

    const { id, ...updates } = args;
    const patch: Record<string, any> = { updatedAt: Date.now() };

    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.slug !== undefined) patch.slug = updates.slug;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.config !== undefined) patch.config = updates.config;
    if (updates.isDefault !== undefined) patch.isDefault = updates.isDefault;

    await ctx.db.patch(id, patch);
  },
});

/**
 * Duplicate a layout as a new "custom" layout with "(Copy)" suffix.
 *
 * @auth settings.update_general capability required
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const duplicate = mutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { id: v.id("layouts") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "settings.update_general");

    const source = await ctx.db.get(args.id);
    if (!source) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Layout not found",
      });
    }

    // Generate unique slug
    let copySlug = `${source.slug}-copy`;
    let counter = 1;
    while (
      await ctx.db
        .query("layouts")
        .withIndex("by_slug", (q: ConvexQueryBuilder) => q.eq("slug", copySlug))
        .first()
    ) {
      counter++;
      copySlug = `${source.slug}-copy-${counter}`;
    }

    const now = Date.now();
    const newId = await ctx.db.insert("layouts", {
      name: `${source.name} (Copy)`,
      slug: copySlug,
      description: source.description,
      type: "custom",
      config: source.config,
      isDefault: false,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    return newId;
  },
});

/**
 * Delete a layout. Preset layouts cannot be deleted.
 *
 * @auth settings.update_general capability required
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const remove = mutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { id: v.id("layouts") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCan(ctx, "settings.update_general");

    const layout = await ctx.db.get(args.id);
    if (!layout) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Layout not found",
      });
    }

    if (layout.type === "preset") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Preset layouts cannot be deleted",
      });
    }

    await ctx.db.delete(args.id);
  },
});
