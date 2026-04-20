import { v } from "convex/values";

import { internalQuery } from "../../_generated/server";
import { resolveShippingClassId } from "../helpers/classResolution";

/**
 * Resolve the effective shippingClassId for a single cart line.
 * Consumed by PRD A7 Rate Calculation Pipeline.
 */
export const resolveForCartLine = internalQuery({
  args: {
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
  },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    const variant = args.variantId ? await ctx.db.get(args.variantId) : null;
    return resolveShippingClassId(product as any, variant as any);
  },
});

/**
 * Resolve the effective class for a batch of cart items. Returns a map
 * keyed by "<productId>:<variantId ?? ''>" to reduce round-trips.
 */
export const resolveBatch = internalQuery({
  args: {
    lines: v.array(
      v.object({
        productId: v.id("commerce_products"),
        variantId: v.optional(v.id("commerce_product_variants")),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const result: Record<string, string | null> = {};
    for (const line of args.lines) {
      const key = `${line.productId}:${line.variantId ?? ""}`;
      const product = await ctx.db.get(line.productId);
      const variant = line.variantId ? await ctx.db.get(line.variantId) : null;
      result[key] = resolveShippingClassId(product as any, variant as any);
    }
    return result;
  },
});
