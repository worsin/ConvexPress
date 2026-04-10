// @ts-nocheck
/**
 * Commerce Subscriptions — Internal Functions
 *
 * Ported from VexCart subscriptions.ts internal mutations, adapted to ConvexPress
 * schema (commerce_subscription_* tables).
 *
 * These are NOT client-callable — invoked by actions, schedulers, or other internal functions.
 *
 * Functions:
 *   - createDueInvoices           Generate invoices for subscriptions due for billing
 *   - handleInvoicePaymentResult  Process payment success/failure for an invoice
 *   - runDunningSweep             Sweep failed invoices and schedule retry attempts
 *   - expirePendingCancellations  Expire subscriptions that reached their cancel-at date
 *   - processScheduledDunning     Process a single scheduled dunning attempt
 */

import { ConvexError, v } from "convex/values";

import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS (duplicated for internal module isolation)
// ═══════════════════════════════════════════════════════════════════════════

type BillingInterval = "week" | "month" | "year";
type SubscriptionStatus =
  | "draft"
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "pending_cancel"
  | "cancelled"
  | "expired";

const STATUS_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  draft: ["trialing", "active", "cancelled"],
  trialing: ["active", "past_due", "paused", "pending_cancel", "cancelled", "expired"],
  active: ["past_due", "paused", "pending_cancel", "cancelled", "expired"],
  past_due: ["active", "paused", "pending_cancel", "cancelled", "expired"],
  paused: ["active", "pending_cancel", "cancelled", "expired"],
  pending_cancel: ["active", "cancelled", "expired"],
  cancelled: [],
  expired: [],
};

const DEFAULT_DUNNING_POLICY = {
  maxAttempts: 3,
  retryIntervalsDays: [1, 3, 7],
  cancelAfterFinalFailure: true,
};

function canTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

function addDays(timestamp: number, days: number): number {
  return timestamp + days * 24 * 60 * 60 * 1000;
}

function addBillingPeriod(
  timestamp: number,
  interval: BillingInterval,
  intervalCount: number,
): number {
  const date = new Date(timestamp);
  if (interval === "week") {
    date.setDate(date.getDate() + 7 * intervalCount);
    return date.getTime();
  }
  if (interval === "month") {
    date.setMonth(date.getMonth() + intervalCount);
    return date.getTime();
  }
  date.setFullYear(date.getFullYear() + intervalCount);
  return date.getTime();
}

function createCorrelationId(): string {
  return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function resolveEffectiveConfig(ctx: any, product: any, templateId?: any) {
  const override = await ctx.db
    .query("commerce_product_subscription_overrides")
    .withIndex("by_product", (q: any) => q.eq("productId", product._id))
    .first();

  let template: any = null;
  const configuredTemplateId = templateId ?? override?.templateId ?? undefined;
  if (configuredTemplateId) {
    template = await ctx.db.get(configuredTemplateId);
  }
  if (!template) {
    template = await ctx.db
      .query("commerce_subscription_templates")
      .withIndex("by_status", (q: any) => q.eq("status", "active"))
      .first();
  }

  return {
    gracePeriodDays: override?.overrideGracePeriodDays ?? template?.gracePeriodDays ?? 3,
    dunningPolicy: DEFAULT_DUNNING_POLICY,
  };
}

async function writeHistory(ctx: any, args: any) {
  await ctx.db.insert("commerce_subscription_history", {
    subscriptionId: args.subscriptionId,
    eventType: args.eventType,
    message: args.message ?? args.eventType,
    actorUserId: args.actorUserId,
    metadata: {
      fromStatus: args.fromStatus,
      toStatus: args.toStatus,
      reason: args.reason,
      data: args.data,
      correlationId: args.correlationId,
    },
    createdAt: Date.now(),
  });
}

async function syncEntitlementsForStatus(
  ctx: any,
  subscription: any,
  now: number,
  gracePeriodDays = 3,
) {
  const entitlements = await ctx.db
    .query("commerce_subscription_entitlements")
    .withIndex("by_subscription", (q: any) =>
      q.eq("subscriptionId", subscription._id),
    )
    .collect();

  for (const entitlement of entitlements) {
    if (subscription.status === "active" || subscription.status === "trialing") {
      await ctx.db.patch(entitlement._id, {
        status: "active",
        endsAt: undefined,
        updatedAt: now,
      });
    } else if (subscription.status === "past_due" || subscription.status === "paused") {
      await ctx.db.patch(entitlement._id, {
        status: "grace",
        graceEndsAt: addDays(now, gracePeriodDays),
        updatedAt: now,
      });
    } else if (subscription.status === "cancelled" || subscription.status === "expired") {
      await ctx.db.patch(entitlement._id, {
        status: "revoked",
        endsAt: now,
        updatedAt: now,
      });
    }
  }
}

async function transitionSubscription(ctx: any, args: any) {
  const now = Date.now();
  if (args.subscription.status === args.toStatus) return args.subscription;

  if (!canTransition(args.subscription.status, args.toStatus)) {
    throw new Error(
      `Invalid status transition: ${args.subscription.status} -> ${args.toStatus}`,
    );
  }

  const patch: Record<string, unknown> = {
    status: args.toStatus,
    updatedAt: now,
    ...args.patch,
  };

  if (args.toStatus === "cancelled" || args.toStatus === "expired") {
    patch.cancelledAt = now;
  }

  await ctx.db.patch(args.subscription._id, patch);
  const updated = await ctx.db.get(args.subscription._id);
  if (!updated) throw new Error("Subscription not found after transition");

  await writeHistory(ctx, {
    subscriptionId: updated._id,
    eventType: "subscription.status_changed",
    actorUserId: args.actorUserId,
    fromStatus: args.subscription.status,
    toStatus: args.toStatus,
    reason: args.reason,
    data: { patch },
    correlationId: args.correlationId,
  });

  const product = await ctx.db.get(updated.productId);
  if (product) {
    const config = await resolveEffectiveConfig(ctx, product, updated.templateId);
    await syncEntitlementsForStatus(ctx, updated, now, config.gracePeriodDays ?? 3);
  }

  return updated;
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get subscriptions due for billing (used by renewal action).
 */
export const getDueSubscriptions = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const limit = args.limit ?? 50;

    const active = await ctx.db
      .query("commerce_subscriptions")
      .withIndex("by_status", (q: any) => q.eq("status", "active"))
      .collect();
    const trialing = await ctx.db
      .query("commerce_subscriptions")
      .withIndex("by_status", (q: any) => q.eq("status", "trialing"))
      .collect();

    return [...active, ...trialing]
      .filter((sub: any) => (sub.nextBillingAt ?? Number.MAX_SAFE_INTEGER) <= now)
      .slice(0, limit);
  },
});

/**
 * Get failed invoices due for retry (used by dunning action).
 */
export const getRetryableInvoices = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const limit = args.limit ?? 100;

    const failedInvoices = await ctx.db
      .query("commerce_subscription_invoices")
      .withIndex("by_status", (q: any) => q.eq("status", "failed"))
      .collect();

    return failedInvoices
      .filter((inv: any) => inv.dueAt !== undefined && inv.dueAt <= now)
      .slice(0, limit);
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL MUTATIONS — INVOICE GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create invoices for subscriptions that are due for billing.
 * Called by the renewal action on a schedule.
 */
export const createDueInvoices = internalMutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const limit = args.limit ?? 50;

    const active = await ctx.db
      .query("commerce_subscriptions")
      .withIndex("by_status", (q: any) => q.eq("status", "active"))
      .collect();
    const trialing = await ctx.db
      .query("commerce_subscriptions")
      .withIndex("by_status", (q: any) => q.eq("status", "trialing"))
      .collect();

    const dueSubscriptions = [...active, ...trialing]
      .filter((sub: any) => (sub.nextBillingAt ?? Number.MAX_SAFE_INTEGER) <= now)
      .slice(0, limit);

    const createdInvoiceIds: any[] = [];

    for (const subscription of dueSubscriptions) {
      // Skip if there's already an open/draft invoice
      const existingInvoices = await ctx.db
        .query("commerce_subscription_invoices")
        .withIndex("by_subscription", (q: any) =>
          q.eq("subscriptionId", subscription._id),
        )
        .collect();
      const hasOpen = existingInvoices.some(
        (inv: any) => inv.status === "open" || inv.status === "draft",
      );
      if (hasOpen) continue;

      const subtotalAmount = subscription.recurringAmount ?? 0;
      const taxAmount = 0;
      const totalAmount = subtotalAmount + taxAmount;

      const invoiceId = await ctx.db.insert("commerce_subscription_invoices", {
        subscriptionId: subscription._id,
        status: "open",
        currencyCode: subscription.currencyCode,
        subtotalAmount,
        taxAmount,
        totalAmount,
        dueAt: now,
        paidAt: undefined,
        createdAt: now,
        updatedAt: now,
      });

      // Create invoice line items from subscription items
      const items = await ctx.db
        .query("commerce_subscription_items")
        .withIndex("by_subscription", (q: any) =>
          q.eq("subscriptionId", subscription._id),
        )
        .collect();

      for (const item of items) {
        await ctx.db.insert("commerce_subscription_invoice_items", {
          invoiceId,
          subscriptionItemId: item._id,
          description: "Recurring subscription charge",
          quantity: item.quantity,
          unitAmount: item.unitAmount,
          lineTotalAmount: item.unitAmount * item.quantity,
          createdAt: now,
        });
      }

      createdInvoiceIds.push(invoiceId);
    }

    return {
      createdCount: createdInvoiceIds.length,
      invoiceIds: createdInvoiceIds,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL MUTATIONS — PAYMENT RESULT HANDLING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Handle the result of a subscription invoice payment attempt.
 * Called by the renewal action after attempting payment.
 */
export const handleInvoicePaymentResult = internalMutation({
  args: {
    invoiceId: v.id("commerce_subscription_invoices"),
    succeeded: v.boolean(),
    paymentTransactionId: v.optional(v.string()),
    failureCode: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    correlationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const correlationId = args.correlationId ?? createCorrelationId();

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new Error("Invoice not found");

    const subscription = await ctx.db.get(invoice.subscriptionId);
    if (!subscription) throw new Error("Subscription not found");

    if (args.succeeded) {
      // === SUCCESS PATH ===
      const currentPeriodEndAt = subscription.currentPeriodEndAt ?? now;
      const nextPeriodStartAt = currentPeriodEndAt;

      // Determine billing interval from subscription items or defaults
      const items = await ctx.db
        .query("commerce_subscription_items")
        .withIndex("by_subscription", (q: any) =>
          q.eq("subscriptionId", subscription._id),
        )
        .first();

      // Use a default interval if not stored on subscription
      const billingInterval: BillingInterval = "month";
      const billingIntervalCount = 1;

      // Try to get interval from template
      let template: any = null;
      if (subscription.templateId) {
        template = await ctx.db.get(subscription.templateId);
      }
      const effectiveInterval = template?.billingInterval ?? billingInterval;
      const effectiveCount = template?.billingIntervalCount ?? billingIntervalCount;

      const nextPeriodEndAt = addBillingPeriod(
        nextPeriodStartAt,
        effectiveInterval as BillingInterval,
        effectiveCount,
      );

      // Mark invoice as paid
      await ctx.db.patch(invoice._id, {
        status: "paid",
        paidAt: now,
        updatedAt: now,
      });

      // Advance subscription billing period
      await ctx.db.patch(subscription._id, {
        status: "active",
        currentPeriodStartAt: nextPeriodStartAt,
        currentPeriodEndAt: nextPeriodEndAt,
        nextBillingAt: nextPeriodEndAt,
        updatedAt: now,
      });

      // Sync entitlements to active
      const updated = await ctx.db.get(subscription._id);
      if (updated) {
        const product = await ctx.db.get(updated.productId);
        if (product) {
          const config = await resolveEffectiveConfig(ctx, product, updated.templateId);
          await syncEntitlementsForStatus(ctx, updated, now, config.gracePeriodDays ?? 3);
        }
      }

      await writeHistory(ctx, {
        subscriptionId: subscription._id,
        eventType: "subscription.renewed",
        fromStatus: subscription.status,
        toStatus: "active",
        data: {
          invoiceId: invoice._id,
          paymentTransactionId: args.paymentTransactionId,
          nextPeriodEndAt,
        },
        correlationId,
      });
    } else {
      // === FAILURE PATH ===
      const product = await ctx.db.get(subscription.productId);
      const config = product
        ? await resolveEffectiveConfig(ctx, product, subscription.templateId)
        : { gracePeriodDays: 3, dunningPolicy: DEFAULT_DUNNING_POLICY };

      // Count existing dunning attempts for this subscription
      const existingAttempts = await ctx.db
        .query("commerce_subscription_dunning_attempts")
        .withIndex("by_subscription", (q: any) =>
          q.eq("subscriptionId", subscription._id),
        )
        .collect();
      const attemptNumber = existingAttempts.length + 1;

      const retryDays = config.dunningPolicy.retryIntervalsDays[attemptNumber - 1];
      const nextRetryAt = retryDays !== undefined ? addDays(now, retryDays) : undefined;

      // Mark invoice as failed
      await ctx.db.patch(invoice._id, {
        status: "failed",
        dueAt: nextRetryAt,
        updatedAt: now,
      });

      // Move subscription to past_due
      if (subscription.status !== "past_due") {
        await ctx.db.patch(subscription._id, {
          status: "past_due",
          updatedAt: now,
        });
      }

      // Record dunning attempt
      await ctx.db.insert("commerce_subscription_dunning_attempts", {
        subscriptionId: subscription._id,
        invoiceId: invoice._id,
        attemptNumber,
        status: "failed",
        scheduledAt: now,
        processedAt: now,
        errorMessage: args.failureReason,
        createdAt: now,
        updatedAt: now,
      });

      // Sync entitlements to grace
      const updated = await ctx.db.get(subscription._id);
      if (updated) {
        await syncEntitlementsForStatus(ctx, updated, now, config.gracePeriodDays ?? 3);
      }

      // Check if dunning is exhausted
      if (
        config.dunningPolicy.cancelAfterFinalFailure &&
        attemptNumber >= config.dunningPolicy.maxAttempts
      ) {
        const current = await ctx.db.get(subscription._id);
        if (current) {
          await transitionSubscription(ctx, {
            subscription: current,
            toStatus: "cancelled",
            reason: "dunning_exhausted",
            correlationId,
            patch: {},
          });
        }
      }

      await writeHistory(ctx, {
        subscriptionId: subscription._id,
        eventType: "subscription.payment_failed",
        fromStatus: subscription.status,
        toStatus: "past_due",
        reason: args.failureReason,
        data: {
          invoiceId: invoice._id,
          failureCode: args.failureCode,
          attemptNumber,
          nextRetryAt,
        },
        correlationId,
      });
    }

    return { success: true };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL MUTATIONS — DUNNING SWEEP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sweep failed invoices and schedule retry dunning attempts.
 * Called on a schedule (e.g. hourly).
 */
export const runDunningSweep = internalMutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const limit = args.limit ?? 100;

    const failedInvoices = await ctx.db
      .query("commerce_subscription_invoices")
      .withIndex("by_status", (q: any) => q.eq("status", "failed"))
      .collect();

    // Find invoices that are due for retry (dueAt is the scheduled retry time)
    const dueRetries = failedInvoices
      .filter((inv: any) => inv.dueAt !== undefined && inv.dueAt <= now)
      .slice(0, limit);

    for (const invoice of dueRetries) {
      // Count existing attempts
      const attempts = await ctx.db
        .query("commerce_subscription_dunning_attempts")
        .withIndex("by_subscription", (q: any) =>
          q.eq("subscriptionId", invoice.subscriptionId),
        )
        .collect();

      const attemptNumber = attempts.length + 1;

      await ctx.db.insert("commerce_subscription_dunning_attempts", {
        subscriptionId: invoice.subscriptionId,
        invoiceId: invoice._id,
        attemptNumber,
        status: "scheduled",
        scheduledAt: now,
        processedAt: undefined,
        errorMessage: undefined,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { scheduled: dueRetries.length };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL MUTATIONS — EXPIRATION SWEEP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Expire subscriptions that have reached their scheduled cancel date.
 * Transitions pending_cancel -> cancelled when currentPeriodEndAt has passed.
 */
export const expirePendingCancellations = internalMutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const limit = args.limit ?? 100;

    const pendingCancel = await ctx.db
      .query("commerce_subscriptions")
      .withIndex("by_status", (q: any) => q.eq("status", "pending_cancel"))
      .collect();

    const dueForCancellation = pendingCancel
      .filter(
        (sub: any) =>
          sub.currentPeriodEndAt !== undefined && sub.currentPeriodEndAt <= now,
      )
      .slice(0, limit);

    let cancelledCount = 0;

    for (const subscription of dueForCancellation) {
      await transitionSubscription(ctx, {
        subscription,
        toStatus: "cancelled",
        reason: "period_end_reached",
        correlationId: createCorrelationId(),
        patch: {},
      });
      cancelledCount++;
    }

    return { cancelledCount };
  },
});

/**
 * Process a single scheduled dunning attempt.
 * Marks the attempt as processing, then schedules the actual payment action.
 */
export const processScheduledDunning = internalMutation({
  args: {
    dunningAttemptId: v.id("commerce_subscription_dunning_attempts"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const attempt = await ctx.db.get(args.dunningAttemptId);
    if (!attempt || attempt.status !== "scheduled") {
      return { skipped: true };
    }

    await ctx.db.patch(args.dunningAttemptId, {
      status: "processing",
      processedAt: now,
      updatedAt: now,
    });

    // The action layer will pick up processing attempts and actually charge
    // For now, mark ready for the action to handle
    return {
      subscriptionId: attempt.subscriptionId,
      invoiceId: attempt.invoiceId,
      attemptNumber: attempt.attemptNumber,
    };
  },
});
