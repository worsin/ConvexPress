/**
 * Inbound Email Webhook (Wave 13).
 *
 * POST /webhooks/inbound-email?channel=<code>
 *
 * Accepts raw inbound-email webhook payloads from Postmark, Mailgun,
 * and SendGrid Inbound Parse. The provider is auto-detected from the
 * payload shape; the `channel` query param maps the payload to a
 * `support_channels` row (so the same endpoint can serve multiple
 * mailboxes).
 *
 * Flow:
 *   1. Parse JSON body (or application/x-www-form-urlencoded for Mailgun/
 *      SendGrid depending on configuration).
 *   2. Normalize via `parseInboundEmail` — pure function, no DB.
 *   3. Strip boilerplate + extract any `[TKT-YYYYMM-NNNNN]` token from subject.
 *   4. Schedule `internal.support.inboundEmail.recordInboundEmail` so the
 *      webhook returns 2xx fast and persistence runs in a mutation context.
 *   5. Return 200. Any persistence failure is visible in the
 *      support_inbound_events table (status="error"), never via HTTP.
 *
 * Security: each channel must be signed by default. Store
 * `config.signingSecret` (or `config.secret`) on the support channel and send
 * `X-ConvexPress-Signature: sha256=<hmac>` over the raw request body. Local
 * test channels may set `config.allowUnsigned: true`; otherwise unsigned
 * inbound email is rejected before parsing or ticket creation.
 */

import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  extractTicketToken,
  parseInboundEmail,
  stripEmailBoilerplate,
} from "../support/inboundEmailParser";
import { verifyInboundWebhookSignature } from "../support/inboundSecurity";

export const inboundEmailWebhookHandler = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const channelCode = url.searchParams.get("channel") ?? "default-email";
  const securityResult = (await ctx.runQuery(
    internal.support.inboundEmail.getInboundChannelSecurity,
    { channelCode },
  )) as
    | { exists: false; active: false }
    | {
        exists: true;
        active: boolean;
        security: {
          signingSecret: string | null;
          allowUnsigned: boolean;
          signatureHeader: string;
          timestampHeader: string | null;
          toleranceSeconds: number;
        };
      };

  if (!securityResult.exists) {
    return json({ error: "Inbound channel not found" }, 404);
  }
  if (!securityResult.active) {
    return json({ error: "Inbound channel is inactive" }, 403);
  }

  const rawBody = await request.text();
  const security = securityResult.security;
  if (security.signingSecret) {
    const valid = await verifyInboundWebhookSignature({
      secret: security.signingSecret,
      payload: rawBody,
      signatureHeader: request.headers.get(security.signatureHeader),
      timestampHeader: security.timestampHeader
        ? request.headers.get(security.timestampHeader)
        : null,
      toleranceSeconds: security.toleranceSeconds,
    });
    if (!valid) {
      return json({ error: "Invalid inbound webhook signature" }, 401);
    }
  } else if (!security.allowUnsigned) {
    return json(
      {
        error:
          "Inbound channel is not configured for signed webhooks. Add config.signingSecret or set config.allowUnsigned for a test-only channel.",
      },
      403,
    );
  }

  // Accept JSON or form-encoded payloads.
  let payload: any;
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      payload = JSON.parse(rawBody);
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(rawBody);
      payload = Object.fromEntries(params.entries());
    } else if (contentType.includes("multipart/form-data")) {
      return json(
        {
          error:
            "multipart/form-data inbound email is disabled for signed channels. Configure the provider to send JSON or form-encoded payloads.",
        },
        415,
      );
    } else {
      // Fallback: try JSON.
      payload = rawBody ? JSON.parse(rawBody) : null;
    }
  } catch {
    return json({ error: "Invalid body" }, 400);
  }

  const normalized = parseInboundEmail(payload);
  if (!normalized) {
    return json({ error: "Unrecognized payload shape" }, 422);
  }

  const cleanBody = stripEmailBoilerplate(normalized.body);
  const ticketToken = extractTicketToken(normalized.subject);

  await ctx.scheduler.runAfter(
    0,
    internal.support.inboundEmail.recordInboundEmail,
    {
      channelCode,
      externalId: normalized.externalId,
      fromEmail: normalized.fromEmail,
      fromName: normalized.fromName,
      subject: normalized.subject,
      body: cleanBody,
      rawPayload: JSON.stringify(payload),
      ticketNumber: ticketToken,
      receivedAt: normalized.receivedAt,
    },
  );

  return json({ ok: true, provider: normalized.provider }, 200);
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
