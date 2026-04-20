// @ts-nocheck
"use node";
/**
 * Commerce Subscriptions — Actions (Node.js runtime)
 *
 * Ported from VexCart subscriptions, adapted to ConvexPress.
 * These run in the Node.js runtime and can make external API calls (Stripe, etc.).
 *
 * Functions:
 *   - processRenewals            Process all due subscription renewals (generate invoices + charge)
 *   - processDunningRetries      Retry failed payments for past-due subscriptions
 *   - processExpiredSubscriptions  Expire pending-cancel subscriptions past their period end
 *   - chargeSubscriptionInvoice  Charge a single subscription invoice via Stripe
 */

import { v } from "convex/values";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { requirePluginEnabled } from "../helpers/plugins";

// ═══════════════════════════════════════════════════════════════════════════
// RENEWAL PROCESSING ACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process subscription renewals.
 *
 * Disabled-safe until off-session provider charging is implemented.
 * This intentionally does not generate invoices or mutate subscriptions.
 *
 * This should be scheduled to run periodically (e.g. every hour via cron).
 */
export const processRenewals = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      invoiceIds: [],
      skipped: true,
      reason: "subscription_charging_not_configured",
      message:
        "Subscription renewal charging is disabled until reusable payment method charging is implemented.",
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// DUNNING RETRY ACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process dunning retries for failed subscription payments.
 *
 * Disabled-safe until off-session provider charging is implemented.
 * This intentionally does not schedule retries or mutate subscription state.
 *
 * This should be scheduled to run periodically (e.g. every 6 hours via cron).
 */
export const processDunningRetries = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");
    return {
      scheduled: 0,
      retried: 0,
      succeeded: 0,
      failed: 0,
      skipped: true,
      reason: "subscription_charging_not_configured",
      message:
        "Subscription dunning retries are disabled until reusable payment method charging is implemented.",
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// EXPIRATION ACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process expired subscriptions.
 * Transitions pending_cancel subscriptions to cancelled when their period ends.
 *
 * This should be scheduled to run periodically (e.g. every hour via cron).
 */
export const processExpiredSubscriptions = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");
    const result: any = await ctx.runMutation(
      internal.commerceSubscriptions.internals.expirePendingCancellations,
      { limit: args.limit ?? 100 },
    );

    return result;
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// SINGLE INVOICE CHARGE ACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Charge a single subscription invoice.
 * Used for manual retry or immediate charge scenarios.
 *
 * Disabled-safe until off-session provider charging is implemented.
 * This intentionally does not report payment failure or success.
 */
export const chargeSubscriptionInvoice = internalAction({
  args: {
    invoiceId: v.id("commerce_subscription_invoices"),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");
    const correlationId = `charge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return {
      success: false,
      error: "Automatic subscription charging is not configured.",
      skipped: true,
      reason: "subscription_charging_not_configured",
      invoiceId: args.invoiceId,
      correlationId,
    };
  },
});
