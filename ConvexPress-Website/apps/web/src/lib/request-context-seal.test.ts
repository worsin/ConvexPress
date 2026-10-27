import { describe, expect, test } from "bun:test";

import { headerAddress, requestContextFor, sealRequestContext } from "./request-context-seal";

// Shared with ConvexPress-Admin convex/helpers/__tests__/requestContext.test.ts,
// which opens it: the two sides must agree byte for byte.
const SECRET = "test-secret-0123456789-abcdefghijklmnop";
const VECTOR =
  "v1.eyJpcCI6IjIwMy4wLjExMy45IiwidWEiOiJNb3ppbGxhLzUuMCAoVGVzdCkiLCJpYXQiOjE4MDAwMDAwMDAwMDAsImV4cCI6MTgwMDAwMDYwMDAwMH0.6238011d5eb33a56b9bd9a43acb7be909826baf37f426536b7f22700127119df";
const NOW = 1_800_000_000_000;

function decode(token: string): unknown {
  const body = token.split(".")[1] ?? "";
  return JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
}

describe("request context seal", () => {
  test("seals the shared test vector", async () => {
    expect(await sealRequestContext({ ip: "203.0.113.9", ua: "Mozilla/5.0 (Test)", iat: NOW, exp: NOW + 600_000 }, SECRET)).toBe(VECTOR);
  });

  test("takes the address only from the header the site trusts", async () => {
    const headers = new Headers({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1", "user-agent": "Mozilla/5.0 (Test)" });
    const trusted = await requestContextFor(headers, { CONVEXPRESS_REQUEST_CONTEXT_SECRET: SECRET, CONVEXPRESS_CLIENT_IP_HEADER: "CF-Connecting-IP" }, NOW);
    expect(trusted).toBe(VECTOR);
    // No trusted header named: the browser is still recorded, the address isn't guessed.
    const untrusted = await requestContextFor(headers, { CONVEXPRESS_REQUEST_CONTEXT_SECRET: SECRET }, NOW);
    expect(untrusted ? decode(untrusted) : null).toEqual({ ua: "Mozilla/5.0 (Test)", iat: NOW, exp: NOW + 600_000 });
  });

  test("seals nothing without a long enough secret", async () => {
    const headers = new Headers({ "user-agent": "Mozilla/5.0 (Test)" });
    expect(await requestContextFor(headers, {}, NOW)).toBeNull();
    expect(await requestContextFor(headers, { CONVEXPRESS_REQUEST_CONTEXT_SECRET: "short" }, NOW)).toBeNull();
  });

  test("reads the first address of a proxy header, and nothing that isn't one", () => {
    expect(headerAddress("203.0.113.9, 10.0.0.1")).toBe("203.0.113.9");
    expect(headerAddress("2001:db8::1")).toBe("2001:db8::1");
    expect(headerAddress("<script>")).toBeUndefined();
    expect(headerAddress("")).toBeUndefined();
    expect(headerAddress(null)).toBeUndefined();
  });
});
