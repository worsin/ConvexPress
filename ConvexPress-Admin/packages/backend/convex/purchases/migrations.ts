// @ts-nocheck TS2589: Convex generated API union types exceed TypeScript instantiation depth.
import { v } from "convex/values";

import { internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import { requireCan } from "../helpers/permissions";

function parseJsonBag(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function hasFormOrderTotal(submission: any): boolean {
  const meta = parseJsonBag(submission.meta);
  const pricing = parseJsonBag(meta.pricing);
  return Number.isInteger(pricing.oneTime) && pricing.oneTime > 0;
}

export const repairLedger = mutation({
  args: {
    limit: v.optional(v.number()),
    includeEmailTemplates: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const limit = Math.min(Math.max(args.limit ?? 500, 1), 5000);

    const counts = {
      commerceOrders: 0,
      formOrders: 0,
      subscriptionSignups: 0,
      subscriptionInvoices: 0,
      emailTemplatesCreated: 0,
      emailTemplatesUpdated: 0,
    };

    if (args.includeEmailTemplates !== false) {
      const templates = await ctx.runMutation(internal.emails.internals.bootstrapTemplates, {});
      counts.emailTemplatesCreated = templates?.created ?? 0;
      counts.emailTemplatesUpdated = templates?.updated ?? 0;
    }

    const commerceOrders = await ctx.db
      .query("commerce_orders")
      .withIndex("by_createdAt")
      .order("desc")
      .take(limit);
    for (const order of commerceOrders) {
      await ctx.runMutation(internal.purchases.internals.syncCommerceOrder, {
        orderId: order._id,
      });
      counts.commerceOrders++;
    }

    const submissions = await ctx.db
      .query("form_submissions")
      .withIndex("by_status", (q: any) => q.eq("status", "complete"))
      .order("desc")
      .take(limit);
    for (const submission of submissions) {
      if (!hasFormOrderTotal(submission)) continue;
      await ctx.runMutation(internal.purchases.internals.syncFormOrder, {
        submissionId: submission._id,
      });
      counts.formOrders++;
    }

    const intents = await ctx.db
      .query("commerce_subscription_checkout_intents")
      .withIndex("by_status", (q: any) => q.eq("status", "activated"))
      .order("desc")
      .take(limit);
    for (const intent of intents) {
      await ctx.runMutation(internal.purchases.internals.syncSubscriptionCheckoutIntent, {
        intentId: intent._id,
      });
      counts.subscriptionSignups++;
    }

    const invoices = await ctx.db
      .query("commerce_subscription_invoices")
      .withIndex("by_status", (q: any) => q.eq("status", "paid"))
      .order("desc")
      .take(limit);
    const openInvoices = await ctx.db
      .query("commerce_subscription_invoices")
      .withIndex("by_status", (q: any) => q.eq("status", "open"))
      .order("desc")
      .take(limit);
    for (const invoice of [...invoices, ...openInvoices].slice(0, limit)) {
      await ctx.runMutation(internal.purchases.internals.syncSubscriptionInvoice, {
        invoiceId: invoice._id,
      });
      counts.subscriptionInvoices++;
    }

    return counts;
  },
});
