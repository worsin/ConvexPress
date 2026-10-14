import { operatorHandoffHandler, operatorHandoffPreflight } from "./auth/operatorHttp";
import {downloadBytes as leadMagnetBytes} from "./leadMagnets/http";
import { downloadBytes } from "./commerceDigital/http";
import { httpRouter } from "convex/server";
import { loginHandler } from "./auth/login";
import { refreshHandler } from "./auth/refresh";
import { logoutHandler } from "./auth/logout";
import { jwksHandler } from "./auth/jwks";
import { authPreflightResponse } from "./auth/httpSecurity";

// ─── API v1 HTTP Endpoint Handlers ────────────────────────────────────────
import { corsPreflightResponse } from "./http/helpers";
import { discoveryHandler } from "./http/discovery";
import {
  postsListHandler,
  postsGetHandler,
  postsCreateHandler,
  postsUpdateHandler,
  postsDeleteHandler,
} from "./http/posts";
import {
  pagesListHandler,
  pagesGetHandler,
  pagesCreateHandler,
  pagesUpdateHandler,
  pagesDeleteHandler,
} from "./http/pages";
import {
  commentsListHandler,
  commentsGetHandler,
  commentsCreateHandler,
  commentsUpdateHandler,
  commentsDeleteHandler,
} from "./http/comments";
import {
  mediaListHandler,
  mediaGetHandler,
  mediaUploadHandler,
  mediaDeleteHandler,
} from "./http/media";
import { usersListHandler, usersGetHandler } from "./http/users";
import {
  categoriesListHandler,
  categoriesCreateHandler,
  tagsListHandler,
  tagsCreateHandler,
} from "./http/taxonomies";
import { menusListHandler } from "./http/menus";
import { settingsReadHandler } from "./http/settings";
import {
  ucpCheckoutCreateSessionHandler,
  ucpCheckoutSessionHandler,
} from "./http/checkout";
import { resendWebhookHandler } from "./http/resendWebhook";
import { clerkWebhookHandler } from "./auth/clerkWebhook";
import { inboundEmailWebhookHandler } from "./http/inboundEmailWebhook";
import {
  fedexWebhookHandler,
  shipstationWebhookHandler,
  upsWebhookHandler,
} from "./shipping/webhooks";
import { analyticsTrackHandler } from "./http/analytics";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getPayPalBaseUrl } from "./commerce/paypalMode";
import { jsonAt } from "./helpers/jsonValue";
import { getServiceKeyFromAction } from "./helpers/serviceKeys";
import { verifyStripeWebhook } from "./helpers/stripeWebhookSignature";
import { readExternalJson } from "./helpers/externalJson";
import { z } from "zod";
import {
  healthHandler as managementHealthHandler,
  sessionExchangeHandler as managementSessionExchangeHandler,
  sessionRevocationHandler as managementSessionRevocationHandler,
} from "./management/http";

const http = httpRouter();

http.route({ path: "/auth/operator-handoff", method: "OPTIONS", handler: operatorHandoffPreflight });
http.route({ path: "/auth/operator-handoff", method: "POST", handler: operatorHandoffHandler });

http.route({ path: "/commerce/downloads/bytes", method: "POST", handler: downloadBytes });
http.route({ path: "/lead-magnets/downloads/bytes", method: "POST", handler: leadMagnetBytes });

// ─── CORS Preflight Handler ──────────────────────────────────────────────────
// Handles OPTIONS requests for all /api/ paths
const corsPreflight = httpAction(async () => {
  return corsPreflightResponse();
});

// Auth endpoints use credentials (cookies), so the preflight MUST echo the
// request Origin instead of returning "*". Browsers reject wildcard when
// credentials mode is "include".
const authCorsPreflight = httpAction(async (_ctx, request) => {
  return authPreflightResponse(request);
});

// ─── Auth Routes ────────────────────────────────────────────────────────────
http.route({
  path: "/auth/login",
  method: "OPTIONS",
  handler: authCorsPreflight,
});
http.route({
  path: "/auth/login",
  method: "POST",
  handler: loginHandler,
});
http.route({
  path: "/auth/refresh",
  method: "OPTIONS",
  handler: authCorsPreflight,
});
http.route({
  path: "/auth/refresh",
  method: "POST",
  handler: refreshHandler,
});
http.route({
  path: "/auth/logout",
  method: "OPTIONS",
  handler: authCorsPreflight,
});
http.route({
  path: "/auth/logout",
  method: "POST",
  handler: logoutHandler,
});
http.route({
  path: "/.well-known/jwks.json",
  method: "GET",
  handler: jwksHandler,
});

http.route({
  path: "/api/v1/discovery",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/api/v1/posts",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/api/v1/pages",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/api/v1/comments",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/api/v1/media",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/api/v1/users",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/api/v1/categories",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/api/v1/tags",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/api/v1/menus",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/api/v1/settings",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/api/ucp/checkout/sessions",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  pathPrefix: "/api/ucp/checkout/sessions/",
  method: "OPTIONS",
  handler: corsPreflight,
});

// ─── Discovery (Public, no auth) ─────────────────────────────────────────────
http.route({
  path: "/api/v1/discovery",
  method: "GET",
  handler: discoveryHandler,
});

// ─── Posts (/api/v1/posts) ───────────────────────────────────────────────────
http.route({
  path: "/api/v1/posts",
  method: "GET",
  handler: postsListHandler,
});
http.route({
  path: "/api/v1/posts",
  method: "POST",
  handler: postsCreateHandler,
});

// Note: Convex HTTP router does not support path params like /posts/:id.
// Dynamic ID routes are handled by matching the prefix path and extracting
// the ID from the URL within the handler. We use pathPrefix routing.
http.route({
  pathPrefix: "/api/v1/posts/",
  method: "GET",
  handler: postsGetHandler,
});
http.route({
  pathPrefix: "/api/v1/posts/",
  method: "PUT",
  handler: postsUpdateHandler,
});
http.route({
  pathPrefix: "/api/v1/posts/",
  method: "DELETE",
  handler: postsDeleteHandler,
});
http.route({
  pathPrefix: "/api/v1/posts/",
  method: "OPTIONS",
  handler: corsPreflight,
});

// ─── Pages (/api/v1/pages) ──────────────────────────────────────────────────
http.route({
  path: "/api/v1/pages",
  method: "GET",
  handler: pagesListHandler,
});
http.route({
  path: "/api/v1/pages",
  method: "POST",
  handler: pagesCreateHandler,
});

http.route({
  pathPrefix: "/api/v1/pages/",
  method: "GET",
  handler: pagesGetHandler,
});
http.route({
  pathPrefix: "/api/v1/pages/",
  method: "PUT",
  handler: pagesUpdateHandler,
});
http.route({
  pathPrefix: "/api/v1/pages/",
  method: "DELETE",
  handler: pagesDeleteHandler,
});
http.route({
  pathPrefix: "/api/v1/pages/",
  method: "OPTIONS",
  handler: corsPreflight,
});

// ─── Comments (/api/v1/comments) ─────────────────────────────────────────────
http.route({
  path: "/api/v1/comments",
  method: "GET",
  handler: commentsListHandler,
});
http.route({
  path: "/api/v1/comments",
  method: "POST",
  handler: commentsCreateHandler,
});

http.route({
  pathPrefix: "/api/v1/comments/",
  method: "GET",
  handler: commentsGetHandler,
});
http.route({
  pathPrefix: "/api/v1/comments/",
  method: "PUT",
  handler: commentsUpdateHandler,
});
http.route({
  pathPrefix: "/api/v1/comments/",
  method: "DELETE",
  handler: commentsDeleteHandler,
});
http.route({
  pathPrefix: "/api/v1/comments/",
  method: "OPTIONS",
  handler: corsPreflight,
});

// ─── Media (/api/v1/media) ──────────────────────────────────────────────────
http.route({
  path: "/api/v1/media",
  method: "GET",
  handler: mediaListHandler,
});
http.route({
  path: "/api/v1/media",
  method: "POST",
  handler: mediaUploadHandler,
});

http.route({
  pathPrefix: "/api/v1/media/",
  method: "GET",
  handler: mediaGetHandler,
});
http.route({
  pathPrefix: "/api/v1/media/",
  method: "DELETE",
  handler: mediaDeleteHandler,
});
http.route({
  pathPrefix: "/api/v1/media/",
  method: "OPTIONS",
  handler: corsPreflight,
});

// ─── Users (/api/v1/users) ──────────────────────────────────────────────────
http.route({
  path: "/api/v1/users",
  method: "GET",
  handler: usersListHandler,
});

http.route({
  pathPrefix: "/api/v1/users/",
  method: "GET",
  handler: usersGetHandler,
});
http.route({
  pathPrefix: "/api/v1/users/",
  method: "OPTIONS",
  handler: corsPreflight,
});

// ─── Taxonomies (/api/v1/categories, /api/v1/tags) ──────────────────────────
http.route({
  path: "/api/v1/categories",
  method: "GET",
  handler: categoriesListHandler,
});
http.route({
  path: "/api/v1/categories",
  method: "POST",
  handler: categoriesCreateHandler,
});
http.route({
  path: "/api/v1/tags",
  method: "GET",
  handler: tagsListHandler,
});
http.route({
  path: "/api/v1/tags",
  method: "POST",
  handler: tagsCreateHandler,
});

// ─── Menus (/api/v1/menus) ──────────────────────────────────────────────────
http.route({
  path: "/api/v1/menus",
  method: "GET",
  handler: menusListHandler,
});

// ─── Settings (/api/v1/settings) ─────────────────────────────────────────────
http.route({
  path: "/api/v1/settings",
  method: "GET",
  handler: settingsReadHandler,
});

// ─── UCP Checkout (/api/ucp/checkout/sessions) ─────────────────────────────
http.route({
  path: "/api/ucp/checkout/sessions",
  method: "POST",
  handler: ucpCheckoutCreateSessionHandler,
});
http.route({
  pathPrefix: "/api/ucp/checkout/sessions/",
  method: "GET",
  handler: ucpCheckoutSessionHandler,
});
http.route({
  pathPrefix: "/api/ucp/checkout/sessions/",
  method: "PATCH",
  handler: ucpCheckoutSessionHandler,
});
http.route({
  pathPrefix: "/api/ucp/checkout/sessions/",
  method: "POST",
  handler: ucpCheckoutSessionHandler,
});
http.route({
  pathPrefix: "/api/ucp/checkout/sessions/",
  method: "DELETE",
  handler: ucpCheckoutSessionHandler,
});

// ─── Webhooks (/webhooks/) ──────────────────────────────────────────────────
http.route({
  path: "/webhooks/resend",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/webhooks/resend",
  method: "POST",
  handler: resendWebhookHandler,
});
http.route({
  path: "/webhooks/clerk",
  method: "POST",
  handler: clerkWebhookHandler,
});
http.route({
  path: "/webhooks/inbound-email",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/webhooks/inbound-email",
  method: "POST",
  handler: inboundEmailWebhookHandler,
});
http.route({
  path: "/webhooks/shipstation",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/webhooks/shipstation",
  method: "POST",
  handler: shipstationWebhookHandler,
});
http.route({
  path: "/webhooks/fedex",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/webhooks/fedex",
  method: "POST",
  handler: fedexWebhookHandler,
});
http.route({
  path: "/webhooks/ups",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/webhooks/ups",
  method: "POST",
  handler: upsWebhookHandler,
});

// ─── Stripe Webhook (with idempotency and dispute handling) ────────────────
http.route({
  path: "/webhooks/stripe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    // Settings-first, env-fallback. Keys live in commerce.payments section
    // (admin UI at /settings/integrations/stripe).
    const webhookSecret = await getServiceKeyFromAction(
      ctx,
      "commerce.payments",
      "stripeWebhookSecret",
      "STRIPE_WEBHOOK_SECRET",
    );
    if (!webhookSecret || !signature) {
      return new Response(
        JSON.stringify({ error: "Missing webhook secret or signature" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    let webhookEventId: Id<"commerce_webhook_events"> | undefined;

    try {
      // HTTP actions run in V8: verify with Web Crypto, not the Node SDK.
      const event = await verifyStripeWebhook(body, signature, webhookSecret);

      // Log the webhook event and check for idempotency
      const logResult = await ctx.runMutation(
        internal.commerce.payments.logWebhookEvent,
        {
          provider: "stripe",
          eventType: event.type,
          eventId: event.id,
          payload: body.substring(0, 10000), // Truncate large payloads
        },
      );

      // If already processed, return 200 without re-processing
      if (logResult.alreadyExists && logResult.status === "processed") {
        return new Response(
          JSON.stringify({ received: true, status: "already_processed" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      webhookEventId = logResult.eventId;

      // Mark as processing
      await ctx.runMutation(
        internal.commerce.payments.markWebhookProcessing,
        { eventId: logResult.eventId },
      );

      // Handle different event types
      switch (event.type) {
        case "payment_intent.succeeded": {
          const paymentIntent = event.data.object;
          // Subscription PaymentIntents route to the subscriptions handler;
          // one-time order PaymentIntents route to commerce.
          const kind = paymentIntent.metadata?.kind;
          if (kind === "subscription_invoice") {
            const invoiceRef = paymentIntent.metadata?.invoiceId;
            if (invoiceRef) {
              await ctx.runMutation(
                internal.commerceSubscriptions.internals.recordStripeInvoicePayment,
                {
                  invoiceRef,
                  succeeded: true,
                  paymentTransactionId: paymentIntent.id,
                },
              );
            }
            break;
          }
          if (kind === "subscription_first_charge") {
            // The event is signature-verified above. The PaymentIntent's own
            // status, amount, currency and metadata go to the internal
            // activation, which checks them against the server-computed intent.
            const checkoutIntentRef = paymentIntent.metadata?.checkoutIntentId;
            const paymentMethodId =
              typeof paymentIntent.payment_method === "string"
                ? paymentIntent.payment_method
                : paymentIntent.payment_method?.id;
            if (checkoutIntentRef) {
              await ctx.runMutation(
                internal.commerceSubscriptions.internals
                  .activateCheckoutIntentFromStripe,
                {
                  checkoutIntentRef,
                  paymentIntentId: paymentIntent.id,
                  paymentIntentStatus: paymentIntent.status,
                  amountReceived: paymentIntent.amount_received,
                  currency: paymentIntent.currency,
                  paymentMethodId: paymentMethodId ?? undefined,
                  stripeCustomerId:
                    typeof paymentIntent.customer === "string"
                      ? paymentIntent.customer
                      : paymentIntent.customer?.id,
                },
              );
            }
            break;
          }
          if (kind === "form_order_payment") {
            const submissionId = paymentIntent.metadata?.submissionId;
            if (submissionId) {
              await ctx.runMutation(
                internal.extensions.forms.orderPayments
                  .markOrderPaymentSucceeded,
                {
                  submissionId: submissionId as Id<"form_submissions">,
                  paymentIntentId: paymentIntent.id,
                },
              );
            }
            break;
          }
          await ctx.runMutation(
            internal.commerce.payments.confirmPaymentSuccess,
            {
              providerTransactionId: paymentIntent.id,
              provider: "stripe",
            },
          );
          break;
        }

        case "payment_intent.payment_failed": {
          const paymentIntent = event.data.object;
          const kind = paymentIntent.metadata?.kind;
          if (kind === "subscription_invoice") {
            const invoiceRef = paymentIntent.metadata?.invoiceId;
            if (invoiceRef) {
              await ctx.runMutation(
                internal.commerceSubscriptions.internals.recordStripeInvoicePayment,
                {
                  invoiceRef,
                  succeeded: false,
                  paymentTransactionId: paymentIntent.id,
                  failureCode: paymentIntent.last_payment_error?.decline_code,
                  failureReason:
                    paymentIntent.last_payment_error?.code ??
                    paymentIntent.last_payment_error?.message ??
                    "payment_failed",
                },
              );
            }
            break;
          }
          if (kind === "form_order_payment") {
            const submissionId = paymentIntent.metadata?.submissionId;
            if (submissionId) {
              await ctx.runMutation(
                internal.extensions.forms.orderPayments
                  .markOrderPaymentFailed,
                {
                  submissionId: submissionId as Id<"form_submissions">,
                  paymentIntentId: paymentIntent.id,
                  error:
                    paymentIntent.last_payment_error?.message ??
                    "Payment failed",
                },
              );
            }
            break;
          }
          await ctx.runMutation(
            internal.commerce.payments.confirmPaymentFailure,
            {
              providerTransactionId: paymentIntent.id,
              provider: "stripe",
              error:
                paymentIntent.last_payment_error?.message ?? "Payment failed",
            },
          );
          break;
        }

        case "setup_intent.succeeded": {
          const setupIntent = event.data.object;
          const intentId = setupIntent.metadata?.checkoutIntentId;
          const kind = setupIntent.metadata?.kind;
          const paymentMethodId =
            typeof setupIntent.payment_method === "string"
              ? setupIntent.payment_method
              : setupIntent.payment_method?.id;
          const customerId =
            typeof setupIntent.customer === "string"
              ? setupIntent.customer
              : setupIntent.customer?.id;
          if (intentId && paymentMethodId && customerId) {
            await ctx.runAction(
              internal.commerceSubscriptions.stripeCharge
                .saveSetupIntentResult,
              {
                checkoutIntentRef: intentId,
                stripeCustomerId: customerId,
                paymentMethodId,
                setupIntentId: setupIntent.id,
                activateCheckout: kind === "subscription_setup",
              },
            );
          }
          break;
        }

        case "payment_intent.requires_action": {
          // 3D Secure authentication required.
          // Frontend handles 3DS via stripe.confirmCardPayment().
          // Log for audit purposes only.
          const paymentIntent = event.data.object;
          console.log(
            "[Stripe Webhook] 3DS required for:",
            paymentIntent.id,
          );
          break;
        }

        case "payment_intent.canceled": {
          const paymentIntent = event.data.object;
          if (paymentIntent.metadata?.kind === "form_order_payment") {
            const submissionId = paymentIntent.metadata?.submissionId;
            if (submissionId) {
              await ctx.runMutation(
                internal.extensions.forms.orderPayments
                  .markOrderPaymentFailed,
                {
                  submissionId: submissionId as Id<"form_submissions">,
                  paymentIntentId: paymentIntent.id,
                  error: "Payment cancelled",
                },
              );
            }
            break;
          }
          await ctx.runMutation(
            internal.commerce.payments.confirmPaymentFailure,
            {
              providerTransactionId: paymentIntent.id,
              provider: "stripe",
              error: "Payment cancelled",
            },
          );
          break;
        }

        case "refund.created":
        case "refund.updated":
        case "refund.failed": {
          const refund = event.data.object;
          await ctx.runMutation(internal.commerce.payments.reconcileProviderRefund, {
            provider: "stripe", providerRefundId: refund.id, providerStatus: refund.status ?? "pending",
            refundId: (refund.metadata?.refundId || undefined) as Id<"commerce_payment_refunds"> | undefined,
            providerTransactionId: typeof refund.payment_intent === "string" ? refund.payment_intent : undefined,
            amount: refund.amount, error: refund.failure_reason ?? undefined,
          });
          break;
        }
        case "charge.refunded": {
          const charge = event.data.object;
          for (const refund of charge.refunds?.data ?? []) {
            await ctx.runMutation(internal.commerce.payments.reconcileProviderRefund, {
              provider: "stripe", providerRefundId: refund.id, providerStatus: refund.status ?? "pending",
              refundId: (refund.metadata?.refundId || undefined) as Id<"commerce_payment_refunds"> | undefined,
              providerTransactionId: typeof charge.payment_intent === "string" ? charge.payment_intent : undefined,
              amount: refund.amount, error: refund.failure_reason ?? undefined,
            });
          }
          break;
        }

        case "charge.dispute.created": {
          // Log dispute and warn admin
          const dispute = event.data.object as {
            id: string;
            amount: number;
            currency: string;
            reason: string;
            evidence_details?: { due_by?: number };
            payment_intent?: string;
          };
          console.warn(
            "[Stripe Webhook] Dispute created:",
            dispute.id,
            "Amount:",
            dispute.amount,
            "Reason:",
            dispute.reason,
          );
          break;
        }

        default:
          console.log("[Stripe Webhook] Unhandled event type:", event.type);
      }

      // Mark as processed
      await ctx.runMutation(
        internal.commerce.payments.markWebhookProcessed,
        { eventId: logResult.eventId },
      );

      return new Response(
        JSON.stringify({ received: true }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[Stripe Webhook] Error:", message);

      // Mark webhook as failed if we have an event ID
      if (webhookEventId) {
        try {
          await ctx.runMutation(
            internal.commerce.payments.markWebhookFailed,
            {
              eventId: webhookEventId,
              errorMessage: message || "Unknown error",
            },
          );
        } catch (markError) {
          console.error(
            "[Stripe Webhook] Failed to mark webhook as failed:",
            markError,
          );
        }
      }

      return new Response(
        JSON.stringify({ error: "Webhook processing failed" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  }),
});

// ─── PayPal Webhook ────────────────────────────────────────────────────────

/** The PayPal webhook event fields this handler reads; absent or non-text values are undefined. */
type PayPalWebhookEvent = {
  id?: string;
  eventType?: string;
  resourceId?: string;
  resourceCustomId?: string;
  relatedOrderId?: string;
  firstPurchaseUnitCustomId?: string;
};

function jsonText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readPayPalWebhookEvent(payload: unknown): PayPalWebhookEvent {
  return {
    id: jsonText(jsonAt(payload, "id")),
    eventType: jsonText(jsonAt(payload, "event_type")),
    resourceId: jsonText(jsonAt(payload, "resource", "id")),
    resourceCustomId: jsonText(jsonAt(payload, "resource", "custom_id")),
    relatedOrderId: jsonText(jsonAt(payload, "resource", "supplementary_data", "related_ids", "order_id")),
    firstPurchaseUnitCustomId: jsonText(jsonAt(payload, "resource", "purchase_units", 0, "custom_id")),
  };
}

http.route({
  path: "/webhooks/paypal",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.text();
    let payload: unknown;

    try {
      payload = JSON.parse(body);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // ── PayPal Signature Verification ──────────────────────────────────────
    // Settings-first, env-fallback.
    const webhookId = await getServiceKeyFromAction(
      ctx,
      "commerce.payments",
      "paypalWebhookId",
      "PAYPAL_WEBHOOK_ID",
    );
    if (!webhookId) {
      console.error("[PayPal Webhook] paypalWebhookId not configured");
      return new Response(
        JSON.stringify({ error: "Webhook not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const transmissionId = request.headers.get("paypal-transmission-id");
    const transmissionTime = request.headers.get("paypal-transmission-time");
    const transmissionSignature = request.headers.get("paypal-transmission-sig");
    const certUrl = request.headers.get("paypal-cert-url");
    const authAlgo = request.headers.get("paypal-auth-algo");

    if (
      !transmissionId ||
      !transmissionTime ||
      !transmissionSignature ||
      !certUrl ||
      !authAlgo
    ) {
      return new Response(
        JSON.stringify({ error: "Missing PayPal signature headers" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Verify signature via PayPal API
    const paypalClientId = await getServiceKeyFromAction(
      ctx,
      "commerce.payments",
      "paypalClientId",
      "PAYPAL_CLIENT_ID",
    );
    const paypalClientSecret = await getServiceKeyFromAction(
      ctx,
      "commerce.payments",
      "paypalClientSecret",
      "PAYPAL_CLIENT_SECRET",
    );
    const paypalMode =
      (await getServiceKeyFromAction(ctx, "commerce.payments", "paypalMode", "PAYPAL_MODE")) ||
      "sandbox";
    const paypalBaseUrl = getPayPalBaseUrl(paypalMode);

    if (!paypalClientId || !paypalClientSecret) {
      console.error("[PayPal Webhook] PayPal credentials not configured");
      return new Response(
        JSON.stringify({ error: "PayPal not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    try {
      // Get PayPal access token
      const tokenResponse = await fetch(
        `${paypalBaseUrl}/v1/oauth2/token`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${paypalClientId}:${paypalClientSecret}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "grant_type=client_credentials",
        },
      );

      if (!tokenResponse.ok) {
        console.error(
          "[PayPal Webhook] Failed to get access token:",
          await tokenResponse.text(),
        );
        return new Response(
          JSON.stringify({ error: "Signature verification failed" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }

      const tokenBody = await readExternalJson(tokenResponse, z.object({ access_token: z.string().optional() }));
      const accessToken = tokenBody.ok ? tokenBody.value.access_token : undefined;

      if (!accessToken) {
        return new Response(
          JSON.stringify({ error: "Signature verification failed" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }

      // Verify webhook signature
      const verifyResponse = await fetch(
        `${paypalBaseUrl}/v1/notifications/verify-webhook-signature`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            transmission_id: transmissionId,
            transmission_time: transmissionTime,
            cert_url: certUrl,
            auth_algo: authAlgo,
            transmission_sig: transmissionSignature,
            webhook_id: webhookId,
            webhook_event: payload,
          }),
        },
      );

      if (!verifyResponse.ok) {
        console.error(
          "[PayPal Webhook] Verification request failed:",
          await verifyResponse.text(),
        );
        return new Response(
          JSON.stringify({ error: "Invalid webhook signature" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }

      const verifyBody = await readExternalJson(verifyResponse, z.object({ verification_status: z.string().optional() }));
      if (!verifyBody.ok || verifyBody.value.verification_status !== "SUCCESS") {
        return new Response(
          JSON.stringify({ error: "Invalid webhook signature" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
    } catch (verifyError) {
      console.error(
        "[PayPal Webhook] Signature verification error:",
        verifyError instanceof Error ? verifyError.message : String(verifyError),
      );
      return new Response(
        JSON.stringify({ error: "Signature verification failed" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // ── Signature verified — process events ────────────────────────────────
    let webhookEventId: Id<"commerce_webhook_events"> | undefined;
    const event = readPayPalWebhookEvent(payload);

    try {
      if (event.id === undefined || event.eventType === undefined) {
        throw new Error("PayPal webhook event is missing id or event_type");
      }
      // Log the webhook event and check for idempotency
      const logResult = await ctx.runMutation(
        internal.commerce.payments.logWebhookEvent,
        {
          provider: "paypal",
          eventType: event.eventType,
          eventId: event.id, // PayPal includes event ID in payload
          payload: body.substring(0, 10000),
        },
      );

      // If already processed, return 200 without re-processing
      if (logResult.alreadyExists && logResult.status === "processed") {
        return new Response(
          JSON.stringify({ received: true, status: "already_processed" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      webhookEventId = logResult.eventId;

      // Mark as processing
      await ctx.runMutation(
        internal.commerce.payments.markWebhookProcessing,
        { eventId: logResult.eventId },
      );

      switch (event.eventType) {
        case "PAYMENT.CAPTURE.COMPLETED": {
          const orderId = event.relatedOrderId || event.resourceCustomId;

          if (orderId) {
            await ctx.runMutation(
              internal.commerce.payments.confirmPaymentSuccess,
              {
                providerTransactionId: orderId,
                provider: "paypal",
              },
            );
          }
          break;
        }

        case "PAYMENT.CAPTURE.DENIED": {
          const orderId = event.relatedOrderId || event.resourceCustomId;

          if (orderId) {
            await ctx.runMutation(
              internal.commerce.payments.confirmPaymentFailure,
              {
                providerTransactionId: orderId,
                provider: "paypal",
                error: "Payment denied by PayPal",
              },
            );
          }
          break;
        }

        case "PAYMENT.CAPTURE.REFUNDED":
        case "PAYMENT.REFUND.PENDING":
        case "PAYMENT.REFUND.FAILED": {
          if (event.resourceId) await ctx.runMutation(internal.commerce.payments.reconcileProviderRefund, {
            provider: "paypal", providerRefundId: event.resourceId,
            providerStatus: event.eventType === "PAYMENT.CAPTURE.REFUNDED" ? "completed"
              : event.eventType === "PAYMENT.REFUND.FAILED" ? "failed" : "pending",
          });
          break;
        }

        case "CHECKOUT.ORDER.APPROVED": {
          // Customer approved the order — trigger capture
          const paypalOrderId = event.resourceId;
          const transactionId = event.firstPurchaseUnitCustomId;

          if (paypalOrderId && transactionId) {
            await ctx.runAction(
              internal.commerce.paymentActions.capturePayPalOrderAction,
              {
                transactionId: transactionId as Id<"commerce_payment_transactions">,
                paypalOrderId,
              },
            );
          }
          break;
        }

        default:
          console.log(
            "[PayPal Webhook] Unhandled event type:",
            event.eventType,
          );
      }

      // Mark as processed
      await ctx.runMutation(
        internal.commerce.payments.markWebhookProcessed,
        { eventId: logResult.eventId },
      );

      return new Response(
        JSON.stringify({ received: true }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[PayPal Webhook] Error:", message);

      // Mark webhook as failed if we have an event ID
      if (webhookEventId) {
        try {
          await ctx.runMutation(
            internal.commerce.payments.markWebhookFailed,
            {
              eventId: webhookEventId,
              errorMessage: message || "Unknown error",
            },
          );
        } catch (markError) {
          console.error(
            "[PayPal Webhook] Failed to mark webhook as failed:",
            markError,
          );
        }
      }

      return new Response(
        JSON.stringify({ error: "Webhook processing failed" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  }),
});

// ─── Analytics Tracking (Public, no auth) ───────────────────────────────────
http.route({
  path: "/api/analytics/track",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/api/analytics/track",
  method: "POST",
  handler: analyticsTrackHandler,
});

// Site-local portable management contract. Health is explicitly non-secret;
// session exchange requires a signed, audience-bound controller envelope.
http.route({
  path: "/api/convexpress/management/health",
  method: "GET",
  handler: managementHealthHandler,
});
http.route({
  path: "/api/convexpress/management/session/exchange",
  method: "POST",
  handler: managementSessionExchangeHandler,
});
http.route({
  path: "/api/convexpress/management/session/revoke",
  method: "POST",
  handler: managementSessionRevocationHandler,
});

export default http;
