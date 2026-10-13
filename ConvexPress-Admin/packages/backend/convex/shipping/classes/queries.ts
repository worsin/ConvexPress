import { v } from "convex/values";

import { query } from "../../_generated/server";
import { requireCan } from "../../helpers/permissions";

import { shippingDocs } from "../../schema/shipping.docs.generated";
export const list = query({
  args: {},
  returns: v.array(shippingDocs.commerce_shipping_classes),
  handler: async (ctx) => {
    await requireCan(ctx, "shipping.classes.read");
    const classes = await ctx.db
      .query("commerce_shipping_classes")
      .withIndex("by_sort_order")
      .collect();
    return classes.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name);
    });
  },
});

export const get = query({
  args: { classId: v.id("commerce_shipping_classes") },
  returns: v.union(v.null(), shippingDocs.commerce_shipping_classes),
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.classes.read");
    return ctx.db.get(args.classId);
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  returns: v.union(v.null(), shippingDocs.commerce_shipping_classes),
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.classes.read");
    return ctx.db
      .query("commerce_shipping_classes")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

export const countProductsPerClass = query({
  args: {},
  returns: v.record(v.string(), v.object({ productCount: v.number(), variantCount: v.number() })),
  handler: async (ctx) => {
    await requireCan(ctx, "shipping.classes.read");
    const classes = await ctx.db.query("commerce_shipping_classes").collect();
    const counts: Record<string, { productCount: number; variantCount: number }> = {};
    for (const cls of classes) {
      const products = await ctx.db
        .query("commerce_products")
        .withIndex("by_shipping_class", (q) => q.eq("shippingClassId", cls._id))
        .collect();
      const variants = await ctx.db
        .query("commerce_product_variants")
        .withIndex("by_shipping_class", (q) => q.eq("shippingClassId", cls._id))
        .collect();
      counts[cls._id] = { productCount: products.length, variantCount: variants.length };
    }
    return counts;
  },
});
