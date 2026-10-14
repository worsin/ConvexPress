"use node";
/**
 * Commerce Subscriptions — Stripe Off-Session Charging (Wave 9)
 *
 * Real-provider charging for subscription invoices. Replaces the
 * `processorStub` path when `commerce.payments.subscriptionChargingEnabled`
 * is `true` in settings.
 *
 * Flow:
 *   - Called by `runRenewalSweep`, `runDunningSweep` and plan-change prorations
 *     with an `invoiceId` and the attempt number.
 *   - Reads the invoice and contract via `getInvoiceForRenewal`; charges only a
 *     payable invoice, on the contract's current saved card.
 *   - Creates a Stripe PaymentIntent with `off_session: true, confirm: true`.
 *     Idempotency key = invoice id + attempt number.
 *   - Records the outcome via `handleInvoicePaymentResult`.
 *
 * Stripe also reports each charge to `/webhooks/stripe`, which routes
 * `metadata.kind === "subscription_invoice"` PaymentIntents to
 * `recordStripeInvoicePayment`. Recording is idempotent, so the second report
 * of a charge changes nothing.
 */

import Stripe from "stripe";
import { v } from "convex/values";

import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { resolveServiceKeyAsync } from "../helpers/serviceKeys";
import { activationResultValidator, type ActivationResult } from "./validators";

// ─── Charge result shape ────────────────────────────────────────────────────

export interface SubscriptionChargeResult {
  success: boolean;
  /** Nothing was charged or recorded: the invoice was not payable here. */
  skipped?: boolean;
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

/**
 * Charge one subscription invoice and record the outcome through
 * `internals.handleInvoicePaymentResult`. The renewal sweep, the dunning sweep
 * and plan-change prorations all charge through here.
 *
 * Nothing is charged unless the invoice is payable (unpaid, not voided, its
 * contract not ended). `attemptNumber` is part of the Stripe idempotency key:
 * each dunning retry is a new charge (and can use a replaced card), while a
 * re-drive of the same attempt returns the charge Stripe already made.
 *
 * With live charging switched off, free invoices settle and paid ones fail
 * closed (`subscription_charging_not_enabled`); nothing is simulated.
 */
export const chargeSubscriptionInvoice = internalAction({
  args: {
    invoiceId: v.id("commerce_subscription_invoices"),
    attemptNumber: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    skipped: v.optional(v.boolean()),
    transactionId: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    requiresAction: v.optional(v.boolean()),
  }),
  handler: async (ctx, args): Promise<SubscriptionChargeResult> => {
    const invoice = await ctx.runQuery(
      internal.commerceSubscriptions.internals.getInvoiceForRenewal,
      { invoiceId: args.invoiceId },
    );
    if (!invoice) {
      return { success: false, skipped: true, failureReason: "invoice_not_found" };
    }
    if (!invoice.payable) {
      return { success: false, skipped: true, failureReason: `invoice_not_payable_${invoice.status}` };
    }
    if (invoice.manualBilling) {
      return { success: false, skipped: true, failureReason: "manual_billing" };
    }

    if (invoice.totalAmount === 0) {
      return await record(ctx, args.invoiceId, {
        success: true,
        transactionId: `free_${String(args.invoiceId)}`,
      });
    }

    if (!(await isLiveChargingEnabled(ctx))) {
      return await record(ctx, args.invoiceId, {
        success: false,
        failureReason: invoice.savedPaymentMethodId
          ? "subscription_charging_not_enabled"
          : "no_payment_method_on_file",
      });
    }

    const stripeKey = await getStripeSecretKey(ctx);
    if (!stripeKey) {
      return await record(ctx, args.invoiceId, { success: false, failureReason: "stripe_not_configured" });
    }
    if (!invoice.savedPaymentMethodId || !invoice.stripeCustomerId) {
      return await record(ctx, args.invoiceId, { success: false, failureReason: "no_payment_method_on_file" });
    }

    const attemptNumber = args.attemptNumber ?? 1;
    try {
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
            attemptNumber: String(attemptNumber),
          },
        },
        { idempotencyKey: `sub_inv_${String(args.invoiceId)}_${attemptNumber}` },
      );

      if (paymentIntent.status === "succeeded") {
        return await record(ctx, args.invoiceId, { success: true, transactionId: paymentIntent.id });
      }
      if (paymentIntent.status === "requires_action") {
        return await record(ctx, args.invoiceId, {
          success: false,
          failureReason: "authentication_required",
          requiresAction: true,
          transactionId: paymentIntent.id,
        });
      }
      return await record(ctx, args.invoiceId, {
        success: false,
        failureReason: `unexpected_status_${paymentIntent.status}`,
        transactionId: paymentIntent.id,
      });
    } catch (err) {
      const failure = describeStripeFailure(err);
      console.error(`[stripeCharge] Invoice ${args.invoiceId} charge failed:`, failure.message ?? err);
      return await record(ctx, args.invoiceId, {
        success: false,
        failureReason: failure.failureReason,
        transactionId: failure.paymentIntentId,
      });
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

async function record(
  ctx: Pick<ActionCtx, "runMutation">,
  invoiceId: Id<"commerce_subscription_invoices">,
  result: SubscriptionChargeResult,
): Promise<SubscriptionChargeResult> {
  await ctx.runMutation(
    internal.commerceSubscriptions.internals.handleInvoicePaymentResult,
    {
      invoiceId,
      succeeded: result.success,
      paymentTransactionId: result.transactionId,
      failureReason: result.failureReason,
    },
  );
  return result;
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
