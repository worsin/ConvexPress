import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { getRequestConvexUrl, getSiteRuntime, readServerConvexOrigins, siteRuntimeBootstrapScript } from "./site-runtime";

const NAMES = [
  "CONVEXPRESS_CONVEX_URL",
  "CONVEXPRESS_CONVEX_SITE_URL",
  "CONVEXPRESS_CONVEX_SERVER_URL",
  "CONVEXPRESS_CONVEX_SERVER_SITE_URL",
  "VITE_CONVEX_URL",
  "VITE_CONVEX_SITE_URL",
] as const;

let saved: Partial<Record<(typeof NAMES)[number], string>> = {};

beforeEach(() => {
  saved = {};
  for (const name of NAMES) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
  process.env.CONVEXPRESS_CONVEX_URL = "https://api.example.com";
  process.env.CONVEXPRESS_CONVEX_SITE_URL = "https://site.example.com";
});

afterEach(() => {
  for (const name of NAMES) {
    const value = saved[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("the server's own Convex origins", () => {
  test("without a private address, the server uses the public one", () => {
    expect(readServerConvexOrigins()).toEqual({ convexUrl: "https://api.example.com", convexSiteUrl: "https://site.example.com" });
    expect(getRequestConvexUrl()).toBe("https://api.example.com");
  });

  test("a private address is used for the server's requests, its HTTP actions one port up", () => {
    process.env.CONVEXPRESS_CONVEX_SERVER_URL = "http://127.0.0.1:3230";
    expect(readServerConvexOrigins()).toEqual({ convexUrl: "http://127.0.0.1:3230", convexSiteUrl: "http://127.0.0.1:3231" });
    expect(getRequestConvexUrl()).toBe("http://127.0.0.1:3230");
  });

  test("a private HTTP-actions address can be given", () => {
    process.env.CONVEXPRESS_CONVEX_SERVER_URL = "http://convex.internal:3210";
    process.env.CONVEXPRESS_CONVEX_SERVER_SITE_URL = "http://convex-site.internal:3211";
    expect(readServerConvexOrigins()).toEqual({ convexUrl: "http://convex.internal:3210", convexSiteUrl: "http://convex-site.internal:3211" });
  });

  test("the private address never reaches the browser", () => {
    process.env.CONVEXPRESS_CONVEX_SERVER_URL = "http://10.0.0.7:3230";
    process.env.CONVEXPRESS_CONVEX_SERVER_SITE_URL = "http://10.0.0.7:3231";
    const runtime = getSiteRuntime();
    expect(runtime.convexUrl).toBe("https://api.example.com");
    expect(runtime.convexSiteUrl).toBe("https://site.example.com");
    expect(siteRuntimeBootstrapScript(runtime)).not.toContain("10.0.0.7");
  });
});
