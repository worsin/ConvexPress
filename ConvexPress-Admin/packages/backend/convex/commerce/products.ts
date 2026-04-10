// @ts-nocheck
// ============================================
// ADVANCED PRODUCT FEATURES — Option types, option values,
// product variants, bulk actions, archive / restore
// Ported from VexCart products.ts, adapted to ConvexPress patterns
// (commerce_products, commerce_product_variants schema)
// ============================================

import { ConvexError, v } from "convex/values";

import {
  query,
  mutation,
  internalMutation,
} from "../_generated/server";
import { getCurrentUser, requireCan } from "../helpers/permissions";
import { requireCommerceEnabled } from "./helpers";

// ============================================
// OPTION TYPE CRUD
// ============================================

/**
 * List option types (e.g. Color, Size) for a product.
 * Stored as JSON in the product's metadata; we model them in-memory.
 * ConvexPress stores option types as an optional field on the product row.
 * We treat `optionTypes` as v.optional(v.any()) on commerce_products.
 */
export const listOptionTypes = query({
  args: { productId: v.id("commerce_products") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });
    return (product as any).optionTypes ?? [];
  },
});

/**
 * Create an option type on a product.
 * Example: { name: "Color", values: ["Red", "Blue"] }
 */
export const createOptionType = mutation({
  args: {
    productId: v.id("commerce_products"),
    name: v.string(),
    values: v.array(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    const existing: any[] = (product as any).optionTypes ?? [];
    if (existing.some((o: any) => o.name.toLowerCase() === args.name.toLowerCase())) {
      throw new ConvexError({ code: "duplicate", message: `Option type "${args.name}" already exists` });
    }

    const optionType = {
      id: `opt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: args.name,
      values: args.values.map((val: string, idx: number) => ({
        id: `val_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 8)}`,
        label: val,
        sortOrder: idx,
      })),
      sortOrder: existing.length,
      createdAt: Date.now(),
    };

    await ctx.db.patch(args.productId, {
      optionTypes: [...existing, optionType],
      updatedAt: Date.now(),
    });

    return optionType;
  },
});

/**
 * Update an option type (rename or reorder).
 */
export const updateOptionType = mutation({
  args: {
    productId: v.id("commerce_products"),
    optionTypeId: v.string(),
    name: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    const optionTypes: any[] = [...((product as any).optionTypes ?? [])];
    const idx = optionTypes.findIndex((o: any) => o.id === args.optionTypeId);
    if (idx === -1) throw new ConvexError({ code: "not_found", message: "Option type not found" });

    if (args.name !== undefined) optionTypes[idx].name = args.name;
    if (args.sortOrder !== undefined) optionTypes[idx].sortOrder = args.sortOrder;

    await ctx.db.patch(args.productId, { optionTypes, updatedAt: Date.now() });
    return optionTypes[idx];
  },
});

/**
 * Delete an option type from a product.
 */
export const deleteOptionType = mutation({
  args: {
    productId: v.id("commerce_products"),
    optionTypeId: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    const optionTypes: any[] = ((product as any).optionTypes ?? []).filter(
      (o: any) => o.id !== args.optionTypeId,
    );

    await ctx.db.patch(args.productId, { optionTypes, updatedAt: Date.now() });
    return { success: true };
  },
});

// ============================================
// OPTION VALUE CRUD
// ============================================

/**
 * Add an option value to an existing option type.
 */
export const createOptionValue = mutation({
  args: {
    productId: v.id("commerce_products"),
    optionTypeId: v.string(),
    label: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    const optionTypes: any[] = [...((product as any).optionTypes ?? [])];
    const typeIdx = optionTypes.findIndex((o: any) => o.id === args.optionTypeId);
    if (typeIdx === -1) throw new ConvexError({ code: "not_found", message: "Option type not found" });

    const existing = optionTypes[typeIdx].values ?? [];
    if (existing.some((v: any) => v.label.toLowerCase() === args.label.toLowerCase())) {
      throw new ConvexError({ code: "duplicate", message: `Value "${args.label}" already exists` });
    }

    const newValue = {
      id: `val_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      label: args.label,
      sortOrder: existing.length,
    };

    optionTypes[typeIdx] = {
      ...optionTypes[typeIdx],
      values: [...existing, newValue],
    };

    await ctx.db.patch(args.productId, { optionTypes, updatedAt: Date.now() });
    return newValue;
  },
});

/**
 * Update an option value label.
 */
export const updateOptionValue = mutation({
  args: {
    productId: v.id("commerce_products"),
    optionTypeId: v.string(),
    valueId: v.string(),
    label: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    const optionTypes: any[] = [...((product as any).optionTypes ?? [])];
    const typeIdx = optionTypes.findIndex((o: any) => o.id === args.optionTypeId);
    if (typeIdx === -1) throw new ConvexError({ code: "not_found", message: "Option type not found" });

    const values = [...(optionTypes[typeIdx].values ?? [])];
    const valIdx = values.findIndex((v: any) => v.id === args.valueId);
    if (valIdx === -1) throw new ConvexError({ code: "not_found", message: "Option value not found" });

    if (args.label !== undefined) values[valIdx].label = args.label;
    if (args.sortOrder !== undefined) values[valIdx].sortOrder = args.sortOrder;

    optionTypes[typeIdx] = { ...optionTypes[typeIdx], values };
    await ctx.db.patch(args.productId, { optionTypes, updatedAt: Date.now() });
    return values[valIdx];
  },
});

/**
 * Delete an option value.
 */
export const deleteOptionValue = mutation({
  args: {
    productId: v.id("commerce_products"),
    optionTypeId: v.string(),
    valueId: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    const optionTypes: any[] = [...((product as any).optionTypes ?? [])];
    const typeIdx = optionTypes.findIndex((o: any) => o.id === args.optionTypeId);
    if (typeIdx === -1) throw new ConvexError({ code: "not_found", message: "Option type not found" });

    optionTypes[typeIdx] = {
      ...optionTypes[typeIdx],
      values: (optionTypes[typeIdx].values ?? []).filter((v: any) => v.id !== args.valueId),
    };

    await ctx.db.patch(args.productId, { optionTypes, updatedAt: Date.now() });
    return { success: true };
  },
});

// ============================================
// VARIANT CRUD
// ============================================

/**
 * List variants for a product.
 */
export const listVariants = query({
  args: { productId: v.id("commerce_products") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    return ctx.db
      .query("commerce_product_variants")
      .withIndex("by_product", (q: any) => q.eq("productId", args.productId))
      .collect();
  },
});

/**
 * Create a single product variant.
 */
export const createVariant = mutation({
  args: {
    productId: v.id("commerce_products"),
    title: v.string(),
    sku: v.optional(v.string()),
    optionSummary: v.string(),
    priceAmount: v.number(),
    priceCurrency: v.optional(v.string()),
    salePriceAmount: v.optional(v.number()),
    stockQuantity: v.optional(v.number()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    const now = Date.now();
    const currency = args.priceCurrency ?? product.basePrice?.currencyCode ?? "USD";

    // If isDefault, unset other defaults
    if (args.isDefault) {
      const existing = await ctx.db
        .query("commerce_product_variants")
        .withIndex("by_product", (q: any) => q.eq("productId", args.productId))
        .collect();
      for (const v of existing) {
        if (v.isDefault) {
          await ctx.db.patch(v._id, { isDefault: false, updatedAt: now });
        }
      }
    }

    const variantId = await ctx.db.insert("commerce_product_variants", {
      productId: args.productId,
      title: args.title,
      sku: args.sku,
      optionSummary: args.optionSummary,
      price: { amount: args.priceAmount, currencyCode: currency },
      salePrice: args.salePriceAmount
        ? { amount: args.salePriceAmount, currencyCode: currency }
        : undefined,
      stockQuantity: args.stockQuantity,
      isDefault: args.isDefault ?? false,
      createdAt: now,
      updatedAt: now,
    });

    // Mark product as variable type with variants
    if (product.productType !== "variable") {
      await ctx.db.patch(args.productId, {
        productType: "variable",
        updatedAt: now,
      });
    }

    return variantId;
  },
});

/**
 * Update an existing variant.
 */
export const updateVariant = mutation({
  args: {
    variantId: v.id("commerce_product_variants"),
    title: v.optional(v.string()),
    sku: v.optional(v.string()),
    optionSummary: v.optional(v.string()),
    priceAmount: v.optional(v.number()),
    salePriceAmount: v.optional(v.number()),
    stockQuantity: v.optional(v.number()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const variant = await ctx.db.get(args.variantId);
    if (!variant) throw new ConvexError({ code: "not_found", message: "Variant not found" });

    const now = Date.now();
    const updates: any = { updatedAt: now };

    if (args.title !== undefined) updates.title = args.title;
    if (args.sku !== undefined) updates.sku = args.sku;
    if (args.optionSummary !== undefined) updates.optionSummary = args.optionSummary;
    if (args.priceAmount !== undefined) {
      updates.price = { amount: args.priceAmount, currencyCode: variant.price.currencyCode };
    }
    if (args.salePriceAmount !== undefined) {
      updates.salePrice = args.salePriceAmount
        ? { amount: args.salePriceAmount, currencyCode: variant.price.currencyCode }
        : undefined;
    }
    if (args.stockQuantity !== undefined) updates.stockQuantity = args.stockQuantity;

    // If setting as default, unset others
    if (args.isDefault) {
      const siblings = await ctx.db
        .query("commerce_product_variants")
        .withIndex("by_product", (q: any) => q.eq("productId", variant.productId))
        .collect();
      for (const s of siblings) {
        if (s._id !== args.variantId && s.isDefault) {
          await ctx.db.patch(s._id, { isDefault: false, updatedAt: now });
        }
      }
      updates.isDefault = true;
    } else if (args.isDefault === false) {
      updates.isDefault = false;
    }

    await ctx.db.patch(args.variantId, updates);
    return args.variantId;
  },
});

/**
 * Delete a variant.
 */
export const deleteVariant = mutation({
  args: { variantId: v.id("commerce_product_variants") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const variant = await ctx.db.get(args.variantId);
    if (!variant) throw new ConvexError({ code: "not_found", message: "Variant not found" });

    await ctx.db.delete(args.variantId);

    // Check if any variants remain; if not, revert product type
    const remaining = await ctx.db
      .query("commerce_product_variants")
      .withIndex("by_product", (q: any) => q.eq("productId", variant.productId))
      .collect();

    if (remaining.length === 0) {
      await ctx.db.patch(variant.productId, {
        productType: "simple",
        updatedAt: Date.now(),
      });
    }

    return { success: true };
  },
});

/**
 * Generate all variant combinations from the product's option types.
 * Creates missing variants only (skips existing option combos).
 */
export const generateVariants = mutation({
  args: {
    productId: v.id("commerce_products"),
    basePriceAmount: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    const optionTypes: any[] = (product as any).optionTypes ?? [];
    if (optionTypes.length === 0) {
      throw new ConvexError({ code: "no_options", message: "No option types defined" });
    }

    // Build cartesian product of all option values
    function cartesian(arrays: any[][]): any[][] {
      return arrays.reduce(
        (acc: any[][], arr: any[]) =>
          acc.flatMap((combo: any[]) => arr.map((item: any) => [...combo, item])),
        [[]] as any[][],
      );
    }

    const valueArrays = optionTypes
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((ot: any) => (ot.values ?? []).map((val: any) => ({ typeName: ot.name, ...val })));

    if (valueArrays.some((a: any[]) => a.length === 0)) {
      throw new ConvexError({ code: "empty_values", message: "One or more option types have no values" });
    }

    const combos = cartesian(valueArrays);

    // Get existing variants
    const existing = await ctx.db
      .query("commerce_product_variants")
      .withIndex("by_product", (q: any) => q.eq("productId", args.productId))
      .collect();

    const existingSummaries = new Set(existing.map((v: any) => v.optionSummary));

    const currency = product.basePrice?.currencyCode ?? "USD";
    const basePrice = args.basePriceAmount ?? product.basePrice?.amount ?? 0;
    const now = Date.now();
    let created = 0;

    for (const combo of combos) {
      const summary = combo.map((c: any) => `${c.typeName}: ${c.label}`).join(" / ");
      if (existingSummaries.has(summary)) continue;

      await ctx.db.insert("commerce_product_variants", {
        productId: args.productId,
        title: combo.map((c: any) => c.label).join(" / "),
        optionSummary: summary,
        price: { amount: basePrice, currencyCode: currency },
        isDefault: created === 0 && existing.length === 0,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }

    // Update product type if we created variants
    if (created > 0 && product.productType !== "variable") {
      await ctx.db.patch(args.productId, { productType: "variable", updatedAt: now });
    }

    return { created, total: combos.length };
  },
});

// ============================================
// BULK ACTIONS
// ============================================

/**
 * Bulk update product status.
 */
export const bulkUpdateStatus = mutation({
  args: {
    productIds: v.array(v.id("commerce_products")),
    status: v.union(
      v.literal("draft"),
      v.literal("publish"),
      v.literal("private"),
      v.literal("trash"),
    ),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const now = Date.now();
    let updated = 0;

    for (const id of args.productIds) {
      const product = await ctx.db.get(id);
      if (!product) continue;

      const patch: any = { status: args.status, updatedAt: now };
      if (args.status === "publish" && product.status !== "publish") {
        patch.publishedAt = now;
      }

      await ctx.db.patch(id, patch);
      updated++;
    }

    return { updated };
  },
});

/**
 * Bulk delete products (permanent).
 */
export const bulkDelete = mutation({
  args: {
    productIds: v.array(v.id("commerce_products")),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    let deleted = 0;
    const errors: string[] = [];

    for (const id of args.productIds) {
      try {
        const product = await ctx.db.get(id);
        if (!product) continue;

        // Delete variants
        const variants = await ctx.db
          .query("commerce_product_variants")
          .withIndex("by_product", (q: any) => q.eq("productId", id))
          .collect();
        for (const v of variants) {
          await ctx.db.delete(v._id);
        }

        await ctx.db.delete(id);
        deleted++;
      } catch (e: any) {
        errors.push(`${id}: ${e?.message ?? "Unknown error"}`);
      }
    }

    return { deleted, errors };
  },
});

/**
 * Archive a product (set status to trash).
 */
export const archiveProduct = mutation({
  args: { productId: v.id("commerce_products") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    await ctx.db.patch(args.productId, {
      status: "trash",
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Restore a trashed product (set status to draft).
 */
export const restoreProduct = mutation({
  args: { productId: v.id("commerce_products") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    if (product.status !== "trash") {
      throw new ConvexError({ code: "invalid_status", message: "Product is not in trash" });
    }

    await ctx.db.patch(args.productId, {
      status: "draft",
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
