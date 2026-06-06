// @ts-nocheck
"use node";

/**
 * Commerce Payment Actions — Stripe & PayPal API Integration
 *
 * Actions that call external payment APIs. These run in a Node.js
 * environment and use dynamic imports for the Stripe SDK, and
 * direct REST API calls for PayPal.
 *
 * Settings-first key resolution:
 *   1. Check settings table for "commerce.payments" section
 *   2. Fall back to process.env
 */

import { ConvexError, v } from "convex/values";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveServiceKey } from "../helpers/serviceKeys";
import { getPayPalBaseUrl } from "./paypalMode";

// ─── Stripe Key Resolution ──────────────────────────────────────────────────

async function getStripeSecretKey(ctx: any): Promise<string> {
  // Fetch commerce.payments settings
  const settings = await ctx.runQuery(
    internal.settings.httpInternals.getBySectionInternal,
    { section: "commerce.payments" },
  );

  const key = resolveServiceKey(
    settings,
    "stripeSecretKey",
    "STRIPE_SECRET_KEY",
  );

  if (!key) {
    throw new ConvexError({
      code: "CONFIGURATION_ERROR",
      message:
        "Stripe secret key is not configured. Set it in Settings > Commerce > Payments or as the STRIPE_SECRET_KEY environment variable.",
    });
  }

  return key;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a Stripe PaymentIntent and update the transaction record.
 *
 * Scheduled by `initiatePayment` mutation. Calls Stripe API, then
 * writes the paymentIntentId and clientSecret back to the transaction.
 *
 * Supports:
 *   - Standard new-card flows
 *   - Saved payment methods (savedMethodId)
 *   - Save-card-for-later (saveMethod — sets up Stripe Customer + setup_future_usage)
 *   - Handles requires_action (3DS) and canceled statuses
 */
export const createStripeIntent = internalAction({
  args: {
    transactionId: v.id("commerce_payment_transactions"),
    orderId: v.id("commerce_orders"),
    amount: v.number(),
    currency: v.string(),
    email: v.optional(v.string()),
    saveMethod: v.optional(v.boolean()),
    savedMethodId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workflow = await ctx.runMutation(internal.commerce.workflows.beginInternal, {
      workflowKey: "commerce.payment_intent.create",
      idempotencyKey: String(args.transactionId),
      entityType: "commerce_payment_transactions",
      entityId: String(args.transactionId),
      input: {
        orderId: args.orderId,
        amount: args.amount,
        currency: args.currency,
        email: args.email,
      },
      lockedUntil: Date.now() + 5 * 60 * 1000,
    });
    if (workflow.existing && workflow.status === "completed") {
      return workflow.result;
    }
    if (workflow.existing && workflow.status === "running") {
      return { skipped: true, reason: "payment_intent_create_already_running" };
    }

    let stripeKey: string;
    try {
      stripeKey = await getStripeSecretKey(ctx);
    } catch (error: any) {
      console.error("[Payments] Stripe key not configured:", error.message);
      await ctx.runMutation(
        internal.commerce.payments.confirmPaymentFailure,
        {
          providerTransactionId: String(args.transactionId),
          provider: "stripe",
          error: "Stripe is not configured.",
        },
      );
      await ctx.runMutation(internal.commerce.workflows.failInternal, {
        runId: workflow.runId,
        error: "Stripe is not configured.",
      });
      return;
    }

    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(stripeKey);

      // Get or create Stripe Customer if saving method or using saved method
      let stripeCustomerId: string | undefined;
      if ((args.saveMethod || args.savedMethodId) && args.email) {
        const customers = await stripe.customers.list({
          email: args.email,
          limit: 1,
        });

        if (customers.data.length > 0) {
          stripeCustomerId = customers.data[0]?.id;
        } else {
          const customer = await stripe.customers.create({
            email: args.email,
          });
          stripeCustomerId = customer.id;
        }
      }

      // Create PaymentIntent with appropriate options
      const paymentIntent = await stripe.paymentIntents.create({
        amount: args.amount, // Already in cents
        currency: args.currency.toLowerCase(),
        customer: stripeCustomerId,
        payment_method: args.savedMethodId || undefined,
        confirm: args.savedMethodId ? true : undefined,
        setup_future_usage: args.saveMethod ? "on_session" : undefined,
        automatic_payment_methods: args.savedMethodId
          ? undefined
          : { enabled: true },
        receipt_email: args.email || undefined,
        metadata: {
          orderId: args.orderId,
          transactionId: String(args.transactionId),
        },
      });

      // Update the transaction record with Stripe details
      await ctx.runMutation(
        internal.commerce.payments.updateTransactionProvider,
        {
          transactionId: args.transactionId,
          providerTransactionId: paymentIntent.id,
          clientSecret: paymentIntent.client_secret ?? undefined,
        },
      );

      // Handle different PaymentIntent statuses
      if (paymentIntent.status === "succeeded") {
        await ctx.runMutation(
          internal.commerce.payments.confirmPaymentSuccess,
          {
            providerTransactionId: paymentIntent.id,
            provider: "stripe",
          },
        );
      } else if (
        paymentIntent.status === "requires_action" ||
        paymentIntent.status === "requires_payment_method"
      ) {
        // 3DS or additional action required — frontend handles via clientSecret.
        // Log but don't fail; the webhook will handle the final status.
        console.log(
          `[Payments] Stripe intent ${paymentIntent.id} status: ${paymentIntent.status}`,
        );
      } else if (paymentIntent.status === "canceled") {
        await ctx.runMutation(
          internal.commerce.payments.confirmPaymentFailure,
          {
            providerTransactionId: paymentIntent.id,
            provider: "stripe",
            error: "Payment was canceled.",
          },
        );
      }

      const result = {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
      };
      await ctx.runMutation(internal.commerce.workflows.completeInternal, {
        runId: workflow.runId,
        result,
      });
      return result;
    } catch (error: any) {
      console.error("[Payments] Stripe PaymentIntent creation failed:", error);

      const transaction = await ctx.runQuery(
        internal.commerce.payments.getTransactionInternal,
        { transactionId: args.transactionId },
      );

      const providerTxnId =
        transaction?.providerTransactionId || String(args.transactionId);

      await ctx.runMutation(
        internal.commerce.payments.confirmPaymentFailure,
        {
          providerTransactionId: providerTxnId,
          provider: "stripe",
          error: error.message || "Failed to create payment intent",
        },
      );
      await ctx.runMutation(internal.commerce.workflows.failInternal, {
        runId: workflow.runId,
        error: error.message || "Failed to create payment intent",
      });
    }
  },
});

/**
 * Process a Stripe refund.
 *
 * Scheduled by `processRefund` mutation.
 */
export const processStripeRefund = internalAction({
  args: {
    refundId: v.id("commerce_payment_refunds"),
    transactionId: v.id("commerce_payment_transactions"),
    providerTransactionId: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const workflow = await ctx.runMutation(internal.commerce.workflows.beginInternal, {
      workflowKey: "commerce.refund.create",
      idempotencyKey: String(args.refundId),
      entityType: "commerce_payment_refunds",
      entityId: String(args.refundId),
      input: {
        transactionId: args.transactionId,
        providerTransactionId: args.providerTransactionId,
        amount: args.amount,
      },
      lockedUntil: Date.now() + 5 * 60 * 1000,
    });
    if (workflow.existing && workflow.status === "completed") {
      return workflow.result;
    }
    if (workflow.existing && workflow.status === "running") {
      return { skipped: true, reason: "refund_create_already_running" };
    }

    let stripeKey: string;
    try {
      stripeKey = await getStripeSecretKey(ctx);
    } catch (error: any) {
      console.error("[Payments] Stripe key not configured:", error.message);
      await ctx.runMutation(internal.commerce.payments.completeRefund, {
        refundId: args.refundId,
        transactionId: args.transactionId,
        providerRefundId: "",
        amount: args.amount,
        success: false,
        error: "Stripe is not configured.",
      });
      await ctx.runMutation(internal.commerce.workflows.failInternal, {
        runId: workflow.runId,
        error: "Stripe is not configured.",
      });
      return;
    }

    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(stripeKey);

      const refund = await stripe.refunds.create({
        payment_intent: args.providerTransactionId,
        amount: args.amount,
      });

      await ctx.runMutation(internal.commerce.payments.completeRefund, {
        refundId: args.refundId,
        transactionId: args.transactionId,
        providerRefundId: refund.id,
        amount: args.amount,
        success: refund.status === "succeeded",
        error:
          refund.status !== "succeeded"
            ? `Refund status: ${refund.status}`
            : undefined,
      });
      const result = { providerRefundId: refund.id, status: refund.status };
      await ctx.runMutation(internal.commerce.workflows.completeInternal, {
        runId: workflow.runId,
        result,
      });
      return result;
    } catch (error: any) {
      console.error("[Payments] Stripe refund failed:", error);
      await ctx.runMutation(internal.commerce.payments.completeRefund, {
        refundId: args.refundId,
        transactionId: args.transactionId,
        providerRefundId: "",
        amount: args.amount,
        success: false,
        error: error.message || "Failed to process refund",
      });
      await ctx.runMutation(internal.commerce.workflows.failInternal, {
        runId: workflow.runId,
        error: error.message || "Failed to process refund",
      });
    }
  },
});

// ─── PayPal Key Resolution ────────────────────────────────────────────────

async function getPayPalCredentials(ctx: any): Promise<{
  clientId: string;
  clientSecret: string;
  mode: string;
}> {
  const settings = await ctx.runQuery(
    internal.settings.httpInternals.getBySectionInternal,
    { section: "commerce.payments" },
  );

  const clientId = resolveServiceKey(
    settings,
    "paypalClientId",
    "PAYPAL_CLIENT_ID",
  );
  const clientSecret = resolveServiceKey(
    settings,
    "paypalClientSecret",
    "PAYPAL_CLIENT_SECRET",
  );
  const mode =
    resolveServiceKey(settings, "paypalMode", "PAYPAL_MODE") || "sandbox";

  if (!clientId || !clientSecret) {
    throw new ConvexError({
      code: "CONFIGURATION_ERROR",
      message:
        "PayPal credentials are not configured. Set them in Settings > Commerce > Payments or as environment variables.",
    });
  }

  return { clientId, clientSecret, mode };
}

async function getPayPalAccessToken(
  clientId: string,
  clientSecret: string,
  baseUrl: string,
): Promise<string> {
  const authResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!authResponse.ok) {
    throw new Error(
      `PayPal OAuth failed: ${authResponse.status} ${await authResponse.text()}`,
    );
  }

  const authData = (await authResponse.json()) as { access_token?: string };
  if (!authData.access_token) {
    throw new Error("PayPal OAuth response missing access_token");
  }

  return authData.access_token;
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYPAL ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a PayPal order.
 *
 * Uses PayPal REST API (not SDK) to create an order with purchase units.
 * Returns orderId and approvalUrl.
 */
export const createPayPalOrderAction = internalAction({
  args: {
    transactionId: v.id("commerce_payment_transactions"),
    orderId: v.id("commerce_orders"),
    amount: v.number(),
    currency: v.string(),
  },
  handler: async (ctx, args) => {
    let credentials: { clientId: string; clientSecret: string; mode: string };
    try {
      credentials = await getPayPalCredentials(ctx);
    } catch (error: any) {
      console.error("[Payments] PayPal not configured:", error.message);
      await ctx.runMutation(
        internal.commerce.payments.confirmPaymentFailure,
        {
          providerTransactionId: String(args.transactionId),
          provider: "paypal",
          error: "PayPal is not configured.",
        },
      );
      return;
    }

    try {
      const baseUrl = getPayPalBaseUrl(credentials.mode);
      const accessToken = await getPayPalAccessToken(
        credentials.clientId,
        credentials.clientSecret,
        baseUrl,
      );

      // Convert cents to dollars for PayPal
      const amountInDollars = (args.amount / 100).toFixed(2);

      // Read site URL for return/cancel URLs
      const siteSettings = await ctx.runQuery(
        internal.settings.httpInternals.getBySectionInternal,
        { section: "general" },
      );
      const siteUrl =
        (siteSettings as Record<string, unknown> | null)?.siteUrl ||
        process.env.SITE_URL ||
        "";

      // Create PayPal order
      const orderResponse = await fetch(`${baseUrl}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              amount: {
                currency_code: args.currency,
                value: amountInDollars,
              },
              custom_id: String(args.transactionId),
            },
          ],
          application_context: {
            return_url: `${siteUrl}/checkout/paypal/return`,
            cancel_url: `${siteUrl}/checkout/paypal/cancel`,
          },
        }),
      });

      const order = (await orderResponse.json()) as {
        id?: string;
        links?: Array<{ rel: string; href: string }>;
        message?: string;
      };

      if (order.id) {
        const approvalUrl = order.links?.find(
          (l) => l.rel === "approve",
        )?.href;

        // Update transaction with PayPal order ID
        await ctx.runMutation(
          internal.commerce.payments.updateTransactionProvider,
          {
            transactionId: args.transactionId,
            providerTransactionId: order.id,
            clientSecret: approvalUrl,
          },
        );

        return {
          orderId: order.id,
          approvalUrl,
        };
      } else {
        throw new Error(order.message || "Failed to create PayPal order");
      }
    } catch (error: any) {
      console.error("[Payments] PayPal order creation failed:", error);
      await ctx.runMutation(
        internal.commerce.payments.confirmPaymentFailure,
        {
          providerTransactionId: String(args.transactionId),
          provider: "paypal",
          error: error.message || "Failed to create PayPal order",
        },
      );
    }
  },
});

/**
 * Capture a PayPal order after customer approval.
 *
 * Calls PayPal capture API, then calls handlePaymentSuccess on completion.
 */
export const capturePayPalOrderAction = internalAction({
  args: {
    transactionId: v.id("commerce_payment_transactions"),
    paypalOrderId: v.string(),
  },
  handler: async (ctx, args) => {
    let credentials: { clientId: string; clientSecret: string; mode: string };
    try {
      credentials = await getPayPalCredentials(ctx);
    } catch (error: any) {
      console.error("[Payments] PayPal not configured:", error.message);
      await ctx.runMutation(
        internal.commerce.payments.confirmPaymentFailure,
        {
          providerTransactionId: args.paypalOrderId,
          provider: "paypal",
          error: "PayPal is not configured.",
        },
      );
      return;
    }

    try {
      const baseUrl = getPayPalBaseUrl(credentials.mode);
      const accessToken = await getPayPalAccessToken(
        credentials.clientId,
        credentials.clientSecret,
        baseUrl,
      );

      // Capture the order
      const captureResponse = await fetch(
        `${baseUrl}/v2/checkout/orders/${args.paypalOrderId}/capture`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const capture = (await captureResponse.json()) as {
        status?: string;
        payer?: { payer_id?: string; email_address?: string };
      };

      if (capture.status === "COMPLETED") {
        await ctx.runMutation(
          internal.commerce.payments.confirmPaymentSuccess,
          {
            providerTransactionId: args.paypalOrderId,
            provider: "paypal",
          },
        );
        return { status: "COMPLETED" };
      } else {
        await ctx.runMutation(
          internal.commerce.payments.confirmPaymentFailure,
          {
            providerTransactionId: args.paypalOrderId,
            provider: "paypal",
            error: `PayPal capture failed: ${capture.status || "unknown"}`,
          },
        );
        return { status: capture.status };
      }
    } catch (error: any) {
      console.error("[Payments] PayPal capture failed:", error);
      await ctx.runMutation(
        internal.commerce.payments.confirmPaymentFailure,
        {
          providerTransactionId: args.paypalOrderId,
          provider: "paypal",
          error: error.message || "Failed to capture PayPal order",
        },
      );
    }
  },
});

/**
 * Process a refund via the appropriate provider (Stripe or PayPal).
 *
 * Handles both providers in one action.
 */
export const processProviderRefundAction = internalAction({
  args: {
    refundId: v.id("commerce_payment_refunds"),
    transactionId: v.id("commerce_payment_transactions"),
    provider: v.string(),
    providerTransactionId: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      let providerRefundId: string;

      if (args.provider === "stripe") {
        const stripeKey = await getStripeSecretKey(ctx);
        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(stripeKey);

        const refund = await stripe.refunds.create({
          payment_intent: args.providerTransactionId,
          amount: args.amount,
        });

        providerRefundId = refund.id;
      } else if (args.provider === "paypal") {
        const credentials = await getPayPalCredentials(ctx);
        const baseUrl = getPayPalBaseUrl(credentials.mode);
        const accessToken = await getPayPalAccessToken(
          credentials.clientId,
          credentials.clientSecret,
          baseUrl,
        );

        // Get the order to find capture ID
        const orderResponse = await fetch(
          `${baseUrl}/v2/checkout/orders/${args.providerTransactionId}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

        const order = (await orderResponse.json()) as {
          purchase_units?: Array<{
            payments?: {
              captures?: Array<{ id: string }>;
            };
          }>;
        };

        const captureId =
          order.purchase_units?.[0]?.payments?.captures?.[0]?.id;

        if (!captureId) {
          throw new Error("No capture found for PayPal order");
        }

        // Process refund via captures endpoint
        const amountInDollars = (args.amount / 100).toFixed(2);
        const refundResponse = await fetch(
          `${baseUrl}/v2/payments/captures/${captureId}/refund`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              amount: {
                currency_code: "USD",
                value: amountInDollars,
              },
            }),
          },
        );

        const refund = (await refundResponse.json()) as { id?: string };
        providerRefundId = refund.id || "";
      } else {
        throw new Error(`Unsupported payment provider: ${args.provider}`);
      }

      // Complete refund
      await ctx.runMutation(internal.commerce.payments.completeRefund, {
        refundId: args.refundId,
        transactionId: args.transactionId,
        providerRefundId,
        amount: args.amount,
        success: true,
      });
    } catch (error: any) {
      console.error(
        `[Payments] ${args.provider} refund processing failed:`,
        error,
      );
      await ctx.runMutation(internal.commerce.payments.completeRefund, {
        refundId: args.refundId,
        transactionId: args.transactionId,
        providerRefundId: "",
        amount: args.amount,
        success: false,
        error: error.message || "Failed to process refund",
      });
    }
  },
});

/**
 * Detach a saved payment method from Stripe Customer.
 *
 * Scheduled by `deletePaymentMethod` mutation.
 */
export const detachStripeMethodAction = internalAction({
  args: {
    providerMethodId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const stripeKey = await getStripeSecretKey(ctx);
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(stripeKey);

      await stripe.paymentMethods.detach(args.providerMethodId);
    } catch (error: any) {
      // Don't throw — we already deleted the local record.
      // Log for audit purposes.
      console.error(
        "[Payments] Failed to detach Stripe payment method:",
        error.message,
      );
    }
  },
});
