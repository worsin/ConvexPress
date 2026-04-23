/**
 * Commerce Tax Classes — managed-class CRUD (Wave 11.1).
 *
 * Replaces free-form `taxClass` strings with a managed list so product
 * editors pick from a Select (not a text input) and mistyped strings
 * can't silently fall to the default rate.
 *
 * Classes are referenced by `code` from `commerce_tax_rules.taxClass`,
 * `commerce_products.taxClass`, and `commerce_product_variants.taxClass`.
 */

import { ConvexError, v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const list = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    return await ctx.db.query("commerce_tax_classes").collect();
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getByCode = query({
  args: { code: v.string() },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    return await ctx.db
      .query("commerce_tax_classes")
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
    isDefault: v.optional(v.boolean()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCan(ctx, "commerce.tax.manage");
    const existing = await ctx.db
      .query("commerce_tax_classes")
      .withIndex("by_code", (q: any) => q.eq("code", args.code))
      .unique();
    if (existing) {
      throw new ConvexError({
        code: "DUPLICATE_CODE",
        message: `A tax class with code "${args.code}" already exists.`,
      });
    }
    const now = Date.now();

    // If this is the new default, clear `isDefault` on any existing default.
    if (args.isDefault) {
      const current = await ctx.db
        .query("commerce_tax_classes")
        .withIndex("by_default", (q: any) => q.eq("isDefault", true))
        .collect();
      for (const row of current) {
        await ctx.db.patch(row._id, { isDefault: false, updatedAt: now });
      }
    }

    return await ctx.db.insert("commerce_tax_classes", {
      code: args.code,
      label: args.label,
      description: args.description,
      isDefault: args.isDefault ?? false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const update = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    id: v.id("commerce_tax_classes"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    label: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    description: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    isDefault: v.optional(v.boolean()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCan(ctx, "commerce.tax.manage");
    const row = await ctx.db.get(args.id);
    if (!row) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Tax class not found.",
      });
    }
    const now = Date.now();

    if (args.isDefault === true && !row.isDefault) {
      const current = await ctx.db
        .query("commerce_tax_classes")
        .withIndex("by_default", (q: any) => q.eq("isDefault", true))
        .collect();
      for (const r of current) {
        await ctx.db.patch(r._id, { isDefault: false, updatedAt: now });
      }
    }

    const patch: Record<string, unknown> = { updatedAt: now };
    if (args.label !== undefined) patch.label = args.label;
    if (args.description !== undefined) patch.description = args.description;
    if (args.isDefault !== undefined) patch.isDefault = args.isDefault;
    await ctx.db.patch(args.id, patch);
    return { success: true };
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const remove = mutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { id: v.id("commerce_tax_classes") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCan(ctx, "commerce.tax.manage");
    const row = await ctx.db.get(args.id);
    if (!row) return { success: true };
    if (row.isDefault) {
      throw new ConvexError({
        code: "CANNOT_DELETE_DEFAULT",
        message: "Cannot delete the default tax class. Set another class as default first.",
      });
    }
    await ctx.db.delete(args.id);
    return { success: true };
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const seedDefaults = mutation({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    await requireCan(ctx, "commerce.tax.manage");
    const existing = await ctx.db.query("commerce_tax_classes").collect();
    if (existing.length > 0) {
      return { seeded: false, reason: "already_seeded" } as const;
    }
    const now = Date.now();
    const defaults = [
      { code: "standard", label: "Standard", isDefault: true },
      { code: "reduced-rate", label: "Reduced Rate (food, books, etc.)", isDefault: false },
      { code: "zero-rate", label: "Zero Rate", isDefault: false },
    ];
    for (const d of defaults) {
      await ctx.db.insert("commerce_tax_classes", {
        code: d.code,
        label: d.label,
        isDefault: d.isDefault,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { seeded: true, count: defaults.length } as const;
  },
});
