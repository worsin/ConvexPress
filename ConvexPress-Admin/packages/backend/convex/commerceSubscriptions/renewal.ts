"use node";
/**
 * Commerce Subscriptions — renewal sweep.
 *
 * Hourly (crons.ts `subscription-renewals`): applies due scheduled offer
 * changes, creates the renewal invoice for each contract whose paid period has
 * ended, and charges it. Each charge is recorded by
 * `internals.handleInvoicePaymentResult` from inside `chargeSubscriptionInvoice`;
 * a declined renewal enters dunning there.
 *
 * The sweep also re-drives open invoices whose charge never reported back (the
 * charging action died first). The re-drive reuses the charge's idempotency
 * key, so a charge Stripe already made is returned rather than repeated.
 */

import { v } from "convex/values";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { requirePluginEnabled } from "../helpers/plugins";

export const runRenewalSweep = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.object({
    generated: v.number(),
    charged: v.number(),
    succeeded: v.number(),
    failed: v.number(),
    invoiceIds: v.array(v.id("commerce_subscription_invoices")),
  }),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");

    await ctx.runMutation(internal.commerceSubscriptions.internals.applyDueScheduledOfferChanges, {});

    const generated = await ctx.runMutation(internal.commerceSubscriptions.internals.createDueInvoices, {
      limit: args.limit ?? 50,
    });
    const stalled = await ctx.runQuery(internal.commerceSubscriptions.internals.getStalledInvoiceCharges, {
      limit: args.limit ?? 25,
    });

    const invoiceIds: Id<"commerce_subscription_invoices">[] = [...generated.invoiceIds];
    for (const { invoiceId } of stalled) {
      if (!invoiceIds.includes(invoiceId)) invoiceIds.push(invoiceId);
    }

    let charged = 0;
    let succeeded = 0;
    let failed = 0;
    for (const invoiceId of invoiceIds) {
      try {
        const result = await ctx.runAction(internal.commerceSubscriptions.stripeCharge.chargeSubscriptionInvoice, {
          invoiceId,
          attemptNumber: 1,
        });
        if (result.skipped) continue;
        charged++;
        if (result.success) succeeded++;
        else failed++;
      } catch (err) {
        // The invoice stays open and is re-driven by a later sweep.
        console.error(
          `[renewal] Error charging invoice ${invoiceId}:`,
          err instanceof Error ? err.message : String(err),
        );
        failed++;
      }
    }

    return { generated: generated.createdCount, charged, succeeded, failed, invoiceIds };
  },
});
