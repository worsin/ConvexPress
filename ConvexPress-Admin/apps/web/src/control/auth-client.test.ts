import { describe, expect, test } from "bun:test";

import {
  generateControlClaimSecret,
  prepareControlIdentity,
} from "./auth-client";

describe("outer operator invitation claim", () => {
  test("normalizes the exact provisioned email and requires a usable name", () => {
    expect(prepareControlIdentity(" Operator@Example.COM ", "  Taylor Smith ")).toEqual({
      email: "operator@example.com",
      name: "Taylor Smith",
    });
    expect(prepareControlIdentity("operator@example.com", "")).toEqual({
      email: "operator@example.com",
      name: "operator",
    });
  });

  test("generates a 256-bit URL-safe one-time claim secret", () => {
    const first = generateControlClaimSecret();
    const second = generateControlClaimSecret();
    expect(/^[A-Za-z0-9_-]{43}$/u.test(first)).toBe(true);
    expect(/^[A-Za-z0-9_-]{43}$/u.test(second)).toBe(true);
    expect(second === first).toBe(false);
  });
});
