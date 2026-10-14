"use node";
/**
 * Commerce Subscriptions — Stripe Off-Session Charging (Wave 9)
 *
 * Real-provider charging for subscription invoices. Replaces the
 * `processorStub` path when `commerce.payments.subscriptionChargingEnabled`
 * is `true` in settings.
 *
 * Flow:
 *   - Called by `runRenewalSweep`, `runDunningSweep`, and proration helpers
 *     with a single `invoiceId`.
 *   - Reads the invoice + parent subscription via `getInvoiceForRenewal`.
 *   - Creates a Stripe PaymentIntent with `off_session: true, confirm: true`
 *     using the saved `payment_method` on the contract.
 *   - Idempotency key = invoice id — Stripe dedupes retries.
 *   - Persists the charge result via `handleInvoicePaymentResult`.
 *
 * Webhook-driven async confirmations (3DS, delayed-capture) land on
 * `/webhooks/stripe` and route back to `handleInvoicePaymentResult` by
 * PaymentIntent `metadata.kind === "subscription_invoice"`.
 */

import { v } from "convex/values";

import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { resolveServiceKeyAsync } from "../helpers/serviceKeys";
import { activationResultValidator, type ActivationResult } from "./validators";

// ─── Charge result shape ────────────────────────────────────────────────────

export interface SubscriptionChargeResult {
  success: boolean;
  transactionId?: string;
  failureReason?: string;
  requiresAction?: boolean; // 3DS / off-session recovery required
}

// ─── Settings: live charging gate ───────────────────────────────────────────

/**
 * Live charging is gated by a settings flag so deployments can keep paid
 * subscription charging disabled until the admin operator explicitly flips it
 * on. Key lives under `commerce.payments` alongside Stripe creds.
 */
async function isLiveChargingEnabled(ctx: Pick<ActionCtx, "runQuery">): Promise<boolean> {
  const settings = await ctx.runQuery(
    internal.commerceSubscriptions.internals.getPaymentChargingSettings,
    {},
  );
  return settings.subscriptionChargingEnabled;
}

/** The Stripe secret key: `commerce.payments` settings first, then the env. */
export async function getStripeSecretKey(ctx: Pick<ActionCtx, "runQuery">): Promise<string | undefined> {
  const settings = await ctx.runQuery(
    internal.commerceSubscriptions.internals.getPaymentChargingSettings,
    {},
  );
  return await resolveServiceKeyAsync(
    { stripeSecretKey: settings.stripeSecretKey },
    "stripeSecretKey",
    "STRIPE_SECRET_KEY",
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// chargeSubscriptionInvoice — real off-session charge
// ═══════════════════════════════════════════════════════════════════════════

export const chargeSubscriptionInvoice = internalAction({
  args: {
    invoiceId: v.id("commerce_subscription_invoices"),
  },
  returns: v.object({
    success: v.boolean(),
    transactionId: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    requiresAction: v.optional(v.boolean()),
  }),
  handler: async (ctx, args): Promise<SubscriptionChargeResult> => {
    const live = await isLiveChargingEnabled(ctx);
    if (!live) {
      return {
        success: false,
        failureReason: "live_charging_disabled",
      };
    }

    const stripeKey = await getStripeSecretKey(ctx);
    if (!stripeKey) {
      await writeResult(ctx, args.invoiceId, {
        success: false,
        failureReason: "stripe_not_configured",
      });
      return { success: false, failureReason: "stripe_not_configured" };
    }

    const invoice = await ctx.runQuery(
      internal.commerceSubscriptions.internals.getInvoiceForRenewal,
      { invoiceId: args.invoiceId },
    );

    if (!invoice) {
      return { success: false, failureReason: "invoice_not_found" };
    }

    // Free-tier invoices skip Stripe entirely.
    if (invoice.totalAmount === 0) {
      const result: SubscriptionChargeResult = {
        success: true,
        transactionId: `free_${Date.now()}`,
      };
      await writeResult(ctx, args.invoiceId, result);
      return result;
    }

    if (invoice.manualBilling) {
      return { success: false, failureReason: "manual_billing" };
    }

    if (!invoice.savedPaymentMethodId || !invoice.stripeCustomerId) {
      const result: SubscriptionChargeResult = {
        success: false,
        failureReason: "no_payment_method_on_file",
      };
      await writeResult(ctx, args.invoiceId, result);
      return result;
    }

    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(stripeKey);

      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount: invoice.totalAmount,
          currency: invoice.currencyCode.toLowerCase(),
          customer: invoice.stripeCustomerId,
          payment_method: invoice.savedPaymentMethodId,
          off_session: true,
          confirm: true,
          receipt_email: invoice.email,
          metadata: {
            kind: "subscription_invoice",
            invoiceId: String(args.invoiceId),
            subscriptionId: String(invoice.subscriptionId),
          },
        },
        { idempotencyKey: `sub_inv_${String(args.invoiceId)}` },
      );

      if (paymentIntent.status === "succeeded") {
        const result: SubscriptionChargeResult = {
          success: true,
          transactionId: paymentIntent.id,
        };
        await writeResult(ctx, args.invoiceId, result);
        return result;
      }

      if (paymentIntent.status === "requires_action") {
        // Off-session 3DS recovery. The customer must revisit the portal
        // to confirm; the webhook finalizes on success. For accounting
        // purposes we treat this as a pending failure so dunning starts.
        const result: SubscriptionChargeResult = {
          success: false,
          failureReason: "authentication_required",
          requiresAction: true,
          transactionId: paymentIntent.id,
        };
        await writeResult(ctx, args.invoiceId, result);
        return result;
      }

      const result: SubscriptionChargeResult = {
        success: false,
        failureReason: `unexpected_status_${paymentIntent.status}`,
        transactionId: paymentIntent.id,
      };
      await writeResult(ctx, args.invoiceId, result);
      return result;
    } catch (err) {
      // Stripe decline errors carry decline_code / code / message.
      const failure = describeStripeFailure(err);
      console.error(
        `[stripeCharge] Invoice ${args.invoiceId} charge failed:`,
        failure.message ?? err,
      );
      const result: SubscriptionChargeResult = {
        success: false,
        failureReason: failure.failureReason,
        transactionId: failure.paymentIntentId,
      };
      await writeResult(ctx, args.invoiceId, result);
      return result;
    }
  },
});

function nonEmptyStringField(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.length > 0 ? field : undefined;
}

/** Reads the fields Stripe puts on a thrown StripeError without trusting its shape. */
function describeStripeFailure(err: unknown): {
  failureReason: string;
  message?: string;
  paymentIntentId?: string;
} {
  const paymentIntent =
    typeof err === "object" && err !== null
      ? (err as Record<string, unknown>).payment_intent
      : undefined;
  return {
    failureReason:
      nonEmptyStringField(err, "code") ??
      nonEmptyStringField(err, "decline_code") ??
      nonEmptyStringField(err, "type") ??
      "stripe_error",
    message: nonEmptyStringField(err, "message"),
    paymentIntentId: nonEmptyStringField(paymentIntent, "id"),
  };
}

async function writeResult(
  ctx: Pick<ActionCtx, "runMutation">,
  invoiceId: Id<"commerce_subscription_invoices">,
  result: SubscriptionChargeResult,
): Promise<void> {
  await ctx.runMutation(
    internal.commerceSubscriptions.internals.handleInvoicePaymentResult,
    {
      invoiceId,
      succeeded: result.success,
      paymentTransactionId: result.transactionId,
      failureReason: result.failureReason,
    },
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// beginSubscriptionFirstCharge — signup-time Stripe PaymentIntent
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Called by the website's subscription signup form after
 * `createCheckoutIntent` has returned a `checkoutIntentId`. Creates a Stripe
 * Customer (or finds by email) and a PaymentIntent with
 * `setup_future_usage: "off_session"` so the same payment method can be
 * used for renewals. Returns the client_secret for Stripe Elements to
 * confirm client-side. Once Stripe settles, the checkout intent is activated
 * by whichever verified path arrives first: the `payment_intent.succeeded` /
 * `setup_intent.succeeded` webhook, or `publicCharge.confirmFirstCharge`.
 */
export const beginSubscriptionFirstCharge = internalAction({
  args: {
    checkoutIntentId: v.id("commerce_subscription_checkout_intents"),
  },
	returns: v.object({
   clientSecret: v.union(v.null(), v.string()),
   paymentIntentId: v.string(),
   amount: v.number(),
   currency: v.string(),
   stripeCustomerId: v.string(),
   mode: v.union(v.literal("payment"), v.literal("setup")),
 }),
	handler: async (
		ctx,
		args,
	): Promise<{
		clientSecret: string | null;
		paymentIntentId: string;
		amount: number;
		currency: string;
		stripeCustomerId: string;
		mode: "payment" | "setup";
	}> => {
    const stripeKey = await getStripeSecretKey(ctx);
    if (!stripeKey) {
      throw new Error("stripe_not_configured");
    }

    const intent = await ctx.runQuery(
      internal.commerceSubscriptions.internals.getCheckoutIntentForCharge,
      { checkoutIntentId: args.checkoutIntentId },
    );

    if (!intent) throw new Error("checkout_intent_not_found");
    // An activated, failed or expired intent must never take another payment.
    if (intent.status !== "payment_pending" && intent.status !== "draft") {
      throw new Error("checkout_intent_not_payable");
    }
    if (!intent.email) throw new Error("missing_email_on_intent");

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey);

    // Find or create Stripe Customer.
    let stripeCustomerId: string;
    const existing = await stripe.customers.list({
      email: intent.email,
      limit: 1,
    });
    if (existing.data.length > 0 && existing.data[0]?.id) {
      stripeCustomerId = existing.data[0].id;
    } else {
      const created = await stripe.customers.create({ email: intent.email });
      stripeCustomerId = created.id;
    }

    if (intent.initialAmount <= 0) {
      if ((intent.recurringAmount ?? 0) <= 0) {
        // Truly free checkout: no payment method is needed.
        throw new Error("no_charge_needed_free_initial_amount");
      }

      const setupIntent = await stripe.setupIntents.create(
        {
          customer: stripeCustomerId,
          automatic_payment_methods: { enabled: true },
          usage: "off_session",
          metadata: {
            kind: "subscription_setup",
            checkoutIntentId: String(args.checkoutIntentId),
          },
        },
        { idempotencyKey: `sub_setup_${String(args.checkoutIntentId)}` },
      );

      await ctx.runMutation(
        internal.commerceSubscriptions.internals.recordFirstChargeIntent,
        {
          checkoutIntentId: args.checkoutIntentId,
          stripeCustomerId,
          paymentIntentId: setupIntent.id,
        },
      );

      return {
        clientSecret: setupIntent.client_secret,
        paymentIntentId: setupIntent.id,
        amount: 0,
        currency: intent.currencyCode,
        stripeCustomerId,
        mode: "setup",
      };
    }

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: intent.initialAmount,
        currency: intent.currencyCode.toLowerCase(),
        customer: stripeCustomerId,
        setup_future_usage: "off_session",
        automatic_payment_methods: { enabled: true },
        receipt_email: intent.email,
        metadata: {
          kind: "subscription_first_charge",
          checkoutIntentId: String(args.checkoutIntentId),
        },
      },
      { idempotencyKey: `sub_first_${String(args.checkoutIntentId)}` },
    );

    await ctx.runMutation(
      internal.commerceSubscriptions.internals.recordFirstChargeIntent,
      {
        checkoutIntentId: args.checkoutIntentId,
        stripeCustomerId,
        paymentIntentId: paymentIntent.id,
      },
    );

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: intent.initialAmount,
      currency: intent.currencyCode,
      stripeCustomerId,
      mode: "payment",
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// saveSetupIntentResult — called from webhook when a setup_intent succeeds
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Called with a verified SetupIntent: from the signature-verified
 * `setup_intent.succeeded` webhook, or from `publicCharge.confirmFirstCharge`
 * after it retrieved the SetupIntent from Stripe. `checkoutIntentRef` is the
 * SetupIntent's `checkoutIntentId` metadata, which the server set in
 * `beginSubscriptionFirstCharge`. Records the saved card, then (for
 * `subscription_setup` SetupIntents) activates the intent through the internal
 * activation, which re-checks the intent is a $0-now intent. Returns the
 * activation, or null when nothing was activated.
 */
export const saveSetupIntentResult = internalAction({
  args: {
    checkoutIntentRef: v.string(),
    stripeCustomerId: v.string(),
    paymentMethodId: v.string(),
    setupIntentId: v.optional(v.string()),
    activateCheckout: v.optional(v.boolean()),
  },
  returns: v.union(v.null(), activationResultValidator),
  handler: async (ctx, args): Promise<ActivationResult | null> => {
    await ctx.runMutation(
      internal.commerceSubscriptions.internals.recordSavedPaymentMethod,
      {
        checkoutIntentRef: args.checkoutIntentRef,
        stripeCustomerId: args.stripeCustomerId,
        paymentMethodId: args.paymentMethodId,
      },
    );
    if (!args.activateCheckout || !args.setupIntentId) return null;
    return await ctx.runMutation(
      internal.commerceSubscriptions.internals.activateCheckoutIntentFromStripeSetup,
      {
        checkoutIntentRef: args.checkoutIntentRef,
        stripeCustomerId: args.stripeCustomerId,
        paymentMethodId: args.paymentMethodId,
        setupIntentId: args.setupIntentId,
      },
    );
  },
});
