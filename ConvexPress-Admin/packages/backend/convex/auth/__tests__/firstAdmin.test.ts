import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";

import { api } from "../../_generated/api";
import schema from "../../schema";
import { verifyPassword } from "../helpers";

const PASSWORD = "CorrectHorseBatteryStaple42!";
const TEST_ORIGIN = "http://127.0.0.1:4105";
const ORIGINAL_ENV = { ...process.env };

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/http.ts": () => import("../../http"),
  "./convex/auth/setup.ts": () => import("../setup"),
  "./convex/auth/internals.ts": () => import("../internals"),
  "./convex/auth/queries.ts": () => import("../queries"),
  "./convex/authTracking/internals.ts": () =>
    import("../../authTracking/internals"),
  "./convex/roles/internals.ts": () => import("../../roles/internals"),
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

afterEach(() => {
  process.env.AUTH_PRIVATE_KEY = ORIGINAL_ENV.AUTH_PRIVATE_KEY;
  process.env.AUTH_ISSUER_URL = ORIGINAL_ENV.AUTH_ISSUER_URL;
  process.env.AUTH_ALLOWED_ORIGINS = ORIGINAL_ENV.AUTH_ALLOWED_ORIGINS;
  process.env.AUTH_ALLOW_LOCALHOST_ORIGINS =
    ORIGINAL_ENV.AUTH_ALLOW_LOCALHOST_ORIGINS;
  process.env.AUTH_ALLOW_NULL_ORIGIN = ORIGINAL_ENV.AUTH_ALLOW_NULL_ORIGIN;
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
  });
});
