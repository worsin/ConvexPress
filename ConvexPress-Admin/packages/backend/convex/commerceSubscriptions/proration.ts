/**
 * Commerce Subscriptions — Proration Internal Mutations (Wave 7 Task 7.2)
 *
 * Exports two internal mutations:
 *
 *   `applyUpgradeProration(contractId, toOfferId, triggeredByUserId)`
 *     - Block if contract.status in ["past_due", "paused", "draft"].
 *     - Compute proration via helpers/proration.computeProration.
 *     - Apply active coupon discounts via helpers/coupons.applyCouponToInvoice.
 *     - Create a commerce_subscription_proration_events row.
 *     - Create an invoice with a single proration_charge line item.
 *     - Charge through Stripe when live subscription charging is enabled;
 *       otherwise fail closed for positive paid prorations.
 *     - On success: swap the subscription item to the new offer, update the
 *       contract's recurring amount + offerHistory.
 *     - Return { invoiceId, success, error? }.
 *
 *   `applyDowngradeProration(contractId, toOfferId)`
 *     - Sets scheduledOfferChange on the contract.
 *     - No invoice created. Effective at next renewal (via renewal.ts step 1.e).
 */

import { ConvexError, v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { requirePluginEnabled } from "../helpers/plugins";
import { computeProration } from "../helpers/proration";
import { applyCouponToInvoice } from "../helpers/coupons";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type BillingInterval = "day" | "week" | "month" | "year";

function addBillingPeriod(
  timestamp: number,
  interval: BillingInterval,
  intervalCount: number,
): number {
  const date = new Date(timestamp);
  if (interval === "day") {
    date.setDate(date.getDate() + intervalCount);
    return date.getTime();
  }
  if (interval === "week") {
    date.setDate(date.getDate() + 7 * intervalCount);
    return date.getTime();
  }
  if (interval === "month") {
    date.setMonth(date.getMonth() + intervalCount);
    return date.getTime();
  }
  // year
  date.setFullYear(date.getFullYear() + intervalCount);
  return date.getTime();
}

function createCorrelationId(): string {
  return `pro_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function writeHistory(ctx: MutationCtx, args: {
  subscriptionId: Id<"commerce_subscriptions">;
  eventType: string;
  actorUserId?: Id<"users">;
  fromStatus?: string;
  toStatus?: string;
  reason?: string;
  data?: unknown;
  correlationId?: string;
}) {
  await ctx.db.insert("commerce_subscription_history", {
    subscriptionId: args.subscriptionId,
    eventType: args.eventType,
    message: args.eventType,
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

// ─── Disabled-provider fallback ───────────────────────────────────────────────

interface ProratedChargeResult {
  success: boolean;
  transactionId?: string;
  failureReason?: string;
}

function disabledProviderFallback(
  totalAmount: number,
  savedPaymentMethodId?: string,
): ProratedChargeResult {
  if (totalAmount <= 0) {
    return { success: true, transactionId: `free_${Date.now()}` };
  }
  if (!savedPaymentMethodId) {
    return { success: false, failureReason: "no_payment_method_on_file" };
  }
  return {
    success: false,
    failureReason: "subscription_charging_not_enabled",
  };
}

async function allocateProrationInvoiceNumber(ctx: any): Promise<string> {
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_section", (q: any) =>
      q.eq("section", "commerce.subscriptions.counters"),
    )
    .unique();
  const values = (doc?.values ?? {}) as {
    invoiceCounter?: number;
    invoicePrefix?: string;
  };
  const nextCounter = (values.invoiceCounter ?? 0) + 1;
  const prefix = values.invoicePrefix ?? "INV-";
  const formatted = `${prefix}${String(nextCounter).padStart(6, "0")}`;
  const now = Date.now();
  if (doc) {
    await ctx.db.patch(doc._id, {
      values: { ...values, invoiceCounter: nextCounter },
      updatedAt: now,
    });
  }
  return formatted;
}

async function isLiveChargingEnabled(ctx: any): Promise<boolean> {
  const settings = await ctx.runQuery(
    internal.settings.httpInternals.getBySectionInternal,
    { section: "commerce.payments" },
  );
  const flag =
    settings?.values?.subscriptionChargingEnabled ??
    settings?.subscriptionChargingEnabled;
  return flag === true;
}

// ═══════════════════════════════════════════════════════════════════════════
// UPGRADE PRORATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply an immediate upgrade proration:
 *   1. Guard invalid states.
 *   2. Compute proration math.
 *   3. Apply active coupon discounts.
 *   4. Stub tax (Wave 7 extension point).
 *   5. Create proration_event + invoice.
 *   6. Charge the live processor when enabled; otherwise fail closed.
 *   7. On success: swap subscription item, update contract.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const applyUpgradeProration = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    contractId: v.id("commerce_subscriptions"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    toOfferId: v.id("commerce_subscription_offers"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    triggeredByUserId: v.id("users"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args): Promise<{
    invoiceId: Id<"commerce_subscription_invoices"> | null;
    success: boolean;
    error?: string;
    pending?: boolean;
    message?: string;
  }> => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");
    const now = Date.now();
    const correlationId = createCorrelationId();

    const contract = await ctx.db.get(args.contractId);
    if (!contract) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Subscription contract not found.",
      });
    }

    // Guard: only allow upgrade on active/trialing/pending_cancel.
    const blockedStatuses = ["past_due", "paused", "draft", "cancelled", "expired"] as const;
    if ((blockedStatuses as readonly string[]).includes(contract.status)) {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: `Cannot apply upgrade proration on a ${contract.status} contract. Resolve payment issues first.`,
        currentStatus: contract.status,
      });
    }

    const toOffer = await ctx.db.get(args.toOfferId);
    if (!toOffer) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Target offer not found." });
    }
    if (toOffer.status === "archived") {
      throw new ConvexError({ code: "OFFER_ARCHIVED", message: "Target offer is archived." });
    }

    // Resolve current (from) offer via the active item.
    const items = await ctx.db
      .query("commerce_subscription_items")
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      .withIndex("by_subscription", (q) => q.eq("subscriptionId", args.contractId))
      .collect();
    const activeItem =
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      items.find((it) => it.status === "active") ??
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      items.find((it) => it.status === "pending_cancel") ??
      items[0];

    if (!activeItem || !activeItem.sourceOfferId) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Contract has no active subscription item — cannot upgrade.",
      });
    }

    const fromOffer = await ctx.db.get(activeItem.sourceOfferId);
    if (!fromOffer) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Current offer not found — contact support.",
      });
    }

    if (fromOffer._id === toOffer._id) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "New offer is the same as current offer.",
      });
    }

    const cycleStart = contract.currentPeriodStartAt ?? contract.createdAt ?? now;
    const cycleEnd = contract.currentPeriodEndAt ?? cycleStart + 30 * 24 * 60 * 60 * 1000;

    const proration = computeProration({
      cycleStart,
      cycleEnd,
      now,
      oldOfferPrice: fromOffer.recurringAmount ?? 0,
      newOfferPrice: toOffer.recurringAmount ?? 0,
    });

    // A negative or zero netCharge means downgrade — caller should use
    // applyDowngradeProration instead.
    if (proration.netCharge <= 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Net proration charge is not positive — this is a downgrade. Use applyDowngradeProration.",
        netCharge: proration.netCharge,
      });
    }

    const currencyCode = toOffer.currencyCode ?? contract.currencyCode ?? "USD";

    // Create the proration event record.
    const prorationEventId = await ctx.db.insert(
      "commerce_subscription_proration_events",
      {
        contractId: args.contractId,
        fromOfferId: fromOffer._id,
        toOfferId: toOffer._id,
        daysRemaining: proration.daysRemaining,
        daysInCycle: proration.daysInCycle,
        unusedOldAmount: proration.unusedOldAmount,
        proratedNewAmount: proration.proratedNewAmount,
        netCharge: proration.netCharge,
        triggeredBy: args.triggeredByUserId,
        triggeredAt: now,
      },
    );

    // Allocate a sequential invoice number (Wave 10.3).
    const invoiceNumber = await allocateProrationInvoiceNumber(ctx);

    // Create the invoice.
    const invoiceId = await ctx.db.insert("commerce_subscription_invoices", {
      subscriptionId: args.contractId,
      sourceChannel: contract.sourceChannel,
      status: "open",
      invoiceNumber,
      currencyCode,
      subtotalAmount: proration.netCharge,
      taxAmount: 0, // Tax stub — Wave 7 tax engine extension point.
      totalAmount: proration.netCharge,
      paymentProvider: contract.paymentProvider,
      savedPaymentMethodId: contract.defaultPaymentMethodId,
      manualBilling: false,
      prorationEventId,
      dueAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // Update the proration_event with the invoiceId.
    await ctx.db.patch(prorationEventId, { invoiceId });

    // Create the invoice line item.
    await ctx.db.insert("commerce_subscription_invoice_items", {
      invoiceId,
      subscriptionItemId: activeItem._id,
      description: `Plan upgrade: ${fromOffer.title} → ${toOffer.title}`,
      quantity: 1,
      unitAmount: proration.netCharge,
      lineType: "proration_charge",
      currencyCode,
      lineTotalAmount: proration.netCharge,
      metadata: {
        fromOfferId: fromOffer._id,
        toOfferId: toOffer._id,
        proration,
        prorationEventId,
      },
      createdAt: now,
    });

    // Apply active coupon discounts on this contract.
    const activeRedemptions = await ctx.db
      .query("commerce_subscription_coupon_redemptions")
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      .withIndex("by_contract", (q) => q.eq("contractId", args.contractId))
      .collect();

    let currentSubtotal = proration.netCharge;
    for (const redemption of activeRedemptions) {
      if (redemption.remainingApplications <= 0) continue;
      try {
        const result = await applyCouponToInvoice(
          ctx,
          invoiceId,
          redemption._id,
          currentSubtotal,
        );
        currentSubtotal = result.newSubtotal;
      } catch {
        // A redemption failure is non-fatal — continue with others.
      }
    }

    // Fetch the final invoice total after coupon application.
    const finalInvoice = await ctx.db.get(invoiceId);
    const finalTotal = finalInvoice?.totalAmount ?? proration.netCharge;

    // Charge — branch on liveChargingEnabled. Live path defers the
    // item swap to handleInvoicePaymentResult (detected via
    // invoice.prorationEventId) after the Stripe charge settles.
    const live = await isLiveChargingEnabled(ctx);
    if (live) {
      await ctx.db.patch(invoiceId, {
        status: "open",
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(
        0,
        internal.commerceSubscriptions.stripeCharge.chargeSubscriptionInvoice,
        { invoiceId },
      );
      await writeHistory(ctx, {
        subscriptionId: args.contractId,
        eventType: "subscription.proration_charge_scheduled",
        actorUserId: args.triggeredByUserId,
        data: {
          fromOfferId: fromOffer._id,
          toOfferId: toOffer._id,
          invoiceId,
          prorationEventId,
          proration,
        },
        correlationId,
      });
      return {
        invoiceId,
        success: true,
        pending: true,
        message:
          "Proration invoice created. Stripe charge scheduled; item swap applies on success.",
      };
    }

    const chargeResult = disabledProviderFallback(
      finalTotal,
      contract.defaultPaymentMethodId,
    );

    if (!chargeResult.success) {
      // Mark invoice as failed. Leave contract in current state (not yet past_due —
      // the dunning sweep will handle retries).
      await ctx.db.patch(invoiceId, {
        status: "failed",
        updatedAt: now,
      });
      return {
        invoiceId,
        success: false,
        error: chargeResult.failureReason ?? "charge_failed",
      };
    }

    // On success: mark invoice paid.
    await ctx.db.patch(invoiceId, {
      status: "paid",
      paidAt: now,
      paymentTransactionId: chargeResult.transactionId,
      updatedAt: now,
    });

    // Swap the subscription item to the new offer.
    await ctx.db.patch(activeItem._id, {
      status: "cancelled",
      cancelledAt: now,
      updatedAt: now,
    });

    // Resolve billing interval from template.
    let billingInterval: BillingInterval = "month";
    let billingIntervalCount = 1;
    if (contract.templateId) {
      const template = await ctx.db.get(contract.templateId);
      if (template) {
        billingInterval = template.billingInterval as BillingInterval;
        billingIntervalCount = template.billingIntervalCount;
      }
    }
    // Fallback to contract-level fields if set.
    if (contract.billingInterval) {
      billingInterval = contract.billingInterval as BillingInterval;
    }
    if (contract.billingIntervalCount) {
      billingIntervalCount = contract.billingIntervalCount;
    }

    const newCycleStart = now;
    const newCycleEnd = addBillingPeriod(newCycleStart, billingInterval, billingIntervalCount);

    await ctx.db.insert("commerce_subscription_items", {
      subscriptionId: args.contractId,
      sourceOfferId: toOffer._id,
      productId: toOffer.productId,
      variantId: toOffer.variantId,
      bundleId: toOffer.bundleId,
      titleSnapshot: toOffer.title,
      quantity: 1,
      unitAmount: toOffer.recurringAmount ?? 0,
      unitRecurringAmount: toOffer.recurringAmount ?? 0,
      unitSetupFeeAmount: toOffer.setupFeeAmount ?? 0,
      currencyCode,
      status: "active",
      startsAt: now,
      currentPeriodEndAt: newCycleEnd,
      cancelAtPeriodEnd: false,
      entitlementCodes: toOffer.entitlementCodes,
      priceSnapshot: {
        offerId: toOffer._id,
        offerSlug: toOffer.slug,
        recurringAmount: toOffer.recurringAmount,
        currencyCode,
      },
      metadata: { fromPlanChange: true, fromOfferId: fromOffer._id },
      createdAt: now,
      updatedAt: now,
    });

    const existingHistory = contract.offerHistory ?? [];
    await ctx.db.patch(args.contractId, {
      recurringAmount: toOffer.recurringAmount ?? contract.recurringAmount,
      currencyCode,
      currentPeriodStartAt: newCycleStart,
      currentPeriodEndAt: newCycleEnd,
      nextBillingAt: newCycleEnd,
      lastInvoiceId: invoiceId,
      scheduledOfferChange: undefined,
      offerHistory: [
        ...existingHistory,
        {
          offerId: toOffer._id,
          effectiveAt: now,
          reason: "upgrade_proration",
        },
      ],
      updatedAt: now,
    });

    await writeHistory(ctx, {
      subscriptionId: args.contractId,
      eventType: "subscription.upgraded_via_proration",
      actorUserId: args.triggeredByUserId,
      fromStatus: contract.status,
      toStatus: contract.status,
      reason: "upgrade",
      data: {
        fromOfferId: fromOffer._id,
        toOfferId: toOffer._id,
        invoiceId,
        prorationEventId,
        proration,
        chargeTransactionId: chargeResult.transactionId,
      },
      correlationId,
    });

    return { invoiceId, success: true };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// DOWNGRADE PRORATION (scheduled)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Schedule a downgrade: stores `scheduledOfferChange` on the contract.
 * No invoice is created — the renewal sweep applies the change at period end
 * (renewal.ts step 1.e via internals.applyDueScheduledOfferChanges).
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const applyDowngradeProration = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    contractId: v.id("commerce_subscriptions"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    toOfferId: v.id("commerce_subscription_offers"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    triggeredByUserId: v.id("users"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");
    const now = Date.now();

    const contract = await ctx.db.get(args.contractId);
    if (!contract) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Contract not found." });
    }

    const toOffer = await ctx.db.get(args.toOfferId);
    if (!toOffer) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Target offer not found." });
    }

    const cycleEnd =
      contract.currentPeriodEndAt ??
      (contract.currentPeriodStartAt ?? now) + 30 * 24 * 60 * 60 * 1000;

    await ctx.db.patch(args.contractId, {
      scheduledOfferChange: {
        toOfferId: args.toOfferId,
        effectiveAt: cycleEnd,
      },
      updatedAt: now,
    });

    await ctx.db.insert("commerce_subscription_history", {
      subscriptionId: args.contractId,
      eventType: "subscription.downgrade_scheduled",
      message: "Downgrade scheduled for end of billing period",
      actorUserId: args.triggeredByUserId,
      metadata: {
        fromStatus: contract.status,
        toStatus: contract.status,
        data: {
          toOfferId: args.toOfferId,
          effectiveAt: cycleEnd,
        },
      },
      createdAt: now,
    });

    return {
      ok: true,
      mode: "scheduled" as const,
      effectiveAt: cycleEnd,
    };
  },
});
