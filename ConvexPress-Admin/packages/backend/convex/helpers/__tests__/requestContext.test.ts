/**
 * Request context (PR 081): the website server seals the visitor's address
 * and browser; the backend opens only what that secret sealed, while it is
 * current. Anything else reads as no context.
 */
import { describe, expect, test } from "bun:test";
import { isIpAddress, openRequestContextWith, REQUEST_CONTEXT_DOMAIN } from "../requestContext";

// Shared with ConvexPress-Website src/lib/request-context-seal.test.ts, which seals it.
const SECRET = "test-secret-0123456789-abcdefghijklmnop";
const VECTOR =
  "v1.eyJpcCI6IjIwMy4wLjExMy45IiwidWEiOiJNb3ppbGxhLzUuMCAoVGVzdCkiLCJpYXQiOjE4MDAwMDAwMDAwMDAsImV4cCI6MTgwMDAwMDYwMDAwMH0.6238011d5eb33a56b9bd9a43acb7be909826baf37f426536b7f22700127119df";
const NOW = 1_800_000_000_000;

const encoder = new TextEncoder();
async function seal(claims: Record<string, unknown>, secret = SECRET): Promise<string> {
  const body = btoa(JSON.stringify(claims)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(REQUEST_CONTEXT_DOMAIN + body)));
  return `v1.${body}.${Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

describe("request context", () => {
  test("opens the website's test vector", async () => {
    expect(await openRequestContextWith(VECTOR, SECRET, NOW + 1_000)).toEqual({ ip: "203.0.113.9", userAgent: "Mozilla/5.0 (Test)" });
  });

  test("reads anything forged, altered, expired or unsealed as no context", async () => {
    const [version, body, signature] = VECTOR.split(".");
    expect(await openRequestContextWith(VECTOR, "another-secret-0123456789-abcdefghijk", NOW)).toBeNull();
    expect(await openRequestContextWith(`${version}.${body}x.${signature}`, SECRET, NOW)).toBeNull();
    expect(await openRequestContextWith(`${version}.${body}.${"0".repeat(64)}`, SECRET, NOW)).toBeNull();
    expect(await openRequestContextWith(VECTOR, SECRET, NOW + 600_001)).toBeNull();
    expect(await openRequestContextWith(VECTOR, undefined, NOW)).toBeNull();
    expect(await openRequestContextWith(VECTOR, "short", NOW)).toBeNull();
    expect(await openRequestContextWith(undefined, SECRET, NOW)).toBeNull();
    expect(await openRequestContextWith("203.0.113.9", SECRET, NOW)).toBeNull();
    // Dated ahead of the clock, or living longer than fifteen minutes.
    expect(await openRequestContextWith(await seal({ iat: NOW + 120_000, exp: NOW + 300_000 }), SECRET, NOW)).toBeNull();
    expect(await openRequestContextWith(await seal({ iat: NOW, exp: NOW + 16 * 60_000 }), SECRET, NOW)).toBeNull();
  });

  test("keeps only a real address and a trimmed browser", async () => {
    const token = await seal({ ip: "not-an-ip", ua: "  Mozilla/5.0  ", iat: NOW, exp: NOW + 60_000 });
    expect(await openRequestContextWith(token, SECRET, NOW)).toEqual({ userAgent: "Mozilla/5.0" });
    expect(isIpAddress("203.0.113.9")).toBe(true);
    expect(isIpAddress("2001:db8::1")).toBe(true);
    expect(isIpAddress("::ffff:203.0.113.9")).toBe(true);
    expect(isIpAddress("256.1.1.1")).toBe(false);
    expect(isIpAddress("2001::db8::1")).toBe(false);
    expect(isIpAddress("<script>")).toBe(false);
  });
});
