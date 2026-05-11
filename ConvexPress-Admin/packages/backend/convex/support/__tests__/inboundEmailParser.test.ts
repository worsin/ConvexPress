import { describe, expect, test } from "bun:test";

import {
  extractTicketToken,
  parseInboundEmail,
  parseMailgunPayload,
  parsePostmarkPayload,
  parseSendGridPayload,
  stripEmailBoilerplate,
} from "../inboundEmailParser";

// ────────────────────────────────────────────────────────────────────
// parsePostmarkPayload
// ────────────────────────────────────────────────────────────────────

describe("parsePostmarkPayload", () => {
  test("returns null for non-object input", () => {
    expect(parsePostmarkPayload(null)).toBeNull();
    expect(parsePostmarkPayload("foo")).toBeNull();
  });

  test("returns null when From is missing", () => {
    expect(parsePostmarkPayload({ Subject: "hi" })).toBeNull();
  });

  test("normalizes a realistic Postmark payload", () => {
    const result = parsePostmarkPayload({
      MessageID: "abc-123",
      From: "Jane Doe <jane@example.com>",
      FromFull: { Email: "jane@example.com", Name: "Jane Doe" },
      ToFull: [{ Email: "support@example.io" }],
      Subject: "Help with my order",
      TextBody: "I need assistance.",
      HtmlBody: "<p>I need assistance.</p>",
      Date: "2026-04-22T12:00:00Z",
      Headers: [
        { Name: "In-Reply-To", Value: "<thread-42@mail.example.com>" },
      ],
    });
    expect(result).not.toBeNull();
    expect(result!.externalId).toBe("abc-123");
    expect(result!.fromEmail).toBe("jane@example.com");
    expect(result!.fromName).toBe("Jane Doe");
    expect(result!.toEmail).toBe("support@example.io");
    expect(result!.subject).toBe("Help with my order");
    expect(result!.body).toBe("I need assistance.");
    expect(result!.htmlBody).toBe("<p>I need assistance.</p>");
    expect(result!.threadKey).toBe("abc-123");
    expect(result!.inReplyToKey).toBe("<thread-42@mail.example.com>");
    expect(result!.provider).toBe("postmark");
    expect(result!.receivedAt).toBe(
      new Date("2026-04-22T12:00:00Z").getTime(),
    );
  });

  test("falls back to HtmlBody when TextBody missing", () => {
    const result = parsePostmarkPayload({
      From: "a@b.com",
      Subject: "s",
      HtmlBody: "<p>hi</p>",
    });
    expect(result!.body).toBe("<p>hi</p>");
  });
});

// ────────────────────────────────────────────────────────────────────
// parseMailgunPayload
// ────────────────────────────────────────────────────────────────────

describe("parseMailgunPayload", () => {
  test("normalizes a Mailgun payload", () => {
    const result = parseMailgunPayload({
      "Message-Id": "<mg-1@mail.com>",
      sender: "Foo <foo@example.com>",
      recipient: "support@example.io",
      subject: "Broken link",
      "body-plain": "clickable link is 404",
      "body-html": "<p>clickable link is 404</p>",
      timestamp: "1714000000",
    });
    expect(result).not.toBeNull();
    expect(result!.externalId).toBe("<mg-1@mail.com>");
    expect(result!.fromEmail).toBe("foo <foo@example.com>");
    expect(result!.toEmail).toBe("support@example.io");
    expect(result!.body).toBe("clickable link is 404");
    expect(result!.provider).toBe("mailgun");
    expect(result!.receivedAt).toBe(1714000000 * 1000);
  });

  test("returns null when sender is missing", () => {
    expect(parseMailgunPayload({ subject: "x" })).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────
// parseSendGridPayload
// ────────────────────────────────────────────────────────────────────

describe("parseSendGridPayload", () => {
  test("extracts email and name from bracketed from", () => {
    const result = parseSendGridPayload({
      from: '"Alice" <alice@example.com>',
      to: "support@example.io",
      subject: "Question",
      text: "How do I reset my password?",
      envelope: { to: ["support@example.io"] },
    });
    expect(result).not.toBeNull();
    expect(result!.fromEmail).toBe("alice@example.com");
    expect(result!.fromName).toBe("Alice");
    expect(result!.provider).toBe("sendgrid");
  });

  test("handles bare email from", () => {
    const result = parseSendGridPayload({
      from: "bob@example.com",
      to: "support@example.io",
      subject: "hi",
      text: "hello",
    });
    expect(result!.fromEmail).toBe("bob@example.com");
    expect(result!.fromName).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────
// parseInboundEmail (auto-detect)
// ────────────────────────────────────────────────────────────────────

describe("parseInboundEmail", () => {
  test("auto-detects Postmark via FromFull", () => {
    const r = parseInboundEmail({
      FromFull: { Email: "a@b.com" },
      From: "a@b.com",
      Subject: "x",
      TextBody: "y",
    });
    expect(r!.provider).toBe("postmark");
  });

  test("auto-detects Mailgun via body-plain", () => {
    const r = parseInboundEmail({
      sender: "a@b.com",
      "body-plain": "hi",
      subject: "x",
    });
    expect(r!.provider).toBe("mailgun");
  });

  test("auto-detects SendGrid via envelope", () => {
    const r = parseInboundEmail({
      from: "a@b.com",
      to: "s@x.io",
      envelope: { to: ["s@x.io"] },
      subject: "x",
      text: "hi",
    });
    expect(r!.provider).toBe("sendgrid");
  });

  test("returns null for unrecognized payload", () => {
    expect(parseInboundEmail({ random: "shape" })).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────
// stripEmailBoilerplate
// ────────────────────────────────────────────────────────────────────

describe("stripEmailBoilerplate", () => {
  test("strips GMail reply quote", () => {
    const out = stripEmailBoilerplate(
      "Thanks!\n\nOn Wed, Apr 22, 2026 at 10:00 AM Support <s@x.io> wrote:\n> hi",
    );
    expect(out).toBe("Thanks!");
  });

  test("strips Outlook Original Message divider", () => {
    const out = stripEmailBoilerplate(
      "My reply.\n\n-----Original Message-----\nFrom: x",
    );
    expect(out).toBe("My reply.");
  });

  test("strips mobile signature", () => {
    const out = stripEmailBoilerplate("My reply.\n\nSent from my iPhone");
    expect(out).toBe("My reply.");
  });

  test("returns empty string unchanged", () => {
    expect(stripEmailBoilerplate("")).toBe("");
  });

  test("leaves clean body unchanged", () => {
    expect(stripEmailBoilerplate("Clean body.")).toBe("Clean body.");
  });
});

// ────────────────────────────────────────────────────────────────────
// extractTicketToken
// ────────────────────────────────────────────────────────────────────

describe("extractTicketToken", () => {
  test("extracts TKT ticket number from subject", () => {
    expect(extractTicketToken("Re: Order issue [TKT-202604-00042]")).toBe(
      "TKT-202604-00042",
    );
  });

  test("returns undefined when no token", () => {
    expect(extractTicketToken("Re: hello")).toBeUndefined();
  });

  test("ignores invalid token shapes", () => {
    expect(extractTicketToken("[TKT-abc-def]")).toBeUndefined();
    expect(extractTicketToken("[T-202604-00042]")).toBeUndefined();
  });
});
