import { describe, expect, test } from "bun:test";

import { afterSignInPath, isAbsoluteDestination, sanitizeRedirectUrl } from "./redirect";

const base = "https://www.example.com";

describe("sign-in destinations", () => {
  test("same-site paths pass; protocol-relative and foreign hosts fall back", () => {
    expect(sanitizeRedirectUrl("/dashboard/orders", { baseOrigin: base })).toBe("/dashboard/orders");
    expect(sanitizeRedirectUrl("//evil.example/steal", { baseOrigin: base })).toBe(afterSignInPath());
    expect(sanitizeRedirectUrl("https://evil.example/", { baseOrigin: base })).toBe(afterSignInPath());
    expect(sanitizeRedirectUrl("javascript:alert(1)", { baseOrigin: base })).toBe(afterSignInPath());
  });

  test("the site's own absolute URLs become paths; a listed host stays absolute", () => {
    expect(sanitizeRedirectUrl(`${base}/help?x=1`, { baseOrigin: base })).toBe("/help?x=1");
    const portal = sanitizeRedirectUrl("https://portal.example.com/", { baseOrigin: base, allowedHosts: ["portal.example.com"] });
    expect(portal).toBe("https://portal.example.com/");
    expect(isAbsoluteDestination(portal)).toBe(true);
  });

  test("ConvexPress's own domains are not trusted on every site", () => {
    expect(sanitizeRedirectUrl("https://admin.convexpress.com/", { baseOrigin: base })).toBe(afterSignInPath());
  });

  test("the default destination is /dashboard unless the site configures another", () => {
    expect(afterSignInPath()).toBe("/dashboard");
    expect(sanitizeRedirectUrl(undefined, { fallbackPath: "/account" })).toBe("/account");
  });
});
