/**
 * The website's copy of what the site's Clerk accepts is refreshed without an
 * administrator (upstream PR 066): daily, and by site setup, which can create
 * the Clerk settings for a site configured only through the environment.
 */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api, internal } from "../../_generated/api";
import schema from "../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/auth/clerkConnection.ts": () => import("../clerkConnection"),
  "./convex/auth/clerkConnectionInternals.ts": () => import("../clerkConnectionInternals"),
  "./convex/auth/clerkPublic.ts": () => import("../clerkPublic"),
};

const ISSUER = "https://merry-example-12.clerk.accounts.dev";
const ENVIRONMENT = {
  auth_config: { first_factors: ["email_code", "oauth_google", "password"], second_factors: [] },
  display_config: { application_name: "Example", instance_environment_type: "development", preferred_sign_in_strategy: "password" },
  user_settings: {
    attributes: {
      email_address: { enabled: true, required: true, verifications: ["email_code"], used_for_first_factor: true },
      password: { enabled: true, required: true },
    },
    social: { oauth_google: { enabled: true }, oauth_apple: { enabled: true }, oauth_github: { enabled: false } },
    sign_up: { mode: "public", captcha_enabled: true, captcha_widget_type: "smart", legal_consent_enabled: false, progressive: true },
    sign_in: { second_factor: { required: false } },
    password_settings: { min_length: 8 },
  },
};

const realFetch = globalThis.fetch;
let requests: string[] = [];
let environment: unknown = ENVIRONMENT;

beforeEach(() => {
  requests = [];
  environment = ENVIRONMENT;
  process.env.CLERK_JWT_ISSUER_DOMAIN = ISSUER;
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request) => {
      requests.push(String(input instanceof Request ? input.url : input));
      return new Response(JSON.stringify(environment), { status: 200, headers: { "Content-Type": "application/json" } });
    },
    { preconnect: realFetch.preconnect },
  );
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.CLERK_JWT_ISSUER_DOMAIN;
});

async function fixture() {
  const t = convexTest({ schema, modules });
  const owner = await t.run(async (ctx) => {
    const roleId = await ctx.db.insert("roles", {
      name: "Administrator", slug: "administrator", description: "Test", level: 100, type: "internal", isDefault: false,
      isProtected: true, capabilities: ["manage_options"], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1,
    });
    return await ctx.db.insert("users", { authSource: "local", email: "owner@example.invalid", emailVerified: true, status: "active", roleId, createdAt: 1, updatedAt: 1 });
  });
  const refresh = (actorId?: typeof owner) =>
    t.action(internal.auth.clerkConnection.refreshCapabilitiesInternal, actorId ? { actorId } : {});
  const website = () => t.query(api.auth.clerkPublic.getWebsiteAuthConfig, {});
  return { t, owner, refresh, website };
}

test("site setup stores what an environment-configured Clerk accepts", async () => {
  const f = await fixture();
  expect((await f.website()).capabilities.social).toEqual([]);

  // The daily refresh has no one to attribute new settings to: it leaves them to setup.
  expect(await f.refresh()).toEqual({ synced: false, changed: false });
  expect((await f.website()).capabilities.social).toEqual([]);

  expect(await f.refresh(f.owner)).toEqual({ synced: true, changed: true });
  expect(requests).toContain(`${ISSUER}/v1/environment?_clerk_js_version=5`);
  const { capabilities } = await f.website();
  expect(capabilities.social.toSorted()).toEqual(["oauth_apple", "oauth_google"]);
  expect(capabilities.signUp).toMatchObject({ captchaEnabled: true, captchaWidgetType: "smart" });
  expect(capabilities.password.minLength).toBe(8);
});

test("the daily refresh follows changes made in Clerk's dashboard", async () => {
  const f = await fixture();
  await f.refresh(f.owner);
  expect(await f.refresh()).toEqual({ synced: true, changed: false });

  environment = { ...ENVIRONMENT, user_settings: { ...ENVIRONMENT.user_settings, social: { oauth_google: { enabled: true } } } };
  expect(await f.refresh()).toEqual({ synced: true, changed: true });
  expect((await f.website()).capabilities.social).toEqual(["oauth_google"]);
});

test("nothing is stored when Clerk can't be reached or isn't configured", async () => {
  const f = await fixture();
  environment = null;
  globalThis.fetch = Object.assign(async () => new Response("unavailable", { status: 503 }), { preconnect: realFetch.preconnect });
  expect(await f.refresh(f.owner)).toEqual({ synced: false, changed: false });
  delete process.env.CLERK_JWT_ISSUER_DOMAIN;
  expect(await f.refresh(f.owner)).toEqual({ synced: false, changed: false });
  const stored = await f.t.run(async (ctx) => await ctx.db.query("settings").withIndex("by_section", (q) => q.eq("section", "integrations.clerk")).unique());
  expect(stored).toBeNull();
});
