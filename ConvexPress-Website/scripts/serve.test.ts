import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

import {
  clerkFrontendApi,
  compressedFiles,
  compressible,
  contentSecurityPolicy,
  cspReportLogger,
  cspViolations,
  readConfig as readSiteConfig,
  preferredEncoding,
  securityHeaders,
  staticFile,
} from "./serve.mjs";

// ConvexPress's own runtime checks, for a site that declares nothing more in
// site-env.json (a site's own declaration is tested in required-env.test.ts).
const NO_SITE_ENV = mkdtempSync(join(tmpdir(), "serve-no-site-env-"));
const readConfig = (environment: Record<string, string | undefined>) => readSiteConfig(environment, NO_SITE_ENV);

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
    expect(csp.enforced).toBe("frame-ancestors 'none'; base-uri 'self'; object-src 'none'; report-uri /__csp-report");
    expect(csp.reportOnly).toContain("script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.js.stripe.com");
    expect(csp.reportOnly).toEndWith("; report-uri /__csp-report");
    expect(csp.reportOnly).toContain("connect-src 'self' https://api.example.com wss://api.example.com https://site.example.com https://api.stripe.com");
    expect(csp.reportOnly).toContain("https://example.clerk.accounts.dev");
    expect(csp.reportOnly).toContain("frame-src 'self' https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com");
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

  test("reads both kinds of violation report, without query strings", () => {
    const legacy = cspViolations({
      "csp-report": {
        "document-uri": "https://www.example.com/get-started?email=avery%40example.test",
        "effective-directive": "script-src-elem",
        "blocked-uri": "https://static.cloudflareinsights.com/beacon.min.js?token=secret",
        disposition: "report",
      },
    });
    expect(legacy).toEqual([
      { disposition: "report", directive: "script-src-elem", blocked: "https://static.cloudflareinsights.com/beacon.min.js", page: "/get-started", source: "" },
    ]);
    const reporting = cspViolations([
      { type: "csp-violation", body: { documentURL: "https://www.example.com/pricing", effectiveDirective: "script-src", blockedURL: "eval", sourceFile: "https://www.example.com/assets/vendor.js", disposition: "enforce" } },
      { type: "deprecation", body: { id: "x" } },
    ]);
    expect(reporting).toEqual([
      { disposition: "enforce", directive: "script-src", blocked: "eval", page: "/pricing", source: "https://www.example.com/assets/vendor.js" },
    ]);
    expect(cspViolations({ nonsense: true })).toEqual([]);
    expect(cspViolations(null)).toEqual([]);
  });

  test("logs each distinct violation once an hour", () => {
    const lines: string[] = [];
    let clock = 0;
    const log = cspReportLogger((line: string) => lines.push(line), () => clock);
    const violation = { disposition: "report", directive: "script-src", blocked: "eval", page: "/pricing", source: "" };
    log([violation, violation]);
    clock += 30 * 60 * 1000;
    log([violation]);
    expect(lines).toEqual(["[csp] report script-src blocked eval on /pricing"]);
    clock += 31 * 60 * 1000;
    log([violation]);
    expect(lines).toHaveLength(2);
  });
});

describe("compressed static assets", () => {
  test("sends Brotli when the browser takes it, else gzip, else the file as stored", () => {
    expect(preferredEncoding("gzip, deflate, br, zstd")).toBe("br");
    expect(preferredEncoding("gzip, deflate")).toBe("gzip");
    expect(preferredEncoding("br;q=0, gzip;q=0.8")).toBe("gzip");
    expect(preferredEncoding("identity")).toBeNull();
    expect(preferredEncoding(null)).toBeNull();
  });

  test("compresses text formats of 1 KiB and up, not images or fonts", () => {
    expect(compressible("/assets/main-abc.css", 470_000)).toBe(true);
    expect(compressible("/assets/main-abc.js", 2_000)).toBe(true);
    expect(compressible("/logo.svg", 5_000)).toBe(true);
    expect(compressible("/assets/tiny.js", 600)).toBe(false);
    expect(compressible("/assets/photo.jpg", 400_000)).toBe(false);
    expect(compressible("/assets/inter.woff2", 50_000)).toBe(false);
  });

  test("each file is compressed once per encoding and decompresses to the original", async () => {
    const dir = mkdtempSync(join(tmpdir(), "serve-compress-"));
    const path = join(dir, "app.js");
    const source = "export const greeting = 'hello';\n".repeat(400);
    writeFileSync(path, source);
    const compressed = compressedFiles();
    const stat = statSync(path);
    const br = await compressed(path, "br", stat);
    const gz = await compressed(path, "gzip", stat);
    expect(brotliDecompressSync(br).toString()).toBe(source);
    expect(gunzipSync(gz).toString()).toBe(source);
    expect(br.byteLength).toBeLessThan(source.length / 10);
    expect(compressed(path, "br", stat)).toBe(compressed(path, "br", stat));
  });
});
