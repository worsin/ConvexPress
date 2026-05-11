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

export function parsePostmarkPayload(p: any): NormalizedInboundEmail | null {
  if (!p || typeof p !== "object") return null;
  // Prefer FromFull.Email (bare email) over From (may be "Name <email>").
  const from = p.FromFull?.Email ?? p.From ?? "";
  const to = p.ToFull?.[0]?.Email ?? p.To ?? "";
  if (!from) return null;
  return {
    externalId: String(p.MessageID ?? `${from}-${p.Date ?? Date.now()}`),
    fromEmail: String(from).toLowerCase().trim(),
    fromName: p.FromFull?.Name ?? undefined,
    toEmail: String(to).toLowerCase().trim(),
    subject: String(p.Subject ?? "(no subject)").trim(),
    body: String(p.TextBody ?? p.HtmlBody ?? "").trim(),
    htmlBody: p.HtmlBody ? String(p.HtmlBody) : undefined,
    threadKey: p.MessageID ? String(p.MessageID) : undefined,
    inReplyToKey:
      p.Headers?.find?.((h: any) => h.Name === "In-Reply-To")?.Value ?? undefined,
    receivedAt: p.Date ? new Date(p.Date).getTime() : Date.now(),
    provider: "postmark",
  };
}

export function parseMailgunPayload(p: any): NormalizedInboundEmail | null {
  if (!p || typeof p !== "object") return null;
  const from = p.sender ?? p.from ?? "";
  const to = p.recipient ?? p.to ?? "";
  if (!from) return null;
  return {
    externalId: String(
      p["Message-Id"] ?? p.token ?? `${from}-${p.timestamp ?? Date.now()}`,
    ),
    fromEmail: String(from).toLowerCase().trim(),
    fromName: p["from-name"] ?? undefined,
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

export function parseSendGridPayload(p: any): NormalizedInboundEmail | null {
  if (!p || typeof p !== "object") return null;
  const from = p.from ?? "";
  const to = p.to ?? p.envelope?.to?.[0] ?? "";
  if (!from) return null;
  // SendGrid `from` can look like `"Name <email@host>"`; extract.
  const match = String(from).match(/<([^>]+)>/);
  const fromEmail = (match ? match[1] : from).toLowerCase().trim();
  const fromName = match ? String(from).replace(/<[^>]+>/, "").trim().replace(/^"|"$/g, "") : undefined;
  return {
    externalId: String(
      p.headers?.match?.(/Message-ID:\s*<([^>]+)>/i)?.[1] ??
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
export function parseInboundEmail(p: any): NormalizedInboundEmail | null {
  if (!p || typeof p !== "object") return null;
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
