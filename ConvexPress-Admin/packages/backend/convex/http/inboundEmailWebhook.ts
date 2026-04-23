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
 * Security: we do not verify provider signatures here (different per
 * provider and each channel may be a different vendor). Mailbox
 * secrecy comes from the per-channel code in the URL. Add provider
 * signature verification behind the channel record's `config.secret`
 * when specific channels require it.
 */

import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  extractTicketToken,
  parseInboundEmail,
  stripEmailBoilerplate,
} from "../support/inboundEmailParser";

export const inboundEmailWebhookHandler = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const channelCode = url.searchParams.get("channel") ?? "default-email";

  // Accept JSON or form-encoded payloads.
  let payload: any;
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      payload = await request.json();
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const formText = await request.text();
      const params = new URLSearchParams(formText);
      payload = Object.fromEntries(params.entries());
    } else if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const obj: Record<string, string> = {};
      // Convex runtime exposes FormData with iteration via forEach.
      (form as any).forEach((v: FormDataEntryValue, k: string) => {
        obj[k] = typeof v === "string" ? v : "";
      });
      payload = obj;
    } else {
      // Fallback: try JSON.
      payload = await request.json().catch(() => null);
    }
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid body" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const normalized = parseInboundEmail(payload);
  if (!normalized) {
    return new Response(
      JSON.stringify({ error: "Unrecognized payload shape" }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    );
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

  return new Response(
    JSON.stringify({ ok: true, provider: normalized.provider }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
