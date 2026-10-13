import { v } from "convex/values";

import { query } from "../../_generated/server";
import { requireCan } from "../../helpers/permissions";

import { listZoneMethods, normalizeMethodId } from "./tables";

import { shippingDocs } from "../../schema/shipping.docs.generated";
/**
 * List every method (across all method types) attached to a zone, tagged
 * with its method type so the UI can render per-type editors.
 */
export const listMethodsForZone = query({
  args: { zoneId: v.id("commerce_shipping_zones") },
  returns: v.array(v.union(v.object({ methodType: v.literal("free"), config: shippingDocs.commerce_shipping_method_free }), v.object({
    methodType: v.literal("flat_rate"),
    config: shippingDocs.commerce_shipping_method_flat_rate,
  }), v.object({
    methodType: v.literal("local_pickup"),
    config: shippingDocs.commerce_shipping_method_local_pickup,
  }), v.object({
    methodType: v.literal("weight_based"),
    config: shippingDocs.commerce_shipping_method_weight_based,
  }), v.object({
    methodType: v.literal("dimensional"),
    config: shippingDocs.commerce_shipping_method_dimensional,
  }), v.object({
    methodType: v.literal("price_based"),
    config: shippingDocs.commerce_shipping_method_price_based,
  }), v.object({
    methodType: v.literal("quantity_based"),
    config: shippingDocs.commerce_shipping_method_quantity_based,
  }), v.object({
    methodType: v.literal("local_delivery"),
    config: shippingDocs.commerce_shipping_method_local_delivery,
  }), v.object({
    methodType: v.literal("table_rate"),
    config: shippingDocs.commerce_shipping_method_table_rate,
  }))),
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.methods.read");
    const all = await listZoneMethods(ctx, args.zoneId);
    return all.sort((a, b) => (a.config.sortOrder ?? 100) - (b.config.sortOrder ?? 100));
  },
});

/**
 * Fetch a single method document. Used by the per-type editor route so
 * it can load the row without paging through the full list.
 */
export const getMethod = query({
  args: {
    methodType: v.union(
      v.literal("flat_rate"),
      v.literal("weight_based"),
      v.literal("dimensional"),
      v.literal("price_based"),
      v.literal("quantity_based"),
      v.literal("free"),
      v.literal("local_pickup"),
      v.literal("local_delivery"),
      v.literal("table_rate"),
    ),
    methodId: v.string(),
  },
  returns: v.union(v.null(), shippingDocs.commerce_shipping_method_flat_rate, shippingDocs.commerce_shipping_method_weight_based, shippingDocs.commerce_shipping_method_dimensional, shippingDocs.commerce_shipping_method_price_based, shippingDocs.commerce_shipping_method_quantity_based, shippingDocs.commerce_shipping_method_free, shippingDocs.commerce_shipping_method_local_pickup, shippingDocs.commerce_shipping_method_local_delivery, shippingDocs.commerce_shipping_method_table_rate),
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.methods.read");
    const id = normalizeMethodId(ctx, args.methodType, args.methodId);
    return id ? await ctx.db.get(id) : null;
  },
});
