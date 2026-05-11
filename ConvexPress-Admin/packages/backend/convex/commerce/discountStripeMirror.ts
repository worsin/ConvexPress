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

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveServiceKey } from "../helpers/serviceKeys";

/**
 * Translate a ConvexPress discount to a Stripe Coupon create payload.
 * Exported for unit tests.
 */
export function buildStripeCouponPayload(discount: {
  discountType: string;
  amount: number;
  code?: string;
  description?: string;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
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
    return null as unknown as Record<string, unknown>;
  }
  payload.duration = "once";
  return payload;
}

async function getStripeSecretKey(ctx: any): Promise<string | undefined> {
  const settings = await ctx.runQuery(
    internal.settings.httpInternals.getBySectionInternal,
    { section: "commerce.payments" },
  );
  const values = (settings?.values ?? settings) as
    | Record<string, unknown>
    | null
    | undefined;
  return resolveServiceKey(values, "stripeSecretKey", "STRIPE_SECRET_KEY");
}

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const mirrorDiscountToStripe = internalAction({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    discountId: v.id("commerce_discount_codes"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args): Promise<{
    success: boolean;
    stripeCouponId?: string;
    stripePromotionCodeId?: string;
    reason?: string;
  }> => {
    const discount: any = await ctx.runQuery(
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

      let stripeCouponId = discount.stripeCouponId as string | undefined;
      if (!stripeCouponId) {
        const created = await stripe.coupons.create(
          payload as any,
          { idempotencyKey: `cp_coupon_${String(args.discountId)}` },
        );
        stripeCouponId = created.id;
      }

      let stripePromotionCodeId = discount.stripePromotionCodeId as
        | string
        | undefined;
      if (!stripePromotionCodeId && stripeCouponId && discount.code) {
        const promo = await stripe.promotionCodes.create(
          {
            coupon: stripeCouponId,
            code: discount.code,
            active: discount.status === "active",
          } as any,
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
    } catch (err: any) {
      console.error(
        `[discountStripeMirror] mirror failed for ${args.discountId}:`,
        err?.message ?? err,
      );
      return { success: false, reason: err?.code ?? err?.type ?? "stripe_error" };
    }
  },
});
