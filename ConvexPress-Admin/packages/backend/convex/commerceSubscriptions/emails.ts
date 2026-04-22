/**
 * Commerce Subscriptions — email event handlers (Wave 10.2).
 *
 * Each handler follows the project-wide pattern used by
 * `emails/internals.ts`: take `{ eventId }`, load the event, parse
 * `event.payload`, build the variable bag, and call `queueEmail`.
 *
 * One handler per subscription lifecycle template so `registerListeners.ts`
 * can wire them with standard `{ eventCode, handlerModule, handlerFunction }`
 * definitions.
 */

import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

async function buildVariables(
  ctx: any,
  event: any,
): Promise<{ to: string; name?: string; userId?: string; variables: Record<string, string> } | null> {
  const payload = JSON.parse(event.payload ?? "{}") as Record<string, unknown>;
  const subscriptionId = payload.subscriptionId as string | undefined;
  if (!subscriptionId) return null;

  const subscription = await ctx.db.get(subscriptionId);
  if (!subscription || !subscription.userId) return null;
  const user = await ctx.db.get(subscription.userId);
  if (!user || !user.email) return null;

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
    attempt_number: String(payload.attemptNumber ?? 1),
    max_attempts: String(payload.maxAttempts ?? 4),
  };

  return {
    to: user.email,
    name: user.displayName,
    userId: String(user._id),
    variables,
  };
}

async function dispatch(
  ctx: any,
  args: { eventId: string },
  templateSlug: string,
): Promise<void> {
  const event = await ctx.db.get("events", args.eventId);
  if (!event) return;
  const bundle = await buildVariables(ctx, event);
  if (!bundle) return;

  await ctx.runMutation(internal.emails.internals.queueEmail, {
    templateSlug,
    variables: JSON.stringify(bundle.variables),
    recipientEmail: bundle.to,
    recipientName: bundle.name,
    recipientUserId: bundle.userId,
    eventId: args.eventId,
  });
}

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onSubscriptionCreated = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { eventId: v.id("events") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: (ctx, args) => dispatch(ctx, args, "subscription-welcome"),
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onSubscriptionRenewed = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { eventId: v.id("events") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: (ctx, args) => dispatch(ctx, args, "subscription-renewed"),
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onSubscriptionPastDue = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { eventId: v.id("events") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: (ctx, args) => dispatch(ctx, args, "subscription-payment-failed"),
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onSubscriptionTrialEnding = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { eventId: v.id("events") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: (ctx, args) => dispatch(ctx, args, "subscription-trial-ending"),
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onSubscriptionCancelled = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { eventId: v.id("events") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: (ctx, args) => dispatch(ctx, args, "subscription-cancelled"),
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onSubscriptionPaused = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { eventId: v.id("events") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: (ctx, args) => dispatch(ctx, args, "subscription-paused"),
});
