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
  "./convex/auth/internals.ts": () => import("../internals"),
  "./convex/auth/queries.ts": () => import("../queries"),
  "./convex/authTracking/internals.ts": () =>
    import("../../authTracking/internals"),
  "./convex/roles/internals.ts": () => import("../../roles/internals"),
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

afterEach(() => {
  process.env.AUTH_PRIVATE_KEY = ORIGINAL_ENV.AUTH_PRIVATE_KEY;
  process.env.AUTH_ISSUER_URL = ORIGINAL_ENV.AUTH_ISSUER_URL;
  process.env.AUTH_ALLOWED_ORIGINS = ORIGINAL_ENV.AUTH_ALLOWED_ORIGINS;
  process.env.AUTH_ALLOW_LOCALHOST_ORIGINS =
    ORIGINAL_ENV.AUTH_ALLOW_LOCALHOST_ORIGINS;
  process.env.AUTH_ALLOW_NULL_ORIGIN = ORIGINAL_ENV.AUTH_ALLOW_NULL_ORIGIN;
  process.env.FIRST_ADMIN_SETUP_SECRET =
    ORIGINAL_ENV.FIRST_ADMIN_SETUP_SECRET;
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
    ).rejects.toThrow("Admin access required");
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
