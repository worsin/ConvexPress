"use node";
/**
 * Public-facing wrapper around the internal `beginSubscriptionFirstCharge`
 * action. The website calls this from the signup form after
 * `createCheckoutIntent` has returned a checkout intent id. It creates the
 * Stripe Customer + PaymentIntent (with `setup_future_usage: off_session`)
 * and returns the `client_secret` so Stripe Elements can confirm the card.
 *
 * This is an `action` (not an internalAction) so signed-out visitors can pay
 * for the intent they just created. Node-runtime actions can't touch the DB
 * directly, so access is decided by `checkout.getChargeStartAccess`, which
 * runs with the caller's identity: the intent must still be payable, and an
 * intent created by a signed-in user can only be paid from that account.
 * Starting a charge never activates anything — the signature-verified Stripe
 * webhook activates the intent after the payment settles.
 */

import { ConvexError, v } from "convex/values";

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
    const access = await ctx.runQuery(
      internal.commerceSubscriptions.checkout.getChargeStartAccess,
      { intentId: args.checkoutIntentId },
    );
    if (!access.allowed) {
      throw new ConvexError({
        code: access.reason === "not_owner" ? "FORBIDDEN" : "INTENT_NOT_PAYABLE",
        message:
          access.reason === "not_owner"
            ? "This checkout belongs to another account."
            : "This checkout can no longer be paid. Start a new checkout.",
      });
    }
    return await ctx.runAction(
      internal.commerceSubscriptions.stripeCharge.beginSubscriptionFirstCharge,
      { checkoutIntentId: args.checkoutIntentId },
    );
  },
});
