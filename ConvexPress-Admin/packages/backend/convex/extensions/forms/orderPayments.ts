import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalMutation, internalQuery } from "../../_generated/server";

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
      .withIndex("by_entity", (q: any) =>
        q
          .eq("entityType", "form_submission")
          .eq("entityId", submission._id as string),
      )
      .collect();
    for (const row of rows) values[row.fieldKey] = row.value;

    const fields = form.fieldGroupId
      ? await ctx.db
          .query("fieldDefinitions")
          .withIndex("by_group", (q: any) => q.eq("groupId", form.fieldGroupId))
          .collect()
      : [];

    return {
      formId: form._id,
      formTitle: form.title,
      submissionId: submission._id,
      amount,
      currency: normalizeCurrency(pricing?.currency),
      lineItems: Array.isArray(pricing?.lineItems) ? pricing.lineItems : [],
      existingPaymentIntentId:
        typeof meta.orderPayment?.paymentIntentId === "string"
          ? meta.orderPayment.paymentIntentId
          : null,
      customerEmail: findCustomerEmail(fields, values) ?? null,
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
    await ctx.db.patch(args.submissionId, {
      meta: JSON.stringify(meta),
      updatedAt: Date.now(),
    });
    await ctx.runMutation((internal as any).purchases.internals.syncFormOrder, {
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
    await ctx.db.patch(args.submissionId, {
      meta: JSON.stringify(meta),
      updatedAt: Date.now(),
    });
    await ctx.runMutation((internal as any).purchases.internals.syncFormOrder, {
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
    await ctx.db.patch(args.submissionId, {
      meta: JSON.stringify(meta),
      updatedAt: Date.now(),
    });
    await ctx.runMutation((internal as any).purchases.internals.syncFormOrder, {
      submissionId: args.submissionId,
      paymentIntentId: args.paymentIntentId,
      provider: "stripe",
      status: "failed",
      error: args.error,
      eventType: "form_order_payment_failed",
    });
  },
});
