import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalMutation, internalQuery } from "../../_generated/server";
import { readMergedSettingsSection } from "../../settings/read";
import { parsePricingLineItems } from "./pricingSnapshot";

interface StoredPricing {
  oneTime: number;
  currency?: string;
  lineItems?: unknown[];
}

interface MetaBag {
  pricing?: StoredPricing;
  orderPayment?: Record<string, unknown>;
  [key: string]: unknown;
}

function parseMeta(meta: string | undefined): MetaBag {
  if (!meta) return {};
  try {
    const parsed = JSON.parse(meta);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as MetaBag)
      : {};
  } catch {
    return {};
  }
}

function normalizeCurrency(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.trim().toUpperCase()
    : "USD";
}

function findCustomerEmail(
  fields: Array<{ key: string; type: string }>,
  values: Record<string, string>,
): string | undefined {
  for (const field of fields) {
    if (field.type !== "email") continue;
    const email = values[field.key]?.trim();
    if (email && email.includes("@")) return email;
  }
  for (const value of Object.values(values)) {
    const email = value.trim();
    if (email.includes("@") && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return email;
    }
  }
  return undefined;
}

export const getOrderPaymentSource = internalQuery({
  args: { submissionId: v.id("form_submissions") },
  returns: v.union(v.null(), v.object({
    formId: v.id("forms"),
    formTitle: v.string(),
    submissionId: v.id("form_submissions"),
    amount: v.number(),
    currency: v.string(),
    lineItems: v.array(v.object({
      source: v.union(v.literal("product"), v.literal("choice"), v.literal("calculation")),
      fieldKey: v.string(),
      fieldLabel: v.string(),
      label: v.string(),
      amount: v.number(),
      priceKind: v.union(v.literal("recurring"), v.literal("oneTime")),
      choiceValue: v.optional(v.string()),
      quantity: v.optional(v.number()),
      interval: v.optional(v.union(v.literal("year"), v.literal("month"))),
      recurringLabel: v.optional(v.string()),
      firstPeriodAmount: v.optional(v.number()),
    })),
    existingPaymentIntentId: v.union(v.null(), v.string()),
    customerEmail: v.union(v.null(), v.string()),
  })),
  handler: async (ctx, { submissionId }) => {
    const submission = await ctx.db.get(submissionId);
    if (!submission || submission.status !== "complete") return null;

    const form = await ctx.db.get(submission.formId);
    if (!form) return null;

    const settings = parseMeta(form.settings);
    const orderForm =
      settings.orderForm &&
      typeof settings.orderForm === "object" &&
      !Array.isArray(settings.orderForm)
        ? (settings.orderForm as { enabled?: unknown })
        : {};
    if (orderForm.enabled !== true) return null;

    const meta = parseMeta(submission.meta);
    const pricing = meta.pricing;
    const amount =
      pricing && Number.isInteger(pricing.oneTime) && pricing.oneTime > 0
        ? pricing.oneTime
        : 0;
    if (amount <= 0) return null;

    const values: Record<string, string> = {};
    const rows = await ctx.db
      .query("fieldValues")
      .withIndex("by_entity", (q) =>
        q
          .eq("entityType", "form_submission")
          .eq("entityId", submission._id),
      )
      .collect();
    for (const row of rows) values[row.fieldKey] = row.value;

    const fieldGroupId = form.fieldGroupId;
    const fields = fieldGroupId
      ? await ctx.db
          .query("fieldDefinitions")
          .withIndex("by_group", (q) => q.eq("groupId", fieldGroupId))
          .collect()
      : [];

    return {
      formId: form._id,
      formTitle: form.title,
      submissionId: submission._id,
      amount,
      currency: normalizeCurrency(pricing?.currency),
      lineItems: parsePricingLineItems(pricing?.lineItems),
      existingPaymentIntentId:
        typeof meta.orderPayment?.paymentIntentId === "string"
          ? meta.orderPayment.paymentIntentId
          : null,
      customerEmail: findCustomerEmail(fields, values) ?? null,
    };
  },
});

/**
 * The `commerce.payments` keys the form order-payment action needs, read with
 * defaults merged. Actions cannot read the database directly.
 */
export const getOrderPaymentStripeSettings = internalQuery({
  args: {},
  returns: v.object({
    publishableKey: v.string(),
    stripeSecretKey: v.optional(v.string()),
  }),
  handler: async (ctx) => {
    const values = await readMergedSettingsSection(ctx, "commerce.payments");
    const publishableKey = values.stripePublishableKey;
    const stripeSecretKey = values.stripeSecretKey;
    return {
      publishableKey: typeof publishableKey === "string" ? publishableKey.trim() : "",
      stripeSecretKey: typeof stripeSecretKey === "string" ? stripeSecretKey : undefined,
    };
  },
});

export const attachOrderPaymentIntent = internalMutation({
  args: {
    submissionId: v.id("form_submissions"),
    paymentIntentId: v.string(),
    amount: v.number(),
    currency: v.string(),
    status: v.string(),
    returnUrl: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const submission = await ctx.db.get(args.submissionId);
    if (!submission) return;
    const meta = parseMeta(submission.meta);
    meta.orderPayment = {
      ...(meta.orderPayment ?? {}),
      provider: "stripe",
      paymentIntentId: args.paymentIntentId,
      amount: args.amount,
      currency: normalizeCurrency(args.currency),
      status: args.status,
      returnUrl: args.returnUrl,
      customerEmail: args.customerEmail,
      updatedAt: Date.now(),
    };
    await ctx.db.patch("form_submissions", args.submissionId, {
      meta: JSON.stringify(meta),
      updatedAt: Date.now(),
    });
    await ctx.runMutation(internal.purchases.internals.syncFormOrder, {
      submissionId: args.submissionId,
      paymentIntentId: args.paymentIntentId,
      provider: "stripe",
      status: args.status,
      eventType: "form_order_created",
    });
  },
});

export const markOrderPaymentSucceeded = internalMutation({
  args: {
    submissionId: v.id("form_submissions"),
    paymentIntentId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const submission = await ctx.db.get(args.submissionId);
    if (!submission) return;
    const meta = parseMeta(submission.meta);
    meta.orderPayment = {
      ...(meta.orderPayment ?? {}),
      provider: "stripe",
      paymentIntentId: args.paymentIntentId,
      status: "succeeded",
      paidAt: Date.now(),
      updatedAt: Date.now(),
    };
    await ctx.db.patch("form_submissions", args.submissionId, {
      meta: JSON.stringify(meta),
      updatedAt: Date.now(),
    });
    await ctx.runMutation(internal.purchases.internals.syncFormOrder, {
      submissionId: args.submissionId,
      paymentIntentId: args.paymentIntentId,
      provider: "stripe",
      status: "succeeded",
      eventType: "form_order_paid",
    });
  },
});

export const markOrderPaymentFailed = internalMutation({
  args: {
    submissionId: v.id("form_submissions"),
    paymentIntentId: v.string(),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const submission = await ctx.db.get(args.submissionId);
    if (!submission) return;
    const meta = parseMeta(submission.meta);
    meta.orderPayment = {
      ...(meta.orderPayment ?? {}),
      provider: "stripe",
      paymentIntentId: args.paymentIntentId,
      status: "failed",
      error: args.error,
      updatedAt: Date.now(),
    };
    await ctx.db.patch("form_submissions", args.submissionId, {
      meta: JSON.stringify(meta),
      updatedAt: Date.now(),
    });
    await ctx.runMutation(internal.purchases.internals.syncFormOrder, {
      submissionId: args.submissionId,
      paymentIntentId: args.paymentIntentId,
      provider: "stripe",
      status: "failed",
      error: args.error,
      eventType: "form_order_payment_failed",
    });
  },
});
