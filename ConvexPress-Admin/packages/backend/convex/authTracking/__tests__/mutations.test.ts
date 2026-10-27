import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";

import { api } from "../../_generated/api";
import schema from "../../schema";

const ADMIN_ISSUER = "https://convexpress-admin.local";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/authTracking/mutations.ts": () => import("../mutations"),
};

function createHarness() {
  return convexTest({ schema, modules });
}

async function seedActiveUser(t: ReturnType<typeof createHarness>) {
  const now = Date.now();

  return await t.run(async (ctx) => {
    const roleId = await ctx.db.insert("roles", {
      name: "Subscriber",
      slug: "subscriber",
      description: "Test user role",
      level: 20,
      type: "internal",
      isDefault: false,
      isProtected: false,
      capabilities: ["profile.view"],
      pageAccess: ["/admin"],
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const userId = await ctx.db.insert("users", {
      authSource: "local",
      email: "user@example.com",
      username: "user",
      passwordHash: "not-a-real-hash",
      displayName: "Test User",
      slug: "user",
      emailVerified: true,
      status: "active",
      isInternal: true,
      internalRole: "subscriber",
      roleId,
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return { userId };
  });
}

function withLocalIdentity(t: ReturnType<typeof createHarness>, userId: string) {
  return t.withIdentity({
    issuer: ADMIN_ISSUER,
    subject: userId,
    tokenIdentifier: `${ADMIN_ISSUER}|${userId}`,
    email: "user@example.com",
    name: "Test User",
  });
}

describe("auth tracking mutations", () => {
  test("bounds successful login metadata before writing the auth event", async () => {
    const t = createHarness();
    const { userId } = await seedActiveUser(t);
    const authenticated = withLocalIdentity(t, userId);

    const result = await authenticated.mutation(
      api.authTracking.mutations.recordLogin,
      {
        method: "email",
        app: "admin",
        ip: "1".repeat(100),
        userAgent: "A".repeat(2000),
      },
    );

    expect(result?.success).toBe(true);

    const event = await t.run(async (ctx) => {
      return await ctx.db
        .query("events")
        .withIndex("by_code", (q) => q.eq("code", "auth.login"))
        .first();
    });

    expect(event?.actorIp).toHaveLength(45);

    const payload = JSON.parse(event?.payload ?? "{}") as {
      ip?: string;
      userAgent?: string;
    };
    expect(payload.ip).toHaveLength(45);
    expect(payload.userAgent).toHaveLength(1000);
  });
});

describe("failed sign-in records (upstream PR 068)", () => {
  test("an attempt is kept by its email, and no caller-supplied address is trusted", async () => {
    const t = createHarness();
    const result = await t.mutation(api.authTracking.mutations.recordFailedLogin, {
      email: "  Doctor@Example.Invalid ",
      reason: "invalid_credentials",
      app: "website",
      userAgent: "test-agent",
    });
    expect(result.success).toBe(true);
    const [attempt] = await t.run(async (ctx) => await ctx.db.query("failedLoginAttempts").collect());
    expect(attempt).toMatchObject({ email: "doctor@example.invalid", reason: "invalid_credentials", app: "website", userAgent: "test-agent" });
    expect(attempt?.ip).toBeUndefined();

    // An older client still sending an address is refused, not believed.
    const withAddress = { email: "doctor@example.invalid", reason: "invalid_credentials" as const, app: "website" as const, ip: "203.0.113.9" };
    await expect(t.mutation(api.authTracking.mutations.recordFailedLogin, withAddress)).rejects.toThrow();
  });

  test("a phone number or placeholder isn't recorded as an email", async () => {
    const t = createHarness();
    for (const email of ["unknown", "+15555550100"]) {
      expect(await t.mutation(api.authTracking.mutations.recordFailedLogin, { email, reason: "unknown", app: "website" })).toEqual({
        success: false,
        error: "Invalid email format",
      });
    }
    expect(await t.run(async (ctx) => (await ctx.db.query("failedLoginAttempts").collect()).length)).toBe(0);
  });
});
