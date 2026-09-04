import { describe, expect, test } from "bun:test";

import {
  DASHBOARD_CONFIG_DEFAULTS,
  buildDashboardPath,
  isUnderBasePath,
  legacyDashboardRedirect,
  normalizeBasePath,
  renderWelcomeHeadline,
  resolveDashboardConfig,
  stripBasePath,
} from "./config";

describe("normalizeBasePath", () => {
  test("adds a leading slash and strips trailing slashes", () => {
    expect(normalizeBasePath("account/")).toBe("/account");
    expect(normalizeBasePath("/account//area/")).toBe("/account/area");
  });
  test("falls back to the default for empty or root input", () => {
    expect(normalizeBasePath("")).toBe("/dashboard");
    expect(normalizeBasePath("/")).toBe("/dashboard");
    expect(normalizeBasePath(undefined)).toBe("/dashboard");
  });
  test("drops query strings and hashes", () => {
    expect(normalizeBasePath("/my-account?x=1#top")).toBe("/my-account");
  });
});

describe("resolveDashboardConfig", () => {
  test("returns defaults for null", () => {
    expect(resolveDashboardConfig(null)).toEqual(DASHBOARD_CONFIG_DEFAULTS);
  });
  test("merges partial config and rejects invalid enum values", () => {
    const config = resolveDashboardConfig({
      basePath: "account",
      layout: "sideways" as never,
      footerVariant: "none",
      sidebarWidth: 5000,
      showSearch: true,
    });
    expect(config.basePath).toBe("/account");
    expect(config.layout).toBe("sidebar");
    expect(config.footerVariant).toBe("none");
    expect(config.sidebarWidth).toBe(360);
    expect(config.showSearch).toBe(true);
  });
  test("keeps an empty menu location (generated fallback) as empty", () => {
    expect(resolveDashboardConfig({ sidebarLocation: "  " }).sidebarLocation).toBe("");
  });
});

describe("buildDashboardPath", () => {
  test("returns the base for empty paths", () => {
    expect(buildDashboardPath("/dashboard", "")).toBe("/dashboard");
    expect(buildDashboardPath("/dashboard", "/")).toBe("/dashboard");
  });
  test("joins nested paths without duplicate slashes", () => {
    expect(buildDashboardPath("/account/", "orders")).toBe("/account/orders");
    expect(buildDashboardPath("/account", "/orders/abc/return")).toBe("/account/orders/abc/return");
  });
  test("preserves query strings", () => {
    expect(buildDashboardPath("/dashboard", "/help?q=refund")).toBe("/dashboard/help?q=refund");
  });
});

describe("stripBasePath / isUnderBasePath", () => {
  test("detects the base path and nested paths", () => {
    expect(isUnderBasePath("/account", "/account")).toBe(true);
    expect(isUnderBasePath("/account/", "/account")).toBe(true);
    expect(isUnderBasePath("/account/orders/1", "/account")).toBe(true);
    expect(isUnderBasePath("/accounts", "/account")).toBe(false);
    expect(isUnderBasePath("/", "/account")).toBe(false);
  });
  test("returns the remainder", () => {
    expect(stripBasePath("/account", "/account")).toBe("");
    expect(stripBasePath("/account/orders/1", "/account")).toBe("/orders/1");
    expect(stripBasePath("/blog/x", "/account")).toBeNull();
  });
});

describe("legacyDashboardRedirect", () => {
  test("returns null when the base path is /dashboard", () => {
    expect(legacyDashboardRedirect("/dashboard/orders", "/dashboard")).toBeNull();
  });
  test("maps /dashboard/* onto the configured base path, keeping the remainder and search", () => {
    expect(legacyDashboardRedirect("/dashboard", "/account")).toBe("/account");
    expect(legacyDashboardRedirect("/dashboard/orders/1", "/account", "?tab=items")).toBe(
      "/account/orders/1?tab=items",
    );
  });
  test("ignores unrelated paths", () => {
    expect(legacyDashboardRedirect("/blog", "/account")).toBeNull();
  });
});

describe("renderWelcomeHeadline", () => {
  test("substitutes the name", () => {
    expect(renderWelcomeHeadline("Welcome back, {name}", "Ada")).toBe("Welcome back, Ada");
  });
  test("drops the placeholder and dangling comma when the name is blank", () => {
    expect(renderWelcomeHeadline("Welcome back, {name}", "")).toBe("Welcome back");
    expect(renderWelcomeHeadline("Hi {name}, good to see you", null)).toBe("Hi good to see you");
  });
});
