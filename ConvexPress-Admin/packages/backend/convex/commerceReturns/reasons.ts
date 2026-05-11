/**
 * Commerce Returns — reason taxonomy CRUD (Wave 11.3).
 *
 * Managed list of return reasons (defective, wrong_item, changed_mind, …)
 * with per-reason flags for photo requirement + restock eligibility.
 */

import { ConvexError, v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const list = query({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { activeOnly: v.optional(v.boolean()) },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const q = ctx.db.query("commerce_return_reasons");
    const rows = args.activeOnly
      ? await q
          .withIndex("by_active", (idx: any) => idx.eq("isActive", true))
          .collect()
      : await q.collect();
    return rows.sort(
      (a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getByCode = query({
  args: { code: v.string() },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    return await ctx.db
      .query("commerce_return_reasons")
      .withIndex("by_code", (q: any) => q.eq("code", args.code))
      .unique();
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const create = mutation({
  args: {
    code: v.string(),
    label: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    description: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    requiresPhoto: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    requiresRestock: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    sortOrder: v.optional(v.number()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCan(ctx, "commerce.returns.manage");
    const existing = await ctx.db
      .query("commerce_return_reasons")
      .withIndex("by_code", (q: any) => q.eq("code", args.code))
      .unique();
    if (existing) {
      throw new ConvexError({
        code: "DUPLICATE_CODE",
        message: `Return reason with code "${args.code}" already exists.`,
      });
    }
    const now = Date.now();
    return await ctx.db.insert("commerce_return_reasons", {
      code: args.code,
      label: args.label,
      description: args.description,
      requiresPhoto: args.requiresPhoto,
      requiresRestock: args.requiresRestock,
      sortOrder: args.sortOrder,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const update = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    id: v.id("commerce_return_reasons"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    label: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    description: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    requiresPhoto: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    requiresRestock: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    sortOrder: v.optional(v.number()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    isActive: v.optional(v.boolean()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCan(ctx, "commerce.returns.manage");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.label !== undefined) patch.label = args.label;
    if (args.description !== undefined) patch.description = args.description;
    if (args.requiresPhoto !== undefined)
      patch.requiresPhoto = args.requiresPhoto;
    if (args.requiresRestock !== undefined)
      patch.requiresRestock = args.requiresRestock;
    if (args.sortOrder !== undefined) patch.sortOrder = args.sortOrder;
    if (args.isActive !== undefined) patch.isActive = args.isActive;
    await ctx.db.patch(args.id, patch);
    return { success: true };
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const remove = mutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { id: v.id("commerce_return_reasons") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCan(ctx, "commerce.returns.manage");
    await ctx.db.delete(args.id);
    return { success: true };
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const seedDefaults = mutation({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    await requireCan(ctx, "commerce.returns.manage");
    const existing = await ctx.db.query("commerce_return_reasons").collect();
    if (existing.length > 0) {
      return { seeded: false, reason: "already_seeded" } as const;
    }
    const now = Date.now();
    const defaults: Array<{
      code: string;
      label: string;
      requiresPhoto?: boolean;
      requiresRestock?: boolean;
      sortOrder: number;
    }> = [
      { code: "defective", label: "Defective or damaged", requiresPhoto: true, requiresRestock: false, sortOrder: 10 },
      { code: "wrong_item", label: "Wrong item received", requiresPhoto: true, requiresRestock: true, sortOrder: 20 },
      { code: "changed_mind", label: "Changed my mind", requiresPhoto: false, requiresRestock: true, sortOrder: 30 },
      { code: "not_as_described", label: "Not as described", requiresPhoto: true, requiresRestock: true, sortOrder: 40 },
      { code: "quality", label: "Quality issue", requiresPhoto: true, requiresRestock: false, sortOrder: 50 },
      { code: "other", label: "Other", requiresPhoto: false, requiresRestock: false, sortOrder: 99 },
    ];
    for (const d of defaults) {
      await ctx.db.insert("commerce_return_reasons", {
        code: d.code,
        label: d.label,
        requiresPhoto: d.requiresPhoto,
        requiresRestock: d.requiresRestock,
        sortOrder: d.sortOrder,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { seeded: true, count: defaults.length } as const;
  },
});
