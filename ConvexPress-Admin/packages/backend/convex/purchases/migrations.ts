import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { mutation } from "../_generated/server";
import { requireCan } from "../helpers/permissions";

type JsonBag = Record<string, unknown>;

function isJsonBag(value: unknown): value is JsonBag {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonBag(value: unknown): JsonBag {
  if (!value) return {};
  if (isJsonBag(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return isJsonBag(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function hasFormOrderTotal(submission: Doc<"form_submissions">): boolean {
  const meta = parseJsonBag(submission.meta);
  const pricing = parseJsonBag(meta.pricing);
  const oneTime = pricing.oneTime;
  return typeof oneTime === "number" && Number.isInteger(oneTime) && oneTime > 0;
}

export const repairLedger = mutation({
  args: {
    limit: v.optional(v.number()),
    includeEmailTemplates: v.optional(v.boolean()),
  },
  returns: v.object({
    commerceOrders: v.number(),
    formOrders: v.number(),
    subscriptionSignups: v.number(),
    subscriptionInvoices: v.number(),
    emailTemplatesCreated: v.number(),
    emailTemplatesUpdated: v.number(),
  }),
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
      .withIndex("by_status", (q) => q.eq("status", "complete"))
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
      .withIndex("by_status", (q) => q.eq("status", "activated"))
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
      .withIndex("by_status", (q) => q.eq("status", "paid"))
      .order("desc")
      .take(limit);
    const openInvoices = await ctx.db
      .query("commerce_subscription_invoices")
      .withIndex("by_status", (q) => q.eq("status", "open"))
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
