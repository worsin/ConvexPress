/**
 * Resend Webhook Handler
 *
 * HTTP POST handler that receives Resend webhook events and updates
 * the email queue accordingly. Resend uses Svix for webhook signing.
 *
 * Supported event types:
 *   - email.delivered  -> updates queue status to "delivered"
 *   - email.bounced    -> updates queue status to "bounced"
 *   - email.complained -> updates queue status to "bounced" (spam complaint)
 *
 * The handler:
 *   1. Parses the JSON body from the webhook POST
 *   2. Validates Svix signature headers if RESEND_WEBHOOK_SECRET is configured
 *   3. Maps Resend event types to internal email queue statuses
 *   4. Finds the queue record by resendId and updates its status
 *
 * Security:
 *   - Svix signature verification (svix-id, svix-timestamp, svix-signature)
 *   - Timestamp replay protection (rejects events older than 5 minutes)
 *   - If no secret is configured, processes anyway (development mode) with a warning
 */

import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveServiceKey } from "../helpers/serviceKeys";

export const resendWebhookHandler = httpAction(async (ctx, request) => {
  // 1. Parse the request body
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 2. Verify Svix webhook signature (if secret is configured)
  // Read from settings table first, fall back to env var
  const emailSettings = await ctx.runQuery(
    internal.settings.internals.getInternal,
    { section: "email" },
  ) as Record<string, unknown> | null;

  const webhookSecret = resolveServiceKey(emailSettings, "webhookSecret", "RESEND_WEBHOOK_SECRET");
  if (webhookSecret) {
    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return new Response(
        JSON.stringify({ error: "Missing webhook signature headers" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Timestamp replay protection: reject events older than 5 minutes
    const timestamp = parseInt(svixTimestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (isNaN(timestamp) || Math.abs(now - timestamp) > 300) {
      return new Response(
        JSON.stringify({ error: "Webhook timestamp expired or invalid" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // HMAC signature verification using Svix signing scheme
    // Svix signs: "{svix-id}.{svix-timestamp}.{body}"
    // The secret is base64-encoded with a "whsec_" prefix
    try {
      const secretBytes = base64Decode(webhookSecret.replace("whsec_", ""));
      const signaturePayload = `${svixId}.${svixTimestamp}.${JSON.stringify(body)}`;

      const key = await crypto.subtle.importKey(
        "raw",
        secretBytes,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );

      const signatureBytes = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(signaturePayload),
      );

      const expectedSignature = arrayBufferToBase64(signatureBytes);

      // Svix sends multiple signatures separated by spaces, each prefixed with "v1,"
      const signatures = svixSignature.split(" ");
      const isValid = signatures.some((sig) => {
        const parts = sig.split(",");
        return parts.length === 2 && parts[1] === expectedSignature;
      });

      if (!isValid) {
        return new Response(
          JSON.stringify({ error: "Invalid webhook signature" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    } catch (err) {
      console.error("Webhook signature verification error:", err);
      return new Response(
        JSON.stringify({ error: "Signature verification failed" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  } else {
    // No secret configured -- log warning but still process (development mode)
    console.warn(
      "RESEND_WEBHOOK_SECRET is not configured. " +
        "Webhook signature verification is disabled. " +
        "Set this environment variable in production.",
    );
  }

  // 3. Extract event type and Resend email ID
  const eventType = body.type as string | undefined;
  const data = body.data as Record<string, unknown> | undefined;
  const resendId = data?.email_id as string | undefined;

  if (!resendId || !eventType) {
    // Acknowledge receipt even if we can't process (prevents retries)
    return new Response(
      JSON.stringify({ received: true, processed: false }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 4. Map Resend event types to internal email queue statuses
  let newStatus: string | null = null;
  if (eventType === "email.delivered") {
    newStatus = "delivered";
  } else if (eventType === "email.bounced") {
    newStatus = "bounced";
  } else if (eventType === "email.complained") {
    // Spam complaint -- treat as bounced (we don't have a separate "complained" status)
    newStatus = "bounced";
  }

  // 5. Update the queue record if we have a valid status transition
  if (newStatus) {
    try {
      await ctx.runMutation(internal.emails.internals.updateStatusByResendId, {
        resendId,
        status: newStatus,
      });
    } catch (err) {
      // Log the error but still return 200 to prevent Resend from retrying
      console.error(
        `Failed to update email queue for resendId=${resendId}, status=${newStatus}:`,
        err,
      );
    }
  }

  return new Response(
    JSON.stringify({ received: true, processed: !!newStatus }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Decode a base64 string into a Uint8Array. */
function base64Decode(str: string): Uint8Array {
  const binaryString = atob(str);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/** Encode an ArrayBuffer to a base64 string. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
