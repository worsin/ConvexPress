import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";

import { api } from "../../_generated/api";
import schema from "../../schema";

const ADMIN_ISSUER = "https://convexpress-admin.local";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/password/actions.ts": () => import("../actions"),
  "./convex/password/queries.ts": () => import("../queries"),
};

function createHarness() {
  return convexTest({ schema, modules });
}

async function seedPasswordAuthFixture(t: ReturnType<typeof createHarness>) {
  const now = Date.now();

  return await t.run(async (ctx) => {
    const resetManagerRoleId = await ctx.db.insert("roles", {
      name: "Password Reset Manager",
      slug: "password-reset-manager",
      description: "Can trigger password reset emails.",
      level: 40,
      type: "internal",
      isDefault: false,
      isProtected: false,
      capabilities: ["password.reset"],
      pageAccess: ["/admin", "/admin/users"],
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const legacyAdminRoleId = await ctx.db.insert("roles", {
      name: "Legacy Admin Without Password Reset",
      slug: "legacy-admin-without-password-reset",
      description: "High-level role without password reset capability.",
      level: 100,
      type: "internal",
      isDefault: false,
      isProtected: false,
      capabilities: ["post.read"],
      pageAccess: ["/admin"],
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const resetManagerUserId = await ctx.db.insert("users", {
      authSource: "local",
      email: "reset-manager@example.com",
      username: "reset-manager",
      passwordHash: "not-a-real-hash",
      displayName: "Reset Manager",
      slug: "reset-manager",
      emailVerified: true,
      status: "active",
      isInternal: true,
      internalRole: "manager",
      roleId: resetManagerRoleId,
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const legacyAdminUserId = await ctx.db.insert("users", {
      authSource: "local",
      email: "legacy@example.com",
      username: "legacy",
      passwordHash: "not-a-real-hash",
      displayName: "Legacy Admin",
      slug: "legacy",
      emailVerified: true,
      status: "active",
      isInternal: true,
      internalRole: "admin",
      roleId: legacyAdminRoleId,
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const targetUserId = await ctx.db.insert("users", {
      authSource: "local",
      email: "target@example.com",
      username: "target",
      passwordHash: "not-a-real-hash",
      displayName: "Target User",
      slug: "target",
      emailVerified: true,
      status: "active",
      isInternal: true,
      internalRole: "viewer",
      roleId: legacyAdminRoleId,
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
      lastPasswordChangedAt: now - 1000,
      passwordResetRequestedAt: now - 500,
      passwordResetCount: 2,
    });

    const deletedTargetUserId = await ctx.db.insert("users", {
      authSource: "local",
      email: "deleted@example.com",
      username: "deleted",
      passwordHash: "not-a-real-hash",
      displayName: "Deleted User",
      slug: "deleted",
      emailVerified: true,
      status: "active",
      isInternal: true,
      internalRole: "viewer",
      roleId: legacyAdminRoleId,
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.delete(deletedTargetUserId);

    return {
      resetManagerUserId,
      legacyAdminUserId,
      targetUserId,
      deletedTargetUserId,
    };
  });
}

function withLocalIdentity(
  t: ReturnType<typeof createHarness>,
  userId: string,
  email: string,
  name: string,
) {
  return t.withIdentity({
    issuer: ADMIN_ISSUER,
    subject: userId,
    tokenIdentifier: `${ADMIN_ISSUER}|${userId}`,
    email,
    name,
  });
}

describe("password authorization", () => {
  test("uses password.reset capability for other-user password status", async () => {
    const t = createHarness();
    const fixture = await seedPasswordAuthFixture(t);
    const resetManager = withLocalIdentity(
      t,
      fixture.resetManagerUserId,
      "reset-manager@example.com",
      "Reset Manager",
    );
    const legacyAdmin = withLocalIdentity(
      t,
      fixture.legacyAdminUserId,
      "legacy@example.com",
      "Legacy Admin",
    );

    const status = await resetManager.query(api.password.queries.getPasswordStatus, {
      userId: fixture.targetUserId,
    });

    expect(status?.passwordResetCount).toBe(2);

    await expect(
      legacyAdmin.query(api.password.queries.getPasswordStatus, {
        userId: fixture.targetUserId,
      }),
    ).rejects.toThrow("Insufficient permissions");
  });

  test("uses password.reset capability for admin-initiated reset action", async () => {
    const t = createHarness();
    const fixture = await seedPasswordAuthFixture(t);
    const resetManager = withLocalIdentity(
      t,
      fixture.resetManagerUserId,
      "reset-manager@example.com",
      "Reset Manager",
    );
    const legacyAdmin = withLocalIdentity(
      t,
      fixture.legacyAdminUserId,
      "legacy@example.com",
      "Legacy Admin",
    );

    await expect(
      resetManager.action(api.password.actions.adminResetUserPassword, {
        targetUserId: fixture.deletedTargetUserId,
      }),
    ).rejects.toThrow("User not found.");

    await expect(
      legacyAdmin.action(api.password.actions.adminResetUserPassword, {
        targetUserId: fixture.deletedTargetUserId,
      }),
    ).rejects.toThrow("Insufficient permissions");
  });
});
