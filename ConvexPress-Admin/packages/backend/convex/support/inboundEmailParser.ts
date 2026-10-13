/**
 * Support Integration — inbound email payload parser (Wave 13).
 *
 * Pure helpers that translate provider-specific inbound-email webhook
 * payloads (Postmark, Mailgun, SendGrid Inbound Parse) into a
 * normalized shape the ticket creator consumes. No DB / no ctx — fully
 * unit-testable.
 */

export type NormalizedInboundEmail = {
  externalId: string;
  fromEmail: string;
  fromName?: string;
  toEmail: string;
  subject: string;
  body: string;
  htmlBody?: string;
  threadKey?: string;        // Message-ID or thread identifier for threading
  inReplyToKey?: string;     // Preceding message ID
  receivedAt: number;
  provider: "postmark" | "mailgun" | "sendgrid" | "unknown";
};

type Payload = Record<string, unknown>;

/** The payload as a plain object, or null. */
function payloadRecord(value: unknown): Payload | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...value }
    : null;
}

/** A field of a nested object, or undefined. */
function field(value: unknown, key: string): unknown {
  return payloadRecord(value)?.[key];
}

/** The first entry of an array, or undefined. */
function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : undefined;
}

/** A text value, or undefined. */
function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** A provider timestamp (ISO text or epoch number) as epoch ms, or now. */
function dateMs(value: unknown): number {
  return (typeof value === "string" || typeof value === "number") && value
    ? new Date(value).getTime()
    : Date.now();
}

export function parsePostmarkPayload(raw: unknown): NormalizedInboundEmail | null {
  const p = payloadRecord(raw);
  if (!p) return null;
  // Prefer FromFull.Email (bare email) over From (may be "Name <email>").
  const from = field(p.FromFull, "Email") ?? p.From ?? "";
  const to = field(first(p.ToFull), "Email") ?? p.To ?? "";
  if (!from) return null;
  const headers = Array.isArray(p.Headers) ? p.Headers : [];
  return {
    externalId: String(p.MessageID ?? `${String(from)}-${String(p.Date ?? Date.now())}`),
    fromEmail: String(from).toLowerCase().trim(),
    fromName: text(field(p.FromFull, "Name")),
    toEmail: String(to).toLowerCase().trim(),
    subject: String(p.Subject ?? "(no subject)").trim(),
    body: String(p.TextBody ?? p.HtmlBody ?? "").trim(),
    htmlBody: p.HtmlBody ? String(p.HtmlBody) : undefined,
    threadKey: p.MessageID ? String(p.MessageID) : undefined,
    inReplyToKey: text(field(headers.find((h) => field(h, "Name") === "In-Reply-To"), "Value")),
    receivedAt: dateMs(p.Date),
    provider: "postmark",
  };
}

export function parseMailgunPayload(raw: unknown): NormalizedInboundEmail | null {
  const p = payloadRecord(raw);
  if (!p) return null;
  const from = p.sender ?? p.from ?? "";
  const to = p.recipient ?? p.to ?? "";
  if (!from) return null;
  return {
    externalId: String(
      p["Message-Id"] ?? p.token ?? `${String(from)}-${String(p.timestamp ?? Date.now())}`,
    ),
    fromEmail: String(from).toLowerCase().trim(),
    fromName: text(p["from-name"]),
    toEmail: String(to).toLowerCase().trim(),
    subject: String(p.subject ?? "(no subject)").trim(),
    body: String(p["body-plain"] ?? p["stripped-text"] ?? p["body-html"] ?? "").trim(),
    htmlBody: p["body-html"] ? String(p["body-html"]) : undefined,
    threadKey: p["Message-Id"] ? String(p["Message-Id"]) : undefined,
    inReplyToKey: p["In-Reply-To"] ? String(p["In-Reply-To"]) : undefined,
    receivedAt: p.timestamp ? Number(p.timestamp) * 1000 : Date.now(),
    provider: "mailgun",
  };
}

export function parseSendGridPayload(raw: unknown): NormalizedInboundEmail | null {
  const p = payloadRecord(raw);
  if (!p) return null;
  const from = p.from ?? "";
  const to = p.to ?? first(field(p.envelope, "to")) ?? "";
  if (!from) return null;
  // SendGrid `from` can look like `"Name <email@host>"`; extract.
  const fromText = String(from);
  const match = fromText.match(/<([^>]+)>/);
  const fromEmail = (match ? match[1] : fromText).toLowerCase().trim();
  const fromName = match ? fromText.replace(/<[^>]+>/, "").trim().replace(/^"|"$/g, "") : undefined;
  const headers = text(p.headers);
  return {
    externalId: String(
      headers?.match(/Message-ID:\s*<([^>]+)>/i)?.[1] ??
        `${fromEmail}-${Date.now()}`,
    ),
    fromEmail,
    fromName,
    toEmail: String(to).toLowerCase().trim(),
    subject: String(p.subject ?? "(no subject)").trim(),
    body: String(p.text ?? p.html ?? "").trim(),
    htmlBody: p.html ? String(p.html) : undefined,
    receivedAt: Date.now(),
    provider: "sendgrid",
  };
}

/**
 * Auto-detect provider from payload shape. Postmark has `FromFull`,
 * Mailgun has `body-plain`, SendGrid has `envelope`.
 */
export function parseInboundEmail(raw: unknown): NormalizedInboundEmail | null {
  const p = payloadRecord(raw);
  if (!p) return null;
  if (p.FromFull || p.MessageID) return parsePostmarkPayload(p);
  if (p["body-plain"] !== undefined || p.sender) return parseMailgunPayload(p);
  if (p.envelope || p.headers) return parseSendGridPayload(p);
  // Generic fallback — try each parser.
  return (
    parsePostmarkPayload(p) ??
    parseMailgunPayload(p) ??
    parseSendGridPayload(p)
  );
}

/**
 * Strip common email signature + reply-quote boilerplate so ticket
 * messages are clean. Matches the patterns GMail / Outlook / AppleMail
 * insert above a quoted reply.
 */
export function stripEmailBoilerplate(body: string): string {
  if (!body) return body;
  const markers = [
    /^On .+ wrote:$/m,                   // GMail
    /^-{2,}\s*Original Message\s*-{2,}/mi,// Outlook
    /^From:.+<.+>/m,                      // Outlook forward
    /^________+$/m,                       // Outlook thread divider
    /^Sent from my (iPhone|iPad|Android)/mi,
  ];
  let cut = body.length;
  for (const marker of markers) {
    const match = body.match(marker);
    if (match && typeof match.index === "number" && match.index < cut) {
      cut = match.index;
    }
  }
  return body.slice(0, cut).trim();
}

/**
 * Extract a ticket number from a subject line like
 * `Re: Your question [TKT-202604-00001]`. Returns the full ticket
 * number (e.g. `TKT-202604-00001`) or undefined.
 */
export function extractTicketToken(subject: string): string | undefined {
  const m = subject.match(/\[(TKT-\d{6}-\d{5})\]/);
  return m ? m[1] : undefined;
}
