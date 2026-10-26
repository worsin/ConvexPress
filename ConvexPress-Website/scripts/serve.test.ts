import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { clerkFrontendApi, contentSecurityPolicy, readConfig, securityHeaders, staticFile } from "./serve.mjs";

const env = {
  CONVEXPRESS_CONVEX_URL: "https://api.example.com",
  CONVEXPRESS_CONVEX_SITE_URL: "https://site.example.com",
  CONVEXPRESS_SITE_URL: "https://www.example.com",
  CONVEXPRESS_INSTANCE_KEY: "example-production",
  // "example.clerk.accounts.dev$", base64.
  CONVEXPRESS_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("example.clerk.accounts.dev$").toString("base64")}`,
  PORT: "4051",
};

describe("self-hosted website runtime", () => {
  test("refuses to start without the site's configuration", () => {
    expect(readConfig({}).problems).toEqual([
      "CONVEXPRESS_CONVEX_URL is required",
      "CONVEXPRESS_SITE_URL is required",
      "CONVEXPRESS_INSTANCE_KEY is required (letters, digits, - _ :)",
    ]);
    expect(readConfig({ ...env, PORT: "99999" }).problems).toEqual(["PORT must be a port number"]);
    expect(readConfig({ ...env, CONVEXPRESS_FRAME_ANCESTORS: "javascript:alert(1)//" }).problems).toHaveLength(1);
    expect(readConfig(env).problems).toEqual([]);
  });

  test("reads the Clerk Frontend API host from the publishable key", () => {
    expect(clerkFrontendApi(env.CONVEXPRESS_CLERK_PUBLISHABLE_KEY)).toBe("https://example.clerk.accounts.dev");
    expect(clerkFrontendApi("sk_test_secret")).toBeUndefined();
    expect(clerkFrontendApi(undefined)).toBeUndefined();
  });

  test("allows the backend, Clerk and Stripe, and nothing frames the site by default", () => {
    const csp = contentSecurityPolicy(readConfig(env));
    expect(csp.enforced).toBe("frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
    expect(csp.reportOnly).toContain("connect-src 'self' https://api.example.com wss://api.example.com https://site.example.com https://api.stripe.com");
    expect(csp.reportOnly).toContain("https://example.clerk.accounts.dev");
    expect(csp.reportOnly).toContain("frame-src 'self' https://js.stripe.com https://hooks.stripe.com");
    const headers = securityHeaders(readConfig(env));
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });

  test("an admin shell may frame the site for previews; enforcement can be switched on", () => {
    const config = readConfig({ ...env, CONVEXPRESS_FRAME_ANCESTORS: "https://admin.example.com casemedix-webadmin://app", CONVEXPRESS_CSP_ENFORCE: "true", CONVEXPRESS_CSP_EXTRA: "img-src https://cdn.example.com" });
    const csp = contentSecurityPolicy(config);
    expect(csp.reportOnly).toBeUndefined();
    expect(csp.enforced).toContain("frame-ancestors 'self' https://admin.example.com casemedix-webadmin://app");
    expect(csp.enforced).toContain("img-src 'self' data: blob: https: https://cdn.example.com");
    expect(securityHeaders(config)["X-Frame-Options"]).toBeUndefined();
  });

  test("serves only files inside the client build", () => {
    const root = mkdtempSync(join(tmpdir(), "serve-"));
    const client = join(root, "client");
    mkdirSync(join(client, "assets"), { recursive: true });
    writeFileSync(join(client, "assets", "app.js"), "1");
    writeFileSync(join(root, "secret.txt"), "no");
    expect(staticFile(client, "/assets/app.js")).toBe(join(client, "assets", "app.js"));
    expect(staticFile(client, "/assets")).toBeNull();
    expect(staticFile(client, "/../secret.txt")).toBeNull();
    expect(staticFile(client, "/%2e%2e/secret.txt")).toBeNull();
    expect(staticFile(client, "/%E0%A4%A")).toBeNull();
    expect(staticFile(client, "/missing.js")).toBeNull();
  });
});
