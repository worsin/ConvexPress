import { describe, expect, test } from "bun:test";

import {
  constantTimeEqual,
  hmacSha256Hex,
  normalizeWebhookSignature,
  parseInboundChannelSecurity,
  verifyInboundWebhookSignature,
} from "../inboundSecurity";

describe("inbound webhook security helpers", () => {
  test("parses secure defaults from channel config", () => {
    expect(parseInboundChannelSecurity({})).toEqual({
      signingSecret: null,
      allowUnsigned: false,
      signatureHeader: "x-convexpress-signature",
      timestampHeader: "x-convexpress-timestamp",
      toleranceSeconds: 300,
    });
  });

  test("supports secret aliases and custom headers", () => {
    expect(
      parseInboundChannelSecurity({
        secret: "  test_secret  ",
        allowUnsigned: true,
        signatureHeader: "X-Postmark-Signature",
        timestampHeader: "X-Postmark-Timestamp",
        toleranceSeconds: 30,
      }),
    ).toEqual({
      signingSecret: "test_secret",
      allowUnsigned: true,
      signatureHeader: "x-postmark-signature",
      timestampHeader: "x-postmark-timestamp",
      toleranceSeconds: 30,
    });
  });

  test("normalizes sha256-prefixed signatures", () => {
    expect(normalizeWebhookSignature("sha256=ABC123")).toBe("abc123");
    expect(normalizeWebhookSignature("abc123,sha256=ignored")).toBe("abc123");
  });

  test("compares same-length values in constant time", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });

  test("verifies HMAC signatures and timestamp tolerance", async () => {
    const payload = JSON.stringify({ Subject: "Hello" });
    const signature = await hmacSha256Hex("secret", payload);

    await expect(
      verifyInboundWebhookSignature({
        secret: "secret",
        payload,
        signatureHeader: `sha256=${signature}`,
        timestampHeader: "100",
        nowMs: 100_000,
        toleranceSeconds: 5,
      }),
    ).resolves.toBe(true);

    await expect(
      verifyInboundWebhookSignature({
        secret: "secret",
        payload,
        signatureHeader: `sha256=${signature}`,
        timestampHeader: "1",
        nowMs: 100_000,
        toleranceSeconds: 5,
      }),
    ).resolves.toBe(false);
  });
});
