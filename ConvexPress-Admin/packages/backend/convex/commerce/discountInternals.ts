/**
 * Commerce Discount — internal helpers callable from Node actions.
 *
 * Convex Node actions cannot touch the database directly; they must
 * call a query/mutation. These two helpers back the Stripe-mirror
 * action in `discountStripeMirror.ts`.
 */

import { v } from "convex/values";

import { internalMutation, internalQuery } from "../_generated/server";

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getById = internalQuery({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { discountId: v.id("commerce_discount_codes") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    return await ctx.db.get(args.discountId);
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const recordStripeMirror = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    discountId: v.id("commerce_discount_codes"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    stripeCouponId: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    stripePromotionCodeId: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.stripeCouponId !== undefined)
      patch.stripeCouponId = args.stripeCouponId;
    if (args.stripePromotionCodeId !== undefined)
      patch.stripePromotionCodeId = args.stripePromotionCodeId;
    await ctx.db.patch(args.discountId, patch);
    return { success: true };
  },
});
