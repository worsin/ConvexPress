/**
 * Commerce Discount — internal helpers callable from Node actions.
 *
 * Convex Node actions cannot touch the database directly; they must
 * call a query/mutation. These two helpers back the Stripe-mirror
 * action in `discountStripeMirror.ts`.
 */

import { v } from "convex/values";

import { internalMutation, internalQuery } from "../_generated/server";

import { tableDocs } from "../schema/tableDocs.generated";
export const getById = internalQuery({
  args: { discountId: v.id("commerce_discount_codes") },
  returns: v.union(v.null(), tableDocs.commerce_discount_codes),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.discountId);
  },
});

export const recordStripeMirror = internalMutation({
  args: {
    discountId: v.id("commerce_discount_codes"),
    stripeCouponId: v.optional(v.string()),
    stripePromotionCodeId: v.optional(v.string()),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.stripeCouponId !== undefined)
      patch.stripeCouponId = args.stripeCouponId;
    if (args.stripePromotionCodeId !== undefined)
      patch.stripePromotionCodeId = args.stripePromotionCodeId;
    await ctx.db.patch("commerce_discount_codes", args.discountId, patch);
    return { success: true };
  },
});
