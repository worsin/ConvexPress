import { v } from "convex/values";

import { query } from "../../_generated/server";
import { requireCan } from "../../helpers/permissions";

const METHOD_TABLES = [
  "commerce_shipping_method_flat_rate",
  "commerce_shipping_method_weight_based",
  "commerce_shipping_method_dimensional",
  "commerce_shipping_method_price_based",
  "commerce_shipping_method_quantity_based",
  "commerce_shipping_method_free",
  "commerce_shipping_method_local_pickup",
  "commerce_shipping_method_local_delivery",
  "commerce_shipping_method_table_rate",
] as const;

/**
 * List every method (across all method types) attached to a zone, tagged
 * with its method type so the UI can render per-type editors.
 */
export const listMethodsForZone = query({
  args: { zoneId: v.id("commerce_shipping_zones") },
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.methods.read");
    const all: Array<{ methodType: string; config: any }> = [];
    for (const table of METHOD_TABLES) {
      const rows = await ctx.db
        .query(table as any)
        .withIndex("by_zone_sort", (q: any) => q.eq("zoneId", args.zoneId))
        .collect();
      for (const row of rows) {
        all.push({
          methodType: table.replace("commerce_shipping_method_", ""),
          config: row,
        });
      }
    }
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
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.methods.read");
    const row = await ctx.db.get(args.methodId as any);
    return row ?? null;
  },
});
