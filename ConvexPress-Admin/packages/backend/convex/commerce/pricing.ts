import { ConvexError, v } from "convex/values";

import { mutation, query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireCan } from "../helpers/permissions";

import { commerceDocs } from "../schema/commerce.docs.generated";
const priceStatus = v.union(v.literal("draft"), v.literal("active"), v.literal("inactive"));

export const listPriceLists = query({
  args: { status: v.optional(priceStatus) },
  returns: v.array(commerceDocs.commerce_price_lists),
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const status = args.status;
    if (status) {
      return await ctx.db
        .query("commerce_price_lists")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
    }
    return await ctx.db.query("commerce_price_lists").collect();
  },
});

export const createPriceList = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    status: priceStatus,
    type: v.union(v.literal("sale"), v.literal("override")),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  returns: v.id("commerce_price_lists"),
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const now = Date.now();
    return await ctx.db.insert("commerce_price_lists", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const upsertPriceSet = mutation({
  args: {
    priceSetId: v.optional(v.id("commerce_price_sets")),
    title: v.optional(v.string()),
    productId: v.optional(v.id("commerce_products")),
    variantId: v.optional(v.id("commerce_product_variants")),
    metadata: v.optional(v.any()),
  },
  returns: v.id("commerce_price_sets"),
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const now = Date.now();
    if (args.priceSetId) {
      const set = await ctx.db.get(args.priceSetId);
      if (!set) throw new ConvexError({ code: "NOT_FOUND", message: "Price set not found." });
      await ctx.db.patch("commerce_price_sets", args.priceSetId, {
        title: args.title,
        productId: args.productId,
        variantId: args.variantId,
        metadata: args.metadata,
        updatedAt: now,
      });
      return args.priceSetId;
    }
    return await ctx.db.insert("commerce_price_sets", {
      title: args.title,
      productId: args.productId,
      variantId: args.variantId,
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listPricesForProduct = query({
  args: {
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
  },
  returns: v.array(v.object({
    ...commerceDocs.commerce_price_sets.fields,
    prices: v.array(commerceDocs.commerce_prices),
  })),
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const variantId = args.variantId;
    const sets = variantId
      ? await ctx.db
          .query("commerce_price_sets")
          .withIndex("by_variant", (q) => q.eq("variantId", variantId))
          .collect()
      : await ctx.db
          .query("commerce_price_sets")
          .withIndex("by_product", (q) => q.eq("productId", args.productId))
          .collect();

    const rows: Array<Doc<"commerce_price_sets"> & { prices: Doc<"commerce_prices">[] }> = [];
    for (const set of sets) {
      const prices = await ctx.db
        .query("commerce_prices")
        .withIndex("by_price_set", (q) => q.eq("priceSetId", set._id))
        .collect();
      rows.push({ ...set, prices });
    }
    return rows;
  },
});

export const upsertPrice = mutation({
  args: {
    priceId: v.optional(v.id("commerce_prices")),
    priceSetId: v.id("commerce_price_sets"),
    priceListId: v.optional(v.id("commerce_price_lists")),
    currencyCode: v.string(),
    amount: v.number(),
    minQuantity: v.optional(v.number()),
    maxQuantity: v.optional(v.number()),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    status: priceStatus,
    metadata: v.optional(v.any()),
  },
  returns: v.id("commerce_prices"),
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const now = Date.now();
    const patch = {
      priceSetId: args.priceSetId,
      priceListId: args.priceListId,
      currencyCode: args.currencyCode.toUpperCase(),
      amount: args.amount,
      minQuantity: args.minQuantity,
      maxQuantity: args.maxQuantity,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      status: args.status,
      metadata: args.metadata,
      updatedAt: now,
    };
    if (args.priceId) {
      const price = await ctx.db.get(args.priceId);
      if (!price) throw new ConvexError({ code: "NOT_FOUND", message: "Price not found." });
      await ctx.db.patch("commerce_prices", args.priceId, patch);
      return args.priceId;
    }
    return await ctx.db.insert("commerce_prices", { ...patch, createdAt: now });
  },
});

export const setPriceRules = mutation({
  args: {
    priceId: v.id("commerce_prices"),
    rules: v.array(
      v.object({
        attribute: v.string(),
        operator: v.union(
          v.literal("eq"),
          v.literal("neq"),
          v.literal("in"),
          v.literal("not_in"),
          v.literal("gte"),
          v.literal("lte"),
        ),
        value: v.any(),
        priority: v.number(),
      }),
    ),
  },
  returns: v.array(v.id("commerce_price_rules")),
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const existing = await ctx.db
      .query("commerce_price_rules")
      .withIndex("by_price", (q) => q.eq("priceId", args.priceId))
      .collect();
    for (const rule of existing) await ctx.db.delete("commerce_price_rules", rule._id);
    const now = Date.now();
    const ids: Id<"commerce_price_rules">[] = [];
    for (const rule of args.rules) {
      ids.push(
        await ctx.db.insert("commerce_price_rules", {
          priceId: args.priceId,
          ...rule,
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    return ids;
  },
});
