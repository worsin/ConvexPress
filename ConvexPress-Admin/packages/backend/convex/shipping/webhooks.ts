/**
 * PRD 7.5 — webhook handlers for shipping providers.
 * Runs in V8 runtime (HTTP actions cannot use "use node"). Web Crypto API
 * is available in both runtimes for HMAC verification.
 *
 * Endpoints (registered in convex/http.ts):
 *   POST /webhooks/shipstation
 *   POST /webhooks/fedex
 *   POST /webhooks/ups
 *
 * Each handler:
 *   1. Verifies the signature (HMAC-SHA256 per provider docs).
 *   2. Parses the tracking payload.
 *   3. Looks up the shipment by tracking number.
 *   4. Records a tracking event via the internal mutation.
 *   5. Returns 200 OK on success, 401 on signature mismatch, 400 on malformed.
 *
 * Signature verification uses Web Crypto (available in Convex Node runtime).
 */

import { httpAction, type ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { at, str, timeOf } from "./helpers/json";
import {
  normalizeShipStationStatus,
  normalizeFedexStatus,
  normalizeUpsStatus,
} from "./tracking/statusNormalization";

/**
 * Tier 1.2 — resolve the webhook signing secret for a provider.
 * Order of precedence: per-connection `webhookSecret` field, then env var fallback.
 */
async function resolveWebhookSecret(
  ctx: ActionCtx,
  provider: "shipstation" | "fedex" | "ups",
  envVarName: string,
): Promise<string> {
  const connection = await ctx.runQuery(
    internal.shipping.providers._shared.tokenCache.findConnectionByProvider,
    { provider },
  );
  if (connection && connection.webhookSecret) return connection.webhookSecret;
  return process.env[envVarName] ?? "";
}

/**
 * Tier 4.2 — replay protection. Hash the signature (or the raw body when no
 * signature is present) and check-and-insert via the dedup table. Returns
 * true if this delivery has already been processed within the 7-day window.
 */
async function isReplayedDelivery(
  ctx: ActionCtx,
  provider: "shipstation" | "fedex" | "ups",
  signature: string,
  body: string,
): Promise<boolean> {
  const fingerprint = signature || (await hashBody(body));
  if (!fingerprint) return false;
  const { replay } = await ctx.runMutation(
    internal.shipping.webhookDedup.checkAndRecord,
    { provider, signatureHash: fingerprint },
  );
  return Boolean(replay);
}

async function hashBody(body: string): Promise<string> {
  if (!body) return "";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifySignatureHmacSha256(
  secret: string,
  body: string,
  signatureHex: string,
): Promise<boolean> {
  if (!secret || !signatureHex) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const computed = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // Constant-time comparison (good practice for HMAC).
  if (computed.length !== signatureHex.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) {
    mismatch |= computed.charCodeAt(i) ^ signatureHex.charCodeAt(i);
  }
  return mismatch === 0;
}

async function findShipmentByTracking(
  ctx: ActionCtx,
  trackingNumber: string,
): Promise<{ shipmentId: Id<"commerce_shipments">; orderId: Id<"commerce_orders">; labelId?: Id<"commerce_shipment_labels"> } | null> {
  // Try the shipment_labels index first (more granular per-package match).
  const match = await ctx.runQuery(
    internal.shipping.tracking.internals.findShipmentByTracking,
    { trackingNumber },
  );
  // Legacy shipments have no label row; the tracking event then carries no labelId.
  return match ? { shipmentId: match.shipmentId, orderId: match.orderId, labelId: match.labelId ?? undefined } : null;
}

/**
 * ShipStation webhook handler.
 * Signature header: `x-shipengine-hmac-sha256` (HMAC-SHA256 hex).
 * Payload structure varies by event_type. We handle TRACK_UPDATE here.
 */
export const shipstationWebhookHandler = httpAction(async (ctx, request) => {
  const body = await request.text();
  const signature = request.headers.get("x-shipengine-hmac-sha256") ?? "";
  const secret = await resolveWebhookSecret(ctx, "shipstation", "SHIPSTATION_WEBHOOK_SECRET");

  // Webhook signatures are REQUIRED when a secret is configured. Missing
  // secret is treated as misconfiguration — reject 401 instead of silently
  // accepting unsigned payloads. The admin UI surfaces "webhook secret not
  // set" so operators see why deliveries are being rejected.
  if (!secret) {
    return new Response(
      JSON.stringify({ error: "Webhook secret not configured" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!(await verifySignatureHmacSha256(secret, body, signature))) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (await isReplayedDelivery(ctx, "shipstation", signature, body)) {
    return new Response(JSON.stringify({ ok: true, replay: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ShipStation/ShipEngine TRACK_UPDATE shape:
  // { resource_type: "TRACK", resource_url, data: { tracking_number, status_code, status_description, events: [...] } }
  const trackingNumber = str(at(payload, "data", "tracking_number")) ?? str(at(payload, "tracking_number"));
  if (!trackingNumber) {
    return new Response(JSON.stringify({ error: "No tracking number" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const shipment = await findShipmentByTracking(ctx, String(trackingNumber));
  if (!shipment) {
    // 200 OK so ShipEngine doesn't retry forever — we just don't have this shipment.
    return new Response(JSON.stringify({ ok: true, ignored: "shipment not found" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const payloadEvents = at(payload, "data", "events");
  const events: unknown[] = Array.isArray(payloadEvents)
    ? payloadEvents
    : [
        {
          status_code: at(payload, "data", "status_code") ?? at(payload, "status_code"),
          status_description: at(payload, "data", "status_description") ?? at(payload, "status_description"),
          occurred_at: at(payload, "data", "actual_delivery_date") ?? new Date().toISOString(),
          city_locality: at(payload, "data", "city_locality"),
        },
      ];

  for (const event of events) {
    const code = String(at(event, "status_code") ?? "");
    const normalized = normalizeShipStationStatus(code);
    const occurred = at(event, "occurred_at");
    const statusDescription = str(at(event, "status_description"));
    await ctx.runMutation(
      internal.shipping.tracking.mutations.recordTrackingEvent,
      {
        shipmentId: shipment.shipmentId,
        labelId: shipment.labelId,
        eventId: `shipstation:${code}:${str(occurred) ?? Date.now()}`,
        occurredAt: timeOf(occurred) ?? Date.now(),
        normalizedStatus: normalized,
        carrierStatus: statusDescription ?? code,
        description: statusDescription,
        location: str(at(event, "city_locality")),
        rawMetadata: event,
        receivedVia: "webhook",
      },
    );
  }

  return new Response(JSON.stringify({ ok: true, recorded: events.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

/**
 * FedEx tracking webhook handler.
 * Signature header: `x-fedex-signature` (HMAC-SHA256 hex).
 */
export const fedexWebhookHandler = httpAction(async (ctx, request) => {
  const body = await request.text();
  const signature = request.headers.get("x-fedex-signature") ?? "";
  const secret = await resolveWebhookSecret(ctx, "fedex", "FEDEX_WEBHOOK_SECRET");

  // Webhook signatures are REQUIRED when a secret is configured. Missing
  // secret is treated as misconfiguration — reject 401 instead of silently
  // accepting unsigned payloads. The admin UI surfaces "webhook secret not
  // set" so operators see why deliveries are being rejected.
  if (!secret) {
    return new Response(
      JSON.stringify({ error: "Webhook secret not configured" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!(await verifySignatureHmacSha256(secret, body, signature))) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (await isReplayedDelivery(ctx, "fedex", signature, body)) {
    return new Response(JSON.stringify({ ok: true, replay: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const trackingNumber =
    str(at(payload, "trackingNumber")) ??
    str(at(payload, "output", "completeTrackResults", 0, "trackingNumber"));
  if (!trackingNumber) {
    return new Response(JSON.stringify({ error: "No tracking number" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const shipment = await findShipmentByTracking(ctx, String(trackingNumber));
  if (!shipment) {
    return new Response(JSON.stringify({ ok: true, ignored: "shipment not found" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const trackResult = at(payload, "output", "completeTrackResults", 0, "trackResults", 0) ?? payload;
  const code = String(at(trackResult, "latestStatusDetail", "code") ?? "");
  const normalized = normalizeFedexStatus(code);

  await ctx.runMutation(
    internal.shipping.tracking.mutations.recordTrackingEvent,
    {
      shipmentId: shipment.shipmentId,
      labelId: shipment.labelId,
      eventId: `fedex:${code}:${Date.now()}`,
      occurredAt: Date.now(),
      normalizedStatus: normalized,
      carrierStatus: str(at(trackResult, "latestStatusDetail", "statusByLocale")) ?? code,
      description: str(at(trackResult, "latestStatusDetail", "description")),
      location: str(at(trackResult, "latestStatusDetail", "scanLocation", "city")),
      rawMetadata: trackResult,
      receivedVia: "webhook",
    },
  );

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

/**
 * UPS tracking webhook handler.
 * Header: `x-ups-signature` (HMAC-SHA256 hex of body, secret from connection).
 */
export const upsWebhookHandler = httpAction(async (ctx, request) => {
  const body = await request.text();
  const signature = request.headers.get("x-ups-signature") ?? "";
  const secret = await resolveWebhookSecret(ctx, "ups", "UPS_WEBHOOK_SECRET");

  // Webhook signatures are REQUIRED when a secret is configured. Missing
  // secret is treated as misconfiguration — reject 401 instead of silently
  // accepting unsigned payloads. The admin UI surfaces "webhook secret not
  // set" so operators see why deliveries are being rejected.
  if (!secret) {
    return new Response(
      JSON.stringify({ error: "Webhook secret not configured" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!(await verifySignatureHmacSha256(secret, body, signature))) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (await isReplayedDelivery(ctx, "ups", signature, body)) {
    return new Response(JSON.stringify({ ok: true, replay: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // UPS pubsub format varies. Common shape: { trackingNumber, localActivityDate, activityStatus: { description, code, type } }
  const trackingNumber =
    str(at(payload, "trackingNumber")) ??
    str(at(payload, "shipment", 0, "package", 0, "trackingNumber"));
  if (!trackingNumber) {
    return new Response(JSON.stringify({ error: "No tracking number" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const shipment = await findShipmentByTracking(ctx, String(trackingNumber));
  if (!shipment) {
    return new Response(JSON.stringify({ ok: true, ignored: "shipment not found" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const description =
    str(at(payload, "activityStatus", "description")) ??
    str(at(payload, "shipment", 0, "package", 0, "activity", 0, "status", "description")) ??
    "";
  const localActivityDate = at(payload, "localActivityDate");
  const normalized = normalizeUpsStatus(description);

  await ctx.runMutation(
    internal.shipping.tracking.mutations.recordTrackingEvent,
    {
      shipmentId: shipment.shipmentId,
      labelId: shipment.labelId,
      eventId: `ups:${description}:${str(localActivityDate) ?? Date.now()}`,
      occurredAt: timeOf(localActivityDate) ?? Date.now(),
      normalizedStatus: normalized,
      carrierStatus: description,
      description,
      rawMetadata: payload,
      receivedVia: "webhook",
    },
  );

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
