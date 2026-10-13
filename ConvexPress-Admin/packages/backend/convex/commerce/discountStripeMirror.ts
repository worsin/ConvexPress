"use node";
/**
 * Commerce Discount — Stripe coupon/promotion_code mirror (Wave 12.3).
 *
 * When an admin creates or updates a discount code, this Node action
 * upserts a matching Stripe Coupon + Promotion Code so hosted Stripe
 * checkout sessions (e.g. subscription direct-signup, payment links)
 * accept the same code. The resulting Stripe IDs are persisted on the
 * ConvexPress discount record for later read / delete.
 *
 * Stripe SDK call is wrapped in a try/catch — the action never blocks
 * the primary mutation; on failure we log + store a null ID so the
 * admin can see which rows drifted.
 */

import { v } from "convex/values";

import type Stripe from "stripe";
import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveServiceKeyAsync } from "../helpers/serviceKeys";
import { stripeErrorReason } from "./taxStripe";

/**
 * Translate a ConvexPress discount to a Stripe Coupon create payload.
 * Exported for unit tests.
 */
export function buildStripeCouponPayload(discount: {
  discountType: string;
  amount: number;
  code?: string;
  description?: string;
}): Stripe.CouponCreateParams | null {
  const payload: Stripe.CouponCreateParams = {
    name: discount.description ?? discount.code,
  };
  if (discount.discountType === "percent") {
    payload.percent_off = Math.max(0, Math.min(100, discount.amount));
  } else if (
    discount.discountType === "fixed_cart" ||
    discount.discountType === "fixed_product"
  ) {
    payload.amount_off = Math.max(0, Math.round(discount.amount));
    // Stripe requires a currency for amount_off; default USD, admin can
    // change via Stripe dashboard.
    payload.currency = "usd";
  } else if (discount.discountType === "free_shipping") {
    // Stripe Coupon has no native free-shipping type; skip mirroring.
    // Caller checks for `null` payload and no-ops.
    return null;
  }
  payload.duration = "once";
  return payload;
}

async function getStripeSecretKey(ctx: ActionCtx): Promise<string | undefined> {
  const settings = await ctx.runQuery(internal.commerce.settingsInternals.getPaymentSettings, {});
  return await resolveServiceKeyAsync(settings, "stripeSecretKey", "STRIPE_SECRET_KEY");
}

export const mirrorDiscountToStripe = internalAction({
  args: {
    discountId: v.id("commerce_discount_codes"),
  },
  returns: v.object({
    success: v.boolean(),
    stripeCouponId: v.optional(v.string()),
    stripePromotionCodeId: v.optional(v.string()),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{
    success: boolean;
    stripeCouponId?: string;
    stripePromotionCodeId?: string;
    reason?: string;
  }> => {
    const discount = await ctx.runQuery(
      internal.commerce.discountInternals.getById,
      { discountId: args.discountId },
    );
    if (!discount) {
      return { success: false, reason: "not_found" };
    }
    const payload = buildStripeCouponPayload(discount);
    if (!payload) {
      return { success: false, reason: "free_shipping_not_mirrorable" };
    }

    const stripeKey = await getStripeSecretKey(ctx);
    if (!stripeKey) {
      return { success: false, reason: "stripe_not_configured" };
    }

    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(stripeKey);

      let stripeCouponId = discount.stripeCouponId;
      if (!stripeCouponId) {
        const created = await stripe.coupons.create(
          payload,
          { idempotencyKey: `cp_coupon_${String(args.discountId)}` },
        );
        stripeCouponId = created.id;
      }

      let stripePromotionCodeId = discount.stripePromotionCodeId;
      if (!stripePromotionCodeId && stripeCouponId && discount.code) {
        // Promotion codes reference their coupon through `promotion` in the pinned API.
        const promo = await stripe.promotionCodes.create(
          {
            promotion: { type: "coupon", coupon: stripeCouponId },
            code: discount.code,
            active: discount.status === "active",
          },
          { idempotencyKey: `cp_promo_${String(args.discountId)}` },
        );
        stripePromotionCodeId = promo.id;
      }

      await ctx.runMutation(
        internal.commerce.discountInternals.recordStripeMirror,
        {
          discountId: args.discountId,
          stripeCouponId,
          stripePromotionCodeId,
        },
      );

      return {
        success: true,
        stripeCouponId,
        stripePromotionCodeId,
      };
    } catch (err) {
      console.error(
        `[discountStripeMirror] mirror failed for ${args.discountId}:`,
        err instanceof Error ? err.message : err,
      );
      return { success: false, reason: stripeErrorReason(err) };
    }
  },
});
