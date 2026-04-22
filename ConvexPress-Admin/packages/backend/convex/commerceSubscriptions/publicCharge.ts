"use node";
/**
 * Public-facing wrapper around the internal `beginSubscriptionFirstCharge`
 * action. The website calls this from the signup form after
 * `createCheckoutIntent` has returned a checkout intent id. It creates the
 * Stripe Customer + PaymentIntent (with `setup_future_usage: off_session`)
 * and returns the `client_secret` so Stripe Elements can confirm the card.
 *
 * This is an `action` (not an internalAction) so anonymous visitors can
 * call it. Node-runtime actions can't touch the DB directly — plugin gating
 * happens inside `beginSubscriptionFirstCharge` (which queries the checkout
 * intent row, and `createCheckoutIntent` itself already gated the intent's
 * creation on `requireCommerceSubscriptionsEnabled`).
 */

import { v } from "convex/values";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const beginFirstCharge = action({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    checkoutIntentId: v.id("commerce_subscription_checkout_intents"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    return await ctx.runAction(
      internal.commerceSubscriptions.stripeCharge.beginSubscriptionFirstCharge,
      { checkoutIntentId: args.checkoutIntentId },
    );
  },
});
