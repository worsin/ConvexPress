import { httpRouter } from "convex/server";
import { loginHandler } from "./auth/login";
import { refreshHandler } from "./auth/refresh";
import { logoutHandler } from "./auth/logout";
import { jwksHandler } from "./auth/jwks";

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
import { resendWebhookHandler } from "./http/resendWebhook";
import { clerkWebhookHandler } from "./auth/clerkWebhook";
import { analyticsTrackHandler } from "./http/analytics";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// ─── CORS Preflight Handler ──────────────────────────────────────────────────
// Handles OPTIONS requests for all /api/ paths
const corsPreflight = httpAction(async () => {
  return corsPreflightResponse();
});

// Auth endpoints use credentials (cookies), so the preflight MUST echo the
// request Origin instead of returning "*". Browsers reject wildcard when
// credentials mode is "include".
const authCorsPreflight = httpAction(async (_ctx, request) => {
  const origin = request.headers.get("origin") ?? "";
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400",
    },
  });
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

// ─── Stripe Webhook (with idempotency and dispute handling) ────────────────
http.route({
  path: "/webhooks/stripe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    // Settings-first, env-fallback. Keys live in commerce.payments section
    // (admin UI at /settings/integrations/stripe).
    const { getServiceKeyFromAction } = await import("./helpers/serviceKeys");
    const webhookSecret = await getServiceKeyFromAction(
      ctx,
      "commerce.payments",
      "stripeWebhookSecret",
      "STRIPE_WEBHOOK_SECRET",
    );
    const stripeSecretKey = await getServiceKeyFromAction(
      ctx,
      "commerce.payments",
      "stripeSecretKey",
      "STRIPE_SECRET_KEY",
    );
    if (!webhookSecret || !signature) {
      return new Response(
        JSON.stringify({ error: "Missing webhook secret or signature" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: "Stripe secret key not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Dynamic import for Stripe SDK (Node.js action context)
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeSecretKey);

    let webhookEventId: string | undefined;

    try {
      const event = stripe.webhooks.constructEvent(
        body,
        signature,
        webhookSecret,
      );

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

        case "charge.refunded": {
          // Refund confirmation handled via processStripeRefund action callback.
          // This webhook is logged for redundancy/audit.
          console.log(
            "[Stripe Webhook] charge.refunded received:",
            event.data.object.id,
          );
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
    } catch (error: any) {
      console.error("[Stripe Webhook] Error:", error.message);

      // Mark webhook as failed if we have an event ID
      if (webhookEventId) {
        try {
          await ctx.runMutation(
            internal.commerce.payments.markWebhookFailed,
            {
              eventId: webhookEventId as any,
              errorMessage: error.message || "Unknown error",
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
http.route({
  path: "/webhooks/paypal",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.text();
    let payload: any;

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
    const { getServiceKeyFromAction: getPPKey } = await import(
      "./helpers/serviceKeys"
    );
    const webhookId = await getPPKey(
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
    const paypalClientId = await getPPKey(
      ctx,
      "commerce.payments",
      "paypalClientId",
      "PAYPAL_CLIENT_ID",
    );
    const paypalClientSecret = await getPPKey(
      ctx,
      "commerce.payments",
      "paypalClientSecret",
      "PAYPAL_CLIENT_SECRET",
    );
    const paypalMode =
      (await getPPKey(ctx, "commerce.payments", "paypalMode", "PAYPAL_MODE")) ||
      "sandbox";
    const paypalBaseUrl =
      paypalMode === "live"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com";

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

      const tokenBody = (await tokenResponse.json()) as {
        access_token?: string;
      };
      const accessToken = tokenBody.access_token;

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

      const verifyBody = (await verifyResponse.json()) as {
        verification_status?: string;
      };
      if (verifyBody.verification_status !== "SUCCESS") {
        return new Response(
          JSON.stringify({ error: "Invalid webhook signature" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
    } catch (verifyError: any) {
      console.error(
        "[PayPal Webhook] Signature verification error:",
        verifyError.message,
      );
      return new Response(
        JSON.stringify({ error: "Signature verification failed" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // ── Signature verified — process events ────────────────────────────────
    let webhookEventId: string | undefined;

    try {
      // Log the webhook event and check for idempotency
      const logResult = await ctx.runMutation(
        internal.commerce.payments.logWebhookEvent,
        {
          provider: "paypal",
          eventType: payload.event_type,
          eventId: payload.id, // PayPal includes event ID in payload
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

      switch (payload.event_type) {
        case "PAYMENT.CAPTURE.COMPLETED": {
          const orderId =
            payload.resource?.supplementary_data?.related_ids?.order_id ||
            payload.resource?.custom_id;

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
          const orderId =
            payload.resource?.supplementary_data?.related_ids?.order_id ||
            payload.resource?.custom_id;

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

        case "PAYMENT.CAPTURE.REFUNDED": {
          // Refund confirmation — we track this via our refund flow.
          console.log(
            "[PayPal Webhook] Refund received:",
            payload.resource?.id,
          );
          break;
        }

        case "CHECKOUT.ORDER.APPROVED": {
          // Customer approved the order — trigger capture
          const paypalOrderId = payload.resource?.id;
          const transactionId =
            payload.resource?.purchase_units?.[0]?.custom_id;

          if (paypalOrderId && transactionId) {
            await ctx.runAction(
              internal.commerce.paymentActions.capturePayPalOrderAction,
              {
                transactionId: transactionId as any,
                paypalOrderId,
              },
            );
          }
          break;
        }

        default:
          console.log(
            "[PayPal Webhook] Unhandled event type:",
            payload.event_type,
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
    } catch (error: any) {
      console.error("[PayPal Webhook] Error:", error.message);

      // Mark webhook as failed if we have an event ID
      if (webhookEventId) {
        try {
          await ctx.runMutation(
            internal.commerce.payments.markWebhookFailed,
            {
              eventId: webhookEventId as any,
              errorMessage: error.message || "Unknown error",
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

export default http;
