import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readSiteEnvSpec, requiredSiteEnv, siteEnvProblems } from "../apps/web/required-env.mjs";
import { readConfig } from "./serve.mjs";

/** A site directory declaring `spec` in site-env.json. */
function siteDir(spec: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "site-env-"));
  writeFileSync(join(dir, "site-env.json"), JSON.stringify(spec));
  return dir;
}

const SPEC = {
  build: {
    VITE_PORTAL_URL: { format: "url", description: "the customer portal" },
    VITE_ALLOWED_REDIRECT_HOSTS: { format: "hosts" },
    VITE_AFTER_SIGN_IN_PATH: { format: "path", oneOf: ["/portal-redirect"] },
  },
  start: { CONVEXPRESS_CLERK_PUBLISHABLE_KEY: { format: "text", pattern: "^pk_(test|live)_" } },
};

const RUNTIME = {
  CONVEXPRESS_CONVEX_URL: "https://api.example.com",
  CONVEXPRESS_SITE_URL: "https://www.example.com",
  CONVEXPRESS_INSTANCE_KEY: "example-production",
};

describe("site-declared environment (upstream PR 069)", () => {
  test("names each missing or malformed variable and what it is for", () => {
    expect(siteEnvProblems(SPEC, "build", {})).toEqual([
      "VITE_PORTAL_URL is required (the customer portal)",
      "VITE_ALLOWED_REDIRECT_HOSTS is required",
      "VITE_AFTER_SIGN_IN_PATH is required",
    ]);
    expect(
      siteEnvProblems(SPEC, "build", {
        VITE_PORTAL_URL: "portal.example.com",
        VITE_ALLOWED_REDIRECT_HOSTS: "portal.example.com, https://evil/",
        VITE_AFTER_SIGN_IN_PATH: "/dashboard",
      }),
    ).toEqual([
      "VITE_PORTAL_URL must be an http(s) URL (the customer portal)",
      "VITE_ALLOWED_REDIRECT_HOSTS must list host names, comma-separated",
      "VITE_AFTER_SIGN_IN_PATH must be /portal-redirect",
    ]);
    expect(
      siteEnvProblems(SPEC, "build", {
        VITE_PORTAL_URL: "https://portal.example.com",
        VITE_ALLOWED_REDIRECT_HOSTS: "www.example.com,portal.example.com",
        VITE_AFTER_SIGN_IN_PATH: "/portal-redirect",
      }),
    ).toEqual([]);
    expect(siteEnvProblems(SPEC, "start", { CONVEXPRESS_CLERK_PUBLISHABLE_KEY: "sk_live_x" })).toEqual([
      "CONVEXPRESS_CLERK_PUBLISHABLE_KEY doesn't match ^pk_(test|live)_",
    ]);
    expect(siteEnvProblems(null, "build", {})).toEqual([]);
  });

  test("a site that declares nothing is checked for nothing, and a broken declaration is refused", () => {
    expect(readSiteEnvSpec(mkdtempSync(join(tmpdir(), "site-env-none-")))).toBeNull();
    expect(() => readSiteEnvSpec(siteDir({ deploy: {} }))).toThrow(/"deploy" isn't a phase/);
    expect(() => readSiteEnvSpec(siteDir({ build: { lower_case: { format: "url" } } }))).toThrow(/upper case/);
    expect(() => readSiteEnvSpec(siteDir({ build: { VITE_X: { format: "number" } } }))).toThrow(/"format" must be/);
  });

  test("a production build stops without the build variables; development and other commands don't check", () => {
    const dir = siteDir(SPEC);
    const loadEnv = () => ({ VITE_PORTAL_URL: "https://portal.example.com", VITE_ALLOWED_REDIRECT_HOSTS: "portal.example.com" });
    const plugin = requiredSiteEnv({ appDir: dir, loadEnv });
    expect(() => plugin.config({}, { command: "build", mode: "production" })).toThrow(
      /can't be built without its environment[\s\S]*VITE_AFTER_SIGN_IN_PATH is required/,
    );
    expect(() => plugin.config({}, { command: "serve", mode: "development" })).not.toThrow();
    expect(() => plugin.config({}, { command: "build", mode: "development" })).not.toThrow();
    const complete = requiredSiteEnv({ appDir: dir, loadEnv: () => ({ ...loadEnv(), VITE_AFTER_SIGN_IN_PATH: "/portal-redirect" }) });
    expect(() => complete.config({}, { command: "build", mode: "production" })).not.toThrow();
  });

  test("the server refuses to start without the start variables", () => {
    const dir = siteDir(SPEC);
    expect(readConfig(RUNTIME, dir).problems).toEqual(["CONVEXPRESS_CLERK_PUBLISHABLE_KEY is required"]);
    expect(readConfig({ ...RUNTIME, CONVEXPRESS_CLERK_PUBLISHABLE_KEY: "pk_live_abc" }, dir).problems).toEqual([]);
    expect(readConfig(RUNTIME, siteDir({ start: { BAD: { format: "?" } } })).problems[0]).toMatch(/site-env.json is invalid/);
  });
});
