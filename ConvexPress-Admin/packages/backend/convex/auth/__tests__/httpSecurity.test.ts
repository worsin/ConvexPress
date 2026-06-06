import { afterEach, describe, expect, test } from "bun:test";

import { getAllowedAuthOrigin } from "../httpSecurity";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env.AUTH_ALLOWED_ORIGINS = ORIGINAL_ENV.AUTH_ALLOWED_ORIGINS;
  process.env.AUTH_ADMIN_ORIGIN = ORIGINAL_ENV.AUTH_ADMIN_ORIGIN;
  process.env.AUTH_ALLOW_LOCALHOST_ORIGINS =
    ORIGINAL_ENV.AUTH_ALLOW_LOCALHOST_ORIGINS;
  process.env.AUTH_ALLOW_NULL_ORIGIN = ORIGINAL_ENV.AUTH_ALLOW_NULL_ORIGIN;
  process.env.AUTH_ISSUER_URL = ORIGINAL_ENV.AUTH_ISSUER_URL;
});

describe("getAllowedAuthOrigin", () => {
  test("allows same-site requests without an Origin header", () => {
    expect(getAllowedAuthOrigin(null)).toBe("");
    expect(getAllowedAuthOrigin("")).toBe("");
  });

  test("allows localhost development origins", () => {
    expect(getAllowedAuthOrigin("http://localhost:4105")).toBe(
      "http://localhost:4105",
    );
    expect(getAllowedAuthOrigin("http://127.0.0.1:4105")).toBe(
      "http://127.0.0.1:4105",
    );
  });

  test("can explicitly disable localhost development fallback", () => {
    process.env.AUTH_ALLOW_LOCALHOST_ORIGINS = "false";

    expect(getAllowedAuthOrigin("http://localhost:4105")).toBeNull();
    expect(getAllowedAuthOrigin("http://127.0.0.1:4105")).toBeNull();
  });

  test("allows configured origins", () => {
    process.env.AUTH_ALLOWED_ORIGINS =
      "https://admin.example.com, https://other.example.com/path";

    expect(getAllowedAuthOrigin("https://admin.example.com")).toBe(
      "https://admin.example.com",
    );
    expect(getAllowedAuthOrigin("https://other.example.com")).toBe(
      "https://other.example.com",
    );
  });

  test("allows the configured auth issuer origin", () => {
    process.env.AUTH_ISSUER_URL = "https://issuer.example.com/some/path";

    expect(getAllowedAuthOrigin("https://issuer.example.com")).toBe(
      "https://issuer.example.com",
    );
  });

  test("requires explicit opt-in for Electron null origin", () => {
    expect(getAllowedAuthOrigin("null")).toBeNull();

    process.env.AUTH_ALLOW_NULL_ORIGIN = "true";
    expect(getAllowedAuthOrigin("null")).toBe("null");
  });

  test("rejects unconfigured remote origins", () => {
    process.env.AUTH_ALLOWED_ORIGINS = "https://admin.example.com";

    expect(getAllowedAuthOrigin("https://evil.example.com")).toBeNull();
  });

  test("configured allowlist disables unlisted localhost by default", () => {
    process.env.AUTH_ALLOWED_ORIGINS = "https://admin.example.com";

    expect(getAllowedAuthOrigin("http://127.0.0.1:4105")).toBeNull();

    process.env.AUTH_ALLOW_LOCALHOST_ORIGINS = "true";
    expect(getAllowedAuthOrigin("http://127.0.0.1:4105")).toBe(
      "http://127.0.0.1:4105",
    );
  });
});
