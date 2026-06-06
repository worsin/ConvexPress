import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";

import { api } from "../../_generated/api";
import schema from "../../schema";
import { verifyPassword } from "../helpers";

const PASSWORD = "CorrectHorseBatteryStaple42!";
const TEST_ORIGIN = "http://127.0.0.1:4105";
const ADMIN_ISSUER = "https://convexpress-admin.local";
const ORIGINAL_ENV = { ...process.env };

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/http.ts": () => import("../../http"),
  "./convex/auth/setup.ts": () => import("../setup"),
  "./convex/auth/adminPresence.ts": () => import("../adminPresence"),
  "./convex/auth/inputLimits.ts": () => import("../inputLimits"),
  "./convex/auth/internals.ts": () => import("../internals"),
  "./convex/auth/queries.ts": () => import("../queries"),
  "./convex/authTracking/internals.ts": () =>
    import("../../authTracking/internals"),
  "./convex/roles/internals.ts": () => import("../../roles/internals"),
  "./convex/roles/queries.ts": () => import("../../roles/queries"),
  "./convex/settings/queries.ts": () => import("../../settings/queries"),
  "./convex/users.ts": () => import("../../users"),
};

function createHarness() {
  return convexTest({ schema, modules });
}

function configureAuthHttpEnv() {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  process.env.AUTH_PRIVATE_KEY = privateKey.export({
    type: "pkcs8",
    format: "pem",
  }) as string;
  process.env.AUTH_ISSUER_URL = TEST_ORIGIN;
  process.env.AUTH_ALLOWED_ORIGINS = TEST_ORIGIN;
  process.env.AUTH_ALLOW_LOCALHOST_ORIGINS = "false";
  process.env.AUTH_ALLOW_NULL_ORIGIN = "true";
}

function restoreEnvVar(name: string) {
  const value = ORIGINAL_ENV[name];
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

afterEach(() => {
  restoreEnvVar("AUTH_PRIVATE_KEY");
  restoreEnvVar("AUTH_ISSUER_URL");
  restoreEnvVar("AUTH_ALLOWED_ORIGINS");
  restoreEnvVar("AUTH_ALLOW_LOCALHOST_ORIGINS");
  restoreEnvVar("AUTH_ALLOW_NULL_ORIGIN");
  restoreEnvVar("FIRST_ADMIN_SETUP_SECRET");
  restoreEnvVar("CONVEXPRESS_ALLOW_PUBLIC_FIRST_ADMIN_SETUP");
  restoreEnvVar("CONVEXPRESS_ENABLE_DEV_INTERNALS");
  restoreEnvVar("CONVEXPRESS_DEV_INTERNALS_TOKEN");
});

describe("createFirstAdmin", () => {
  test("creates a normalized local administrator and blocks repeat setup", async () => {
    const t = createHarness();

    expect(await t.query(api.auth.queries.hasAdmin)).toBe(false);

    const result = await t.action(api.auth.setup.createFirstAdmin, {
      email: " First.Admin@Example.COM ",
      username: " FirstAdmin ",
      password: PASSWORD,
      displayName: " First Admin ",
    });

    expect(result.message).toBe("Administrator account created");
    expect(await t.query(api.auth.queries.hasAdmin)).toBe(true);

    const snapshot = await t.run(async (ctx) => {
      const users = await ctx.db.query("users").collect();
      const adminRole = await ctx.db
        .query("roles")
        .withIndex("by_slug", (q) => q.eq("slug", "administrator"))
        .unique();
      const roleSlugs = (await ctx.db.query("roles").collect()).map(
        (role) => role.slug,
      );

      return { users, adminRole, roleSlugs };
    });

    expect(snapshot.roleSlugs.sort()).toEqual([
      "administrator",
      "author",
      "contributor",
      "editor",
      "subscriber",
    ]);
    expect(snapshot.users).toHaveLength(1);

    const user = snapshot.users[0]!;
    expect(user.email).toBe("first.admin@example.com");
    expect(user.username).toBe("FirstAdmin");
    expect(user.displayName).toBe("First Admin");
    expect(user.authSource).toBe("local");
    expect(user.emailVerified).toBe(true);
    expect(user.status).toBe("active");
    expect(user.isInternal).toBe(true);
    expect(user.internalRole).toBe("admin");
    expect(user.roleId).toBe(snapshot.adminRole?._id);
    expect(user.clerkProvisioningStatus).toBe("skipped");
    expect(user.clerkProvisioningSource).toBe("first_admin");
    expect(user.clerkProvisioningReason).toBe("local_admin_auth_only");
    expect(user.passwordHash).not.toBe(PASSWORD);
    expect(await verifyPassword(PASSWORD, user.passwordHash!)).toBe(true);

    await expect(
      t.action(api.auth.setup.createFirstAdmin, {
        email: "second@example.com",
        username: "secondadmin",
        password: PASSWORD,
      }),
    ).rejects.toThrow("An administrator account already exists");
  });

  test("rejects oversized first-admin fields before creating an account", async () => {
    const t = createHarness();

    await expect(
      t.action(api.auth.setup.createFirstAdmin, {
        email: "admin@example.com",
        username: "admin",
        password: PASSWORD,
        displayName: "A".repeat(129),
      }),
    ).rejects.toThrow("Display name must be 128 characters or fewer.");

    await expect(
      t.action(api.auth.setup.createFirstAdmin, {
        email: "admin@example.com",
        username: "admin",
        password: "A".repeat(257),
        displayName: "First Admin",
      }),
    ).rejects.toThrow("Password must be 256 characters or fewer.");

    expect(await t.query(api.auth.queries.hasAdmin)).toBe(false);
  });

  test("created admin can log in, refresh, and log out through auth HTTP routes", async () => {
    configureAuthHttpEnv();
    const t = createHarness();

    await t.action(api.auth.setup.createFirstAdmin, {
      email: "admin@example.com",
      username: "admin",
      password: PASSWORD,
      displayName: "First Admin",
    });

    const loginResponse = await t.fetch("/auth/login", {
      method: "POST",
      headers: {
        Origin: TEST_ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "admin@example.com",
        password: PASSWORD,
      }),
    });
    const loginBody = await loginResponse.json();
    const loginCookie = loginResponse.headers.get("set-cookie");

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.headers.get("access-control-allow-origin")).toBe(
      TEST_ORIGIN,
    );
    expect(typeof loginBody.accessToken).toBe("string");
    expect(loginBody.expiresIn).toBe(900);
    expect(loginBody.user.email).toBe("admin@example.com");
    expect(loginBody.user.displayName).toBe("First Admin");
    expect(loginCookie?.startsWith("convexpress_refresh=")).toBe(true);

    const firstCookiePair = loginCookie!.split(";")[0]!;
    const afterLogin = await t.run(async (ctx) => {
      return await ctx.db.query("refreshTokens").collect();
    });
    expect(afterLogin).toHaveLength(1);
    expect(afterLogin[0]!.revokedAt).toBeUndefined();

    const emptyRefreshResponse = await t.fetch("/auth/refresh", {
      method: "POST",
      headers: {
        Origin: TEST_ORIGIN,
      },
    });

    expect(emptyRefreshResponse.status).toBe(204);
    expect(emptyRefreshResponse.headers.get("access-control-allow-origin")).toBe(
      TEST_ORIGIN,
    );

    const refreshResponse = await t.fetch("/auth/refresh", {
      method: "POST",
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: firstCookiePair,
      },
    });
    const refreshBody = await refreshResponse.json();
    const refreshCookie = refreshResponse.headers.get("set-cookie");

    expect(refreshResponse.status).toBe(200);
    expect(typeof refreshBody.accessToken).toBe("string");
    expect(refreshBody.expiresIn).toBe(900);
    expect(refreshCookie?.startsWith("convexpress_refresh=")).toBe(true);

    const afterRefresh = await t.run(async (ctx) => {
      return await ctx.db.query("refreshTokens").collect();
    });
    expect(afterRefresh).toHaveLength(2);
    expect(afterRefresh.filter((token) => token.revokedAt)).toHaveLength(1);

    const latestCookiePair = refreshCookie!.split(";")[0]!;
    const logoutResponse = await t.fetch("/auth/logout", {
      method: "POST",
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: latestCookiePair,
      },
    });
    const logoutBody = await logoutResponse.json();

    expect(logoutResponse.status).toBe(200);
    expect(logoutBody.ok).toBe(true);

    const afterLogout = await t.run(async (ctx) => {
      return await ctx.db.query("refreshTokens").collect();
    });
    expect(afterLogout.filter((token) => token.revokedAt)).toHaveLength(2);

    const downgraded = await t.run(async (ctx) => {
      const user = (await ctx.db.query("users").collect())[0]!;
      const subscriberRole = await ctx.db
        .query("roles")
        .withIndex("by_slug", (q) => q.eq("slug", "subscriber"))
        .unique();
      await ctx.db.patch(user._id, {
        roleId: subscriberRole!._id,
        isInternal: true,
        updatedAt: Date.now(),
      });
      return user;
    });

    const downgradedLoginResponse = await t.fetch("/auth/login", {
      method: "POST",
      headers: {
        Origin: TEST_ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: downgraded.email,
        password: PASSWORD,
      }),
    });
    const downgradedLoginBody = await downgradedLoginResponse.json();

    expect(downgradedLoginResponse.status).toBe(401);
    expect(downgradedLoginBody.error).toBe("Invalid credentials");
  });

  test("local auth HTTP routes reject oversized credential and token inputs", async () => {
    configureAuthHttpEnv();
    const t = createHarness();

    await t.action(api.auth.setup.createFirstAdmin, {
      email: "admin@example.com",
      username: "admin",
      password: PASSWORD,
      displayName: "First Admin",
    });

    const oversizedPasswordResponse = await t.fetch("/auth/login", {
      method: "POST",
      headers: {
        Origin: TEST_ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "admin@example.com",
        password: "A".repeat(257),
      }),
    });
    const oversizedPasswordBody = await oversizedPasswordResponse.json();

    expect(oversizedPasswordResponse.status).toBe(400);
    expect(oversizedPasswordBody.error).toBe("Credentials are invalid");

    const failedAttempts = await t.run(async (ctx) => {
      return await ctx.db.query("failedLoginAttempts").collect();
    });
    expect(failedAttempts).toHaveLength(0);

    const oversizedBodyResponse = await t.fetch("/auth/login", {
      method: "POST",
      headers: {
        Origin: TEST_ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "admin@example.com",
        password: "A".repeat(5000),
      }),
    });
    const oversizedBody = await oversizedBodyResponse.json();

    expect(oversizedBodyResponse.status).toBe(413);
    expect(oversizedBody.error).toBe("Request body too large");

    const malformedRefreshResponse = await t.fetch("/auth/refresh", {
      method: "POST",
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: `convexpress_refresh=${"z".repeat(128)}`,
      },
    });
    const malformedRefreshBody = await malformedRefreshResponse.json();

    expect(malformedRefreshResponse.status).toBe(401);
    expect(malformedRefreshBody.error).toBe("Invalid or expired refresh token");

    const malformedLogoutResponse = await t.fetch("/auth/logout", {
      method: "POST",
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: `convexpress_refresh=${"z".repeat(128)}`,
      },
    });
    const malformedLogoutBody = await malformedLogoutResponse.json();

    expect(malformedLogoutResponse.status).toBe(200);
    expect(malformedLogoutBody.ok).toBe(true);
  });

  test("requires the configured first-admin setup token", async () => {
    process.env.FIRST_ADMIN_SETUP_SECRET = "setup-secret";
    const t = createHarness();

    await expect(
      t.action(api.auth.setup.createFirstAdmin, {
        email: "admin@example.com",
        username: "admin",
        password: PASSWORD,
        displayName: "First Admin",
      }),
    ).rejects.toThrow("First-admin setup token is invalid or missing.");

    await expect(
      t.action(api.auth.setup.createFirstAdmin, {
        email: "admin@example.com",
        username: "admin",
        password: PASSWORD,
        displayName: "First Admin",
        setupToken: "wrong-token",
      }),
    ).rejects.toThrow("First-admin setup token is invalid or missing.");

    const result = await t.action(api.auth.setup.createFirstAdmin, {
      email: "admin@example.com",
      username: "admin",
      password: PASSWORD,
      displayName: "First Admin",
      setupToken: "setup-secret",
    });

    expect(result.message).toBe("Administrator account created");
    expect(await t.query(api.auth.queries.hasAdmin)).toBe(true);

    await expect(
      t.action(api.auth.setup.createFirstAdmin, {
        email: "second@example.com",
        username: "secondadmin",
        password: PASSWORD,
        displayName: "Second Admin",
      }),
    ).rejects.toThrow("An administrator account already exists");
  });

  test("requires a setup token on non-local deployments unless public setup is explicitly allowed", async () => {
    process.env.AUTH_ISSUER_URL = "https://admin.example.com";
    process.env.FIRST_ADMIN_SETUP_SECRET = "";
    process.env.CONVEXPRESS_ALLOW_PUBLIC_FIRST_ADMIN_SETUP = "";
    const t = createHarness();

    await expect(
      t.action(api.auth.setup.createFirstAdmin, {
        email: "admin@example.com",
        username: "admin",
        password: PASSWORD,
        displayName: "First Admin",
      }),
    ).rejects.toThrow("FIRST_ADMIN_SETUP_SECRET is required");

    expect(await t.query(api.auth.queries.hasAdmin)).toBe(false);

    process.env.AUTH_ISSUER_URL = "not a url";

    await expect(
      t.action(api.auth.setup.createFirstAdmin, {
        email: "admin@example.com",
        username: "admin",
        password: PASSWORD,
        displayName: "First Admin",
      }),
    ).rejects.toThrow("FIRST_ADMIN_SETUP_SECRET is required");

    process.env.CONVEXPRESS_ALLOW_PUBLIC_FIRST_ADMIN_SETUP = "true";

    const result = await t.action(api.auth.setup.createFirstAdmin, {
      email: "admin@example.com",
      username: "admin",
      password: PASSWORD,
      displayName: "First Admin",
    });

    expect(result.message).toBe("Administrator account created");
    expect(await t.query(api.auth.queries.hasAdmin)).toBe(true);
  });

  test("consumes the configured first-admin setup token after first use", async () => {
    process.env.FIRST_ADMIN_SETUP_SECRET = "setup-secret";
    const t = createHarness();

    await t.action(api.auth.setup.createFirstAdmin, {
      email: "admin@example.com",
      username: "admin",
      password: PASSWORD,
      displayName: "First Admin",
      setupToken: "setup-secret",
    });

    const adminId = await t.run(async (ctx) => {
      const user = (await ctx.db.query("users").collect())[0]!;
      await ctx.db.patch(user._id, {
        status: "inactive",
        updatedAt: Date.now(),
      });
      return user._id;
    });

    expect(await t.query(api.auth.queries.hasAdmin)).toBe(false);

    await expect(
      t.action(api.auth.setup.createFirstAdmin, {
        email: "replacement@example.com",
        username: "replacement",
        password: PASSWORD,
        displayName: "Replacement Admin",
        setupToken: "setup-secret",
      }),
    ).rejects.toThrow(
      "First-admin setup token has already been used. Re-run desktop setup to rotate the setup token.",
    );

    const users = await t.run(async (ctx) => {
      return await ctx.db.query("users").collect();
    });

    expect(users).toHaveLength(1);
    expect(users[0]!._id).toBe(adminId);
    expect(users[0]!.status).toBe("inactive");
  });

  test("local admin JWT resolves the user and admin gate rejects stale access", async () => {
    const t = createHarness();

    await t.action(api.auth.setup.createFirstAdmin, {
      email: "admin@example.com",
      username: "admin",
      password: PASSWORD,
      displayName: "First Admin",
    });

    const snapshot = await t.run(async (ctx) => {
      const user = (await ctx.db.query("users").collect())[0]!;
      const subscriberRole = await ctx.db
        .query("roles")
        .withIndex("by_slug", (q) => q.eq("slug", "subscriber"))
        .unique();
      return { user, subscriberRole };
    });

    const authenticated = t.withIdentity({
      issuer: ADMIN_ISSUER,
      subject: snapshot.user._id,
      tokenIdentifier: `${ADMIN_ISSUER}|${snapshot.user._id}`,
      email: snapshot.user.email,
      name: snapshot.user.displayName,
    });

    const currentUser = await authenticated.query(api.users.getCurrentUser);
    expect(currentUser?._id).toBe(snapshot.user._id);
    expect(currentUser?.email).toBe("admin@example.com");
    expect((currentUser as Record<string, unknown> | null)?.passwordHash).toBeUndefined();
    expect(
      (currentUser as Record<string, unknown> | null)?.passwordResetToken,
    ).toBeUndefined();

    const adminAccess = await authenticated.query(api.users.checkAdminAccess);
    expect(adminAccess?.id).toBe(snapshot.user._id);
    expect(adminAccess?.email).toBe("admin@example.com");

    await t.run(async (ctx) => {
      await ctx.db.patch(snapshot.user._id, {
        status: "inactive",
        updatedAt: Date.now(),
      });
    });

    expect(await authenticated.query(api.users.checkAdminAccess)).toBeNull();

    await t.run(async (ctx) => {
      await ctx.db.patch(snapshot.user._id, {
        status: "active",
        roleId: snapshot.subscriberRole!._id,
        isInternal: true,
        internalRole: "admin",
        updatedAt: Date.now(),
      });
    });

    expect(await authenticated.query(api.users.checkAdminAccess)).toBeNull();

    const targetUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        authSource: "local",
        email: "target@example.com",
        username: "target",
        passwordHash: "not-a-real-hash",
        displayName: "Target User",
        slug: "target",
        emailVerified: true,
        status: "active",
        isInternal: false,
        internalRole: "customer",
        roleId: snapshot.subscriberRole!._id,
        registrationMethod: "self",
        registeredAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await expect(
      authenticated.mutation(api.users.updateUserRole, {
        userId: targetUserId,
        internalRole: "admin",
        isInternal: true,
      }),
    ).rejects.toThrow("Insufficient permissions");
  });

  test("smoke admin provisioning requires a dev internals token and assigns the administrator role", async () => {
    const t = createHarness();
    process.env.CONVEXPRESS_ENABLE_DEV_INTERNALS = "true";
    process.env.CONVEXPRESS_DEV_INTERNALS_TOKEN = "dev-smoke-token";

    await expect(
      t.action(api.auth.setup.provisionSmokeAdmin, {
        email: "smoke@example.com",
        username: "smokeadmin",
        password: PASSWORD,
      }),
    ).rejects.toThrow("Invalid dev internals token.");

    await expect(
      t.action(api.auth.setup.provisionSmokeAdmin, {
        email: "smoke@example.com",
        username: "smokeadmin",
        password: PASSWORD,
        devToken: "wrong-token",
      }),
    ).rejects.toThrow("Invalid dev internals token.");

    const result = await t.action(api.auth.setup.provisionSmokeAdmin, {
      email: "smoke@example.com",
      username: "smokeadmin",
      password: PASSWORD,
      devToken: "dev-smoke-token",
    });

    expect(result.created).toBe(true);
    expect(result.email).toBe("smoke@example.com");
    expect(await t.query(api.auth.queries.hasAdmin)).toBe(true);

    const snapshot = await t.run(async (ctx) => {
      const user = (await ctx.db.query("users").collect())[0]!;
      const role = user.roleId ? await ctx.db.get("roles", user.roleId) : null;
      return { user, role };
    });

    expect(snapshot.user.authSource).toBe("local");
    expect(snapshot.user.isInternal).toBe(true);
    expect(snapshot.user.internalRole).toBe("admin");
    expect(snapshot.role?.slug).toBe("administrator");
    expect(snapshot.role?.type).toBe("internal");
  });

  test("smoke admin provisioning remains disabled when the dev token is not configured", async () => {
    const t = createHarness();
    process.env.CONVEXPRESS_ENABLE_DEV_INTERNALS = "true";
    process.env.CONVEXPRESS_DEV_INTERNALS_TOKEN = "";

    await expect(
      t.action(api.auth.setup.provisionSmokeAdmin, {
        email: "smoke@example.com",
        username: "smokeadmin",
        password: PASSWORD,
        devToken: "dev-smoke-token",
      }),
    ).rejects.toThrow(
      "provisionSmokeAdmin requires CONVEXPRESS_DEV_INTERNALS_TOKEN before it can create an admin.",
    );
  });

  test("created admin can access setup route data with secrets redacted", async () => {
    const t = createHarness();

    await t.action(api.auth.setup.createFirstAdmin, {
      email: "admin@example.com",
      username: "admin",
      password: PASSWORD,
      displayName: "First Admin",
    });

    const snapshot = await t.run(async (ctx) => {
      const user = (await ctx.db.query("users").collect())[0]!;
      const role = await ctx.db.get(user.roleId!);
      const now = Date.now();
      const settingsSections = [
        {
          section: "email",
          values: {
            resendApiKey: "re_test_secret",
            webhookSecret: "whsec_resend_secret",
            fromAddress: "noreply@example.com",
          },
        },
        {
          section: "integrations.clerk",
          values: {
            clerkSecretKey: "sk_test_secret",
            clerkWebhookSecret: "whsec_clerk_secret",
            clerkJwtIssuerDomain: "https://clerk.example.test",
          },
        },
        {
          section: "search",
          values: {
            meilisearchHost: "https://search.example.test",
            meilisearchApiKey: "meili_secret",
          },
        },
        {
          section: "ai",
          values: {
            provider: "openrouter",
            apiKey: "openrouter_secret",
            tavilyApiKey: "tavily_secret",
            imageApiKey: "image_secret",
          },
        },
        {
          section: "commerce.payments",
          values: {
            stripePublishableKey: "pk_test_public",
            stripeSecretKey: "sk_test_secret",
            stripeWebhookSecret: "whsec_stripe_secret",
            paypalClientId: "paypal-client-id",
            paypalClientSecret: "paypal-secret",
            paypalWebhookId: "paypal-webhook-id",
          },
        },
        {
          section: "integrations.google",
          values: {
            placesApiKey: "places_secret",
            geocodeApiKey: "geocode_secret",
          },
        },
        {
          section: "analytics.ga4",
          values: {
            ga4ServiceAccountJson:
              '{"type":"service_account","client_email":"ga4@example.test","private_key":"secret"}',
            ga4PropertyId: "properties/123456789",
          },
        },
      ];

      for (const settings of settingsSections) {
        await ctx.db.insert("settings", {
          section: settings.section as any,
          values: settings.values,
          updatedAt: now,
          updatedBy: user._id,
        });
      }

      return { user, role };
    });

    const authenticated = t.withIdentity({
      issuer: ADMIN_ISSUER,
      subject: snapshot.user._id,
      tokenIdentifier: `${ADMIN_ISSUER}|${snapshot.user._id}`,
      email: snapshot.user.email,
      name: snapshot.user.displayName,
    });

    const adminAccess = await authenticated.query(api.users.checkAdminAccess);
    expect(adminAccess?.id).toBe(snapshot.user._id);

    const role = await authenticated.query(api.roles.queries.getRole, {
      roleId: snapshot.role!._id,
    });
    expect(role?.capabilities).toContain("manage_options");
    expect(role?.capabilities).toContain("settings.update_email");
    expect(role?.pageAccess).toContain("/admin/setup");

    const email = await authenticated.query(api.settings.queries.getBySection, {
      section: "email",
    });
    const clerk = await authenticated.query(api.settings.queries.getBySection, {
      section: "integrations.clerk",
    });
    const search = await authenticated.query(api.settings.queries.getBySection, {
      section: "search",
    });
    const ai = await authenticated.query(api.settings.queries.getBySection, {
      section: "ai",
    });
    const payments = await authenticated.query(api.settings.queries.getBySection, {
      section: "commerce.payments",
    });
    const google = await authenticated.query(api.settings.queries.getBySection, {
      section: "integrations.google",
    });
    const ga4 = await authenticated.query(api.settings.queries.getBySection, {
      section: "analytics.ga4",
    });

    expect(email?.resendApiKey).toBe("__set__");
    expect(email?.webhookSecret).toBe("__set__");
    expect(email?.fromAddress).toBe("noreply@example.com");
    expect(clerk?.clerkSecretKey).toBe("__set__");
    expect(clerk?.clerkWebhookSecret).toBe("__set__");
    expect(clerk?.clerkJwtIssuerDomain).toBe("https://clerk.example.test");
    expect(search?.meilisearchApiKey).toBe("__set__");
    expect(search?.meilisearchHost).toBe("https://search.example.test");
    expect(ai?.apiKey).toBe("__set__");
    expect(ai?.tavilyApiKey).toBe("__set__");
    expect(ai?.imageApiKey).toBe("__set__");
    expect(payments?.stripePublishableKey).toBe("__set__");
    expect(payments?.stripeSecretKey).toBe("__set__");
    expect(payments?.stripeWebhookSecret).toBe("__set__");
    expect(payments?.paypalClientSecret).toBe("__set__");
    expect(google?.placesApiKey).toBe("__set__");
    expect(google?.geocodeApiKey).toBe("__set__");
    expect(ga4?.ga4ServiceAccountJson).toBe("__set__");
    expect(ga4?.ga4PropertyId).toBe("properties/123456789");
  });

  test("legacy bootstrapAdmin is disabled", async () => {
    const t = createHarness().withIdentity({
      issuer: "https://clerk.example",
      subject: "user_clerk_attacker",
      tokenIdentifier: "https://clerk.example|user_clerk_attacker",
      email: "attacker@example.com",
      name: "Attacker",
    });

    await expect(t.mutation(api.users.bootstrapAdmin)).rejects.toThrow(
      "Legacy bootstrapAdmin is disabled.",
    );
  });

  test("inactive stale admins do not block first-admin recovery", async () => {
    const t = createHarness();

    await t.action(api.auth.setup.createFirstAdmin, {
      email: "stale-admin@example.com",
      username: "staleadmin",
      password: PASSWORD,
      displayName: "Stale Admin",
    });

    const staleAdminId = await t.run(async (ctx) => {
      const user = (await ctx.db.query("users").collect())[0]!;
      await ctx.db.patch(user._id, {
        status: "inactive",
        updatedAt: Date.now(),
      });
      return user._id;
    });

    expect(await t.query(api.auth.queries.hasAdmin)).toBe(false);

    const recovered = await t.action(api.auth.setup.createFirstAdmin, {
      email: "new-admin@example.com",
      username: "newadmin",
      password: PASSWORD,
      displayName: "New Admin",
    });

    expect(recovered.message).toBe("Administrator account created");
    expect(await t.query(api.auth.queries.hasAdmin)).toBe(true);

    const users = await t.run(async (ctx) => {
      return await ctx.db.query("users").collect();
    });
    const staleAdmin = users.find((user) => user._id === staleAdminId)!;
    const newAdmin = users.find((user) => user.email === "new-admin@example.com")!;

    expect(staleAdmin.status).toBe("inactive");
    expect(newAdmin.status).toBe("active");
    expect(newAdmin.internalRole).toBe("admin");
  });

  test("non-local administrator records do not block local first-admin setup", async () => {
    const t = createHarness();

    await t.action(api.auth.setup.createFirstAdmin, {
      email: "clerk-admin@example.com",
      username: "clerkadmin",
      password: PASSWORD,
      displayName: "Clerk Admin",
    });

    await t.run(async (ctx) => {
      const user = (await ctx.db.query("users").collect())[0]!;
      await ctx.db.patch(user._id, {
        authSource: "clerk",
        clerkUserId: "user_clerk_admin",
        updatedAt: Date.now(),
      });
    });

    expect(await t.query(api.auth.queries.hasAdmin)).toBe(false);

    await t.action(api.auth.setup.createFirstAdmin, {
      email: "local-admin@example.com",
      username: "localadmin",
      password: PASSWORD,
      displayName: "Local Admin",
    });

    expect(await t.query(api.auth.queries.hasAdmin)).toBe(true);
  });
});
