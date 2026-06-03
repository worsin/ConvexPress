"use node";

import { ConvexError, v } from "convex/values";
import { action } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { getServiceKeyFromAction } from "../../helpers/serviceKeys";

function publicKeyFromSettings(settings: Record<string, unknown> | null): string {
  const value = settings?.stripePublishableKey;
  return typeof value === "string" ? value.trim() : "";
}

function normalizeReturnUrl(value: string | undefined): string {
  if (!value) return "/";
  const trimmed = value.trim();
  if (trimmed.startsWith("/")) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : "/";
  } catch {
    return "/";
  }
}

function intentMatchesSource(
  intent: { amount?: number; currency?: string; status?: string } | null,
  source: { amount: number; currency: string },
): boolean {
  if (!intent) return false;
  if (intent.amount !== source.amount) return false;
  if ((intent.currency ?? "").toUpperCase() !== source.currency.toUpperCase()) {
    return false;
  }
  return intent.status !== "canceled" && intent.status !== "succeeded";
}

export const beginOrderPayment = action({
  args: {
    submissionId: v.id("form_submissions"),
    returnUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const returnUrl = normalizeReturnUrl(args.returnUrl);
    const source = await ctx.runQuery(
      (internal as any).extensions.forms.orderPayments.getOrderPaymentSource,
      { submissionId: args.submissionId },
    );
    if (!source) {
      throw new ConvexError({
        code: "ORDER_PAYMENT_NOT_AVAILABLE",
        message: "This form submission does not have a payable order total.",
      });
    }

    const paymentSettings = (await ctx.runQuery(
      (internal as any).settings.httpInternals.getBySectionInternal,
      { section: "commerce.payments" },
    )) as Record<string, unknown> | null;
    const publishableKey = publicKeyFromSettings(paymentSettings);
    const stripeSecretKey = await getServiceKeyFromAction(
      ctx,
      "commerce.payments",
      "stripeSecretKey",
      "STRIPE_SECRET_KEY",
    );

    if (!publishableKey || !stripeSecretKey) {
      throw new ConvexError({
        code: "STRIPE_NOT_CONFIGURED",
        message:
          "Stripe is not configured. Set the Stripe publishable and secret keys in Commerce payment settings.",
      });
    }

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeSecretKey);

    let paymentIntent = null;
    let existingStatus: string | undefined;
    if (source.existingPaymentIntentId) {
      try {
        const existing = await stripe.paymentIntents.retrieve(
          source.existingPaymentIntentId,
        );
        existingStatus = existing.status;
        paymentIntent = intentMatchesSource(existing, source) ? existing : null;
      } catch {
        paymentIntent = null;
      }
    }
    if (existingStatus === "succeeded") {
      throw new ConvexError({
        code: "ORDER_ALREADY_PAID",
        message: "This order has already been paid.",
      });
    }

    if (!paymentIntent) {
      paymentIntent = await stripe.paymentIntents.create(
        {
          amount: source.amount,
          currency: source.currency.toLowerCase(),
          automatic_payment_methods: { enabled: true },
          receipt_email: source.customerEmail ?? undefined,
          description: `Form order - ${source.formTitle}`,
          metadata: {
            kind: "form_order_payment",
            formId: String(source.formId),
            submissionId: String(source.submissionId),
            lineItems: JSON.stringify(source.lineItems).slice(0, 450),
          },
        },
        {
          idempotencyKey:
            source.existingPaymentIntentId === null
              ? `form_order_${source.submissionId}_${source.amount}_${source.currency}`
              : `form_order_${source.submissionId}_${source.amount}_${source.currency}_${Date.now()}`,
        },
      );
    }

    if (!paymentIntent.client_secret) {
      throw new ConvexError({
        code: "PAYMENT_INTENT_UNAVAILABLE",
        message: "Stripe did not return a client secret for this payment.",
      });
    }

    await ctx.runMutation(
      (internal as any).extensions.forms.orderPayments.attachOrderPaymentIntent,
      {
        submissionId: args.submissionId,
        paymentIntentId: paymentIntent.id,
        amount: source.amount,
        currency: source.currency,
        status: paymentIntent.status,
        returnUrl,
        customerEmail: source.customerEmail ?? undefined,
      },
    );

    return {
      clientSecret: paymentIntent.client_secret,
      publishableKey,
      mode: "payment" as const,
      returnUrl,
      paymentIntentId: paymentIntent.id,
      amount: source.amount,
      currency: source.currency,
    };
  },
});
