import { v } from "convex/values";

import { internalQuery } from "../../_generated/server";

export const getOrderById = internalQuery({
  args: { orderId: v.id("commerce_orders") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.orderId);
  },
});

export const getLabelById = internalQuery({
  args: { labelId: v.id("commerce_shipment_labels") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.labelId);
  },
});

/** Look up a label by (orderId, idempotencyKey). */
export const findByIdempotencyKey = internalQuery({
  args: {
    orderId: v.id("commerce_orders"),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("commerce_shipment_labels")
      .withIndex("by_idempotency", (q: any) =>
        q.eq("orderId", args.orderId).eq("idempotencyKey", args.idempotencyKey),
      )
      .first();
  },
});

/**
 * PRD 7.3 — rate reconfirmation helper. Recomputes the fingerprint for the
 * order's current shipping address + cart so the caller can compare it
 * against the fingerprint stored when the quote was chosen. A mismatch
 * indicates the buyer changed address/items since rating — the stored
 * quote is stale and the merchant must re-quote before label purchase.
 */
export const getCurrentQuoteFingerprint = internalQuery({
  args: { orderId: v.id("commerce_orders") },
  handler: async (ctx, args) => {
    const order: any = await ctx.db.get(args.orderId);
    if (!order) return null;
    const items = await ctx.db
      .query("commerce_order_items")
      .withIndex("by_order", (q: any) => q.eq("orderId", args.orderId))
      .collect();

    const { computeAddressFingerprint } = await import(
      "../helpers/addressFingerprint"
    );
    const addressKey = order.shippingAddress
      ? computeAddressFingerprint(order.shippingAddress)
      : null;
    const cartKey = items
      .map(
        (i: any) =>
          `${i.productId}:${i.variantId ?? ""}:${i.quantity}`,
      )
      .sort()
      .join(",");
    return { addressKey, cartKey };
  },
});
