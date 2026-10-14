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
 *     - On success: swap the subscription item to the new offer within the
 *       current billing period (the proration paid for the rest of it), update
 *       the contract's recurring amount, offer history and entitlements.
 *     - Return { invoiceId, success, error? }.
 *
 *   Amounts are minor units (cents); the proration is charged in whole units.
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
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { readMergedSettingsSection } from "../settings/read";
import { allocateSubscriptionInvoiceNumber } from "./invoiceNumbers";
import { createCorrelationId, swapToOffer, writeHistory } from "./lifecycle";

const UPGRADE_BLOCKED_STATUSES: ReadonlySet<Doc<"commerce_subscriptions">["status"]> = new Set([
  "past_due",
  "paused",
  "draft",
  "cancelled",
  "expired",
]);

// ─── Disabled-provider fallback ───────────────────────────────────────────────

interface ProratedChargeResult {
  success: boolean;
  transactionId?: string;
  failureReason?: string;
}

function disabledProviderFallback(
  invoiceId: Id<"commerce_subscription_invoices">,
  totalAmount: number,
  savedPaymentMethodId?: string,
): ProratedChargeResult {
  if (totalAmount <= 0) {
    return { success: true, transactionId: `free_${String(invoiceId)}` };
  }
  if (!savedPaymentMethodId) {
    return { success: false, failureReason: "no_payment_method_on_file" };
  }
  return {
    success: false,
    failureReason: "subscription_charging_not_enabled",
  };
}

async function isLiveChargingEnabled(ctx: MutationCtx): Promise<boolean> {
  const values = await readMergedSettingsSection(ctx, "commerce.payments");
  return values.subscriptionChargingEnabled === true;
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
export const applyUpgradeProration = internalMutation({
  args: {
    contractId: v.id("commerce_subscriptions"),
    toOfferId: v.id("commerce_subscription_offers"),
    triggeredByUserId: v.id("users"),
  },
  returns: v.object({
    invoiceId: v.union(v.null(), v.id("commerce_subscription_invoices")),
    success: v.boolean(),
    error: v.optional(v.string()),
    pending: v.optional(v.boolean()),
    message: v.optional(v.string()),
  }),
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
    if (UPGRADE_BLOCKED_STATUSES.has(contract.status)) {
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
      .withIndex("by_subscription", (q) => q.eq("subscriptionId", args.contractId))
      .collect();
    const activeItem =
      items.find((it) => it.status === "active") ??
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

    // One plan change at a time: a second upgrade while the first one's charge
    // is still settling would swap items twice.
    const contractInvoices = await ctx.db
      .query("commerce_subscription_invoices")
      .withIndex("by_subscription", (q) => q.eq("subscriptionId", args.contractId))
      .collect();
    if (contractInvoices.some((invoice) => invoice.prorationEventId !== undefined && invoice.status === "open")) {
      throw new ConvexError({
        code: "PLAN_CHANGE_IN_PROGRESS",
        message: "A plan change for this subscription is still being processed.",
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
    // Amounts are minor units; a charge is a whole number of them.
    const netCharge = Math.round(proration.netCharge);

    // A negative or zero netCharge means downgrade — caller should use
    // applyDowngradeProration instead.
    if (netCharge <= 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Net proration charge is not positive — this is a downgrade. Use applyDowngradeProration.",
        netCharge,
      });
    }

    const currencyCode = toOffer.currencyCode ?? contract.currencyCode ?? "USD";

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
        netCharge,
        triggeredBy: args.triggeredByUserId,
        triggeredAt: now,
      },
    );

    const invoiceId = await ctx.db.insert("commerce_subscription_invoices", {
      subscriptionId: args.contractId,
      sourceChannel: contract.sourceChannel,
      status: "open",
      invoiceNumber: await allocateSubscriptionInvoiceNumber(ctx),
      currencyCode,
      subtotalAmount: netCharge,
      taxAmount: 0, // Tax stub — Wave 7 tax engine extension point.
      totalAmount: netCharge,
      paymentProvider: contract.paymentProvider,
      savedPaymentMethodId: contract.defaultPaymentMethodId,
      manualBilling: false,
      prorationEventId,
      periodStartAt: now,
      periodEndAt: cycleEnd,
      dueAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch("commerce_subscription_proration_events", prorationEventId, { invoiceId });

    await ctx.db.insert("commerce_subscription_invoice_items", {
      invoiceId,
      subscriptionItemId: activeItem._id,
      description: `Plan upgrade: ${fromOffer.title} → ${toOffer.title}`,
      quantity: 1,
      unitAmount: netCharge,
      lineType: "proration_charge",
      currencyCode,
      lineTotalAmount: netCharge,
      metadata: {
        fromOfferId: fromOffer._id,
        toOfferId: toOffer._id,
        proration,
        prorationEventId,
      },
      createdAt: now,
    });

    // Apply active coupon discounts on this contract. A redemption that can no
    // longer apply is skipped and recorded.
    const activeRedemptions = await ctx.db
      .query("commerce_subscription_coupon_redemptions")
      .withIndex("by_contract", (q) => q.eq("contractId", args.contractId))
      .collect();
    let currentSubtotal = netCharge;
    for (const redemption of activeRedemptions) {
      if (redemption.remainingApplications <= 0) continue;
      try {
        currentSubtotal = (await applyCouponToInvoice(ctx, invoiceId, redemption._id, currentSubtotal)).newSubtotal;
      } catch (err) {
        await writeHistory(ctx, {
          subscriptionId: args.contractId,
          eventType: "subscription.coupon_skipped",
          reason: err instanceof Error ? err.message : String(err),
          data: { invoiceId, redemptionId: redemption._id },
          correlationId,
        });
      }
    }

    const finalInvoice = await ctx.db.get(invoiceId);
    const finalTotal = finalInvoice?.totalAmount ?? netCharge;

    // Live charging: the charge runs in an action and its outcome, recorded by
    // handleInvoicePaymentResult, applies the swap (or voids the invoice).
    if (await isLiveChargingEnabled(ctx)) {
      await ctx.scheduler.runAfter(
        0,
        internal.commerceSubscriptions.stripeCharge.chargeSubscriptionInvoice,
        { invoiceId, attemptNumber: 1 },
      );
      await writeHistory(ctx, {
        subscriptionId: args.contractId,
        eventType: "subscription.proration_charge_scheduled",
        actorUserId: args.triggeredByUserId,
        data: { fromOfferId: fromOffer._id, toOfferId: toOffer._id, invoiceId, prorationEventId, proration, netCharge },
        correlationId,
      });
      return {
        invoiceId,
        success: true,
        pending: true,
        message: "Proration invoice created. Stripe charge scheduled; the plan changes when it succeeds.",
      };
    }

    const chargeResult = disabledProviderFallback(invoiceId, finalTotal, contract.defaultPaymentMethodId);
    if (!chargeResult.success) {
      await ctx.db.patch("commerce_subscription_invoices", invoiceId, {
        status: "void",
        dueAt: undefined,
        updatedAt: now,
      });
      return {
        invoiceId,
        success: false,
        error: chargeResult.failureReason ?? "charge_failed",
      };
    }

    await ctx.db.patch("commerce_subscription_invoices", invoiceId, {
      status: "paid",
      paidAt: now,
      paymentTransactionId: chargeResult.transactionId,
      dueAt: undefined,
      updatedAt: now,
    });
    const entitlements = await swapToOffer(ctx, contract, toOffer, "upgrade_proration", now);
    await ctx.db.patch("commerce_subscriptions", args.contractId, { lastInvoiceId: invoiceId });

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
        ...entitlements,
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
export const applyDowngradeProration = internalMutation({
  args: {
    contractId: v.id("commerce_subscriptions"),
    toOfferId: v.id("commerce_subscription_offers"),
    triggeredByUserId: v.id("users"),
  },
  returns: v.object({ ok: v.boolean(), mode: v.literal("scheduled"), effectiveAt: v.number() }),
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

    await ctx.db.patch("commerce_subscriptions", args.contractId, {
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
