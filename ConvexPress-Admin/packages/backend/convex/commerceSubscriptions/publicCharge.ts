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

export const beginFirstCharge = action({
  args: {
    checkoutIntentId: v.id("commerce_subscription_checkout_intents"),
  },
  returns: v.object({
    clientSecret: v.union(v.null(), v.string()),
    paymentIntentId: v.string(),
    amount: v.number(),
    currency: v.string(),
    stripeCustomerId: v.string(),
    mode: v.union(v.literal("payment"), v.literal("setup")),
  }),
  handler: async (ctx, args) => {
    return await ctx.runAction(
      internal.commerceSubscriptions.stripeCharge.beginSubscriptionFirstCharge,
      { checkoutIntentId: args.checkoutIntentId },
    );
  },
});
