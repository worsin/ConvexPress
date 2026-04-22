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

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveServiceKey } from "../helpers/serviceKeys";

// ─── Charge result shape ────────────────────────────────────────────────────

export interface SubscriptionChargeResult {
  success: boolean;
  transactionId?: string;
  failureReason?: string;
  requiresAction?: boolean; // 3DS / off-session recovery required
}

// ─── Settings: live charging gate ───────────────────────────────────────────

/**
 * Live charging is gated by a settings flag so we can deploy the action
 * and leave the stub path in effect until the admin operator explicitly
 * flips it on. Key lives under `commerce.payments` alongside Stripe creds.
 */
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

async function getStripeSecretKey(ctx: any): Promise<string | undefined> {
  const settings = await ctx.runQuery(
    internal.settings.httpInternals.getBySectionInternal,
    { section: "commerce.payments" },
  );
  const values = (settings?.values ?? settings) as
    | Record<string, unknown>
    | null
    | undefined;
  return resolveServiceKey(values, "stripeSecretKey", "STRIPE_SECRET_KEY");
}

// ═══════════════════════════════════════════════════════════════════════════
// chargeSubscriptionInvoice — real off-session charge
// ═══════════════════════════════════════════════════════════════════════════

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const chargeSubscriptionInvoice = internalAction({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    invoiceId: v.id("commerce_subscription_invoices"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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

    const invoice = (await ctx.runQuery(
      internal.commerceSubscriptions.internals.getInvoiceForRenewal,
      { invoiceId: args.invoiceId },
    )) as {
      _id: string;
      totalAmount: number;
      currencyCode: string;
      savedPaymentMethodId?: string;
      stripeCustomerId?: string;
      subscriptionId: string;
      manualBilling?: boolean;
      email?: string;
    } | null;

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
    } catch (err: any) {
      // Stripe decline errors carry decline_code / code / message.
      const failureReason =
        err?.code || err?.decline_code || err?.type || "stripe_error";
      console.error(
        `[stripeCharge] Invoice ${args.invoiceId} charge failed:`,
        err?.message || err,
      );
      const result: SubscriptionChargeResult = {
        success: false,
        failureReason,
        transactionId: err?.payment_intent?.id,
      };
      await writeResult(ctx, args.invoiceId, result);
      return result;
    }
  },
});

async function writeResult(
  ctx: any,
  invoiceId: any,
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
// saveSetupIntentResult — called from webhook when a setup_intent succeeds
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Attach a saved payment method to a checkout intent after Stripe's
 * `setup_intent.succeeded` fires. Idempotent: if the intent already has
 * a saved PM, we no-op.
 */
// ═══════════════════════════════════════════════════════════════════════════
// beginSubscriptionFirstCharge — signup-time Stripe PaymentIntent
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Called by the website's subscription signup form after
 * `createCheckoutIntent` has returned a `checkoutIntentId`. Creates a Stripe
 * Customer (or finds by email) and a PaymentIntent with
 * `setup_future_usage: "off_session"` so the same payment method can be
 * used for renewals. Returns the client_secret for Stripe Elements to
 * confirm client-side. On `payment_intent.succeeded`, the webhook activates
 * the checkout intent into a real subscription.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const beginSubscriptionFirstCharge = internalAction({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    checkoutIntentId: v.id("commerce_subscription_checkout_intents"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (
    ctx,
    args,
  ): Promise<{
    clientSecret: string | null;
    paymentIntentId: string;
    amount: number;
    currency: string;
    stripeCustomerId: string;
  }> => {
    const stripeKey = await getStripeSecretKey(ctx);
    if (!stripeKey) {
      throw new Error("stripe_not_configured");
    }

    const intent: {
      _id: string;
      email?: string;
      initialAmount: number;
      currencyCode: string;
    } | null = (await ctx.runQuery(
      internal.commerceSubscriptions.internals.getCheckoutIntentForCharge,
      { checkoutIntentId: args.checkoutIntentId },
    )) as any;

    if (!intent) throw new Error("checkout_intent_not_found");
    if (!intent.email) throw new Error("missing_email_on_intent");
    if (intent.initialAmount <= 0) {
      // Free trial or $0 initial — no Stripe charge needed. Caller should
      // proceed directly to activateFromIntent with a zero-amount result.
      throw new Error("no_charge_needed_free_initial_amount");
    }

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
    };
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const saveSetupIntentResult = internalAction({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    checkoutIntentId: v.id("commerce_subscription_checkout_intents"),
    stripeCustomerId: v.string(),
    paymentMethodId: v.string(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args): Promise<void> => {
    await ctx.runMutation(
      (internal.commerceSubscriptions.internals as any)
        .recordSavedPaymentMethod,
      {
        checkoutIntentId: args.checkoutIntentId,
        stripeCustomerId: args.stripeCustomerId,
        paymentMethodId: args.paymentMethodId,
      },
    );
  },
});
