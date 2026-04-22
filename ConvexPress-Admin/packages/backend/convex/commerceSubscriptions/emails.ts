/**
 * Commerce Subscriptions — email dispatcher (Wave 10.2).
 *
 * Each event subscriber calls `sendSubscriptionEmail` with a template slug
 * and a subscription id. We resolve the recipient email, build the
 * variable bag, and hand off to `emails.internals.queueEmail`.
 */

import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

const TEMPLATE_SLUGS = [
  "subscription-welcome",
  "subscription-renewed",
  "subscription-payment-failed",
  "subscription-trial-ending",
  "subscription-cancelled",
  "subscription-paused",
] as const;
type TemplateSlug = (typeof TEMPLATE_SLUGS)[number];

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const sendSubscriptionEmail = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    subscriptionId: v.id("commerce_subscriptions"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    templateSlug: v.union(
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("subscription-welcome"),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("subscription-renewed"),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("subscription-payment-failed"),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("subscription-trial-ending"),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("subscription-cancelled"),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("subscription-paused"),
    ),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    extra: v.optional(v.any()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription || !subscription.userId) return;
    const user = await ctx.db.get(subscription.userId);
    if (!user || !user.email) return;

    const offerId = subscription.pricingSnapshot?.offerId;
    const offer = offerId ? await ctx.db.get(offerId) : null;

    const currency = subscription.currencyCode ?? "USD";
    const amount =
      typeof subscription.recurringAmount === "number"
        ? `${(subscription.recurringAmount / 100).toFixed(2)} ${currency}`
        : "";
    const nextBillingAt = subscription.nextBillingAt
      ? new Date(subscription.nextBillingAt).toLocaleDateString()
      : "";
    const trialEndsAt = subscription.trialEndsAt
      ? new Date(subscription.trialEndsAt).toLocaleDateString()
      : "";

    const variables: Record<string, string> = {
      recipient_name: user.displayName ?? user.email,
      offer_title: offer?.title ?? "your subscription",
      amount,
      next_billing_at: nextBillingAt,
      trial_ends_at: trialEndsAt,
      portal_url: "/dashboard/subscriptions",
      ...(args.extra ?? {}),
    };

    await ctx.runMutation(internal.emails.internals.queueEmail, {
      templateSlug: args.templateSlug,
      variables: JSON.stringify(variables),
      recipientEmail: user.email,
      recipientName: user.displayName,
      recipientUserId: String(user._id),
    });
  },
});
