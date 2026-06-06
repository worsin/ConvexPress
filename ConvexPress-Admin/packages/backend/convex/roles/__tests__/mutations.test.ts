import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";

import { api } from "../../_generated/api";
import schema from "../../schema";

const ADMIN_ISSUER = "https://convexpress-admin.local";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/roles/mutations.ts": () => import("../mutations"),
};

function createHarness() {
  return convexTest({ schema, modules });
}

async function seedAdminRoleFixture(t: ReturnType<typeof createHarness>) {
  const now = Date.now();

  return await t.run(async (ctx) => {
    const adminRoleId = await ctx.db.insert("roles", {
      name: "Administrator",
      slug: "administrator",
      description: "Full access",
      level: 100,
      type: "internal",
      isDefault: false,
      isProtected: true,
      capabilities: [
        "manage_options",
        "role.update",
        "role.assign",
        "role.grant_capability",
        "role.revoke_capability",
        "post.update",
      ],
      pageAccess: ["/admin", "/admin/setup", "/admin/roles"],
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const editorRoleId = await ctx.db.insert("roles", {
      name: "Editor",
      slug: "editor",
      description: "Content access",
      level: 80,
      type: "internal",
      isDefault: false,
      isProtected: true,
      capabilities: ["post.update"],
      pageAccess: ["/admin", "/admin/posts"],
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const adminUserId = await ctx.db.insert("users", {
      authSource: "local",
      email: "admin@example.com",
      username: "admin",
      passwordHash: "not-a-real-hash",
      displayName: "Admin",
      slug: "admin",
      emailVerified: true,
      status: "active",
      isInternal: true,
      internalRole: "admin",
      roleId: adminRoleId,
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return {
      adminRoleId,
      editorRoleId,
      adminUserId,
    };
  });
}

function withLocalAdminIdentity(
  t: ReturnType<typeof createHarness>,
  userId: string,
) {
  return t.withIdentity({
    issuer: ADMIN_ISSUER,
    subject: userId,
    tokenIdentifier: `${ADMIN_ISSUER}|${userId}`,
    email: "admin@example.com",
    name: "Admin",
  });
}

describe("roles mutations", () => {
  test("allows harmless updates to the caller's current role", async () => {
    const t = createHarness();
    const fixture = await seedAdminRoleFixture(t);
    const admin = withLocalAdminIdentity(t, fixture.adminUserId);

    await expect(
      admin.mutation(api.roles.mutations.update, {
        roleId: fixture.adminRoleId,
        name: "Site Administrator",
      }),
    ).resolves.toBe(fixture.adminRoleId);

    const role = await t.run(async (ctx) => {
      return await ctx.db.get(fixture.adminRoleId);
    });

    expect(role?.name).toBe("Site Administrator");
    expect(role?.capabilities).toContain("manage_options");
    expect(role?.capabilities).toContain("role.update");
    expect(role?.pageAccess).toContain("/admin/setup");
  });

  test("blocks updates that remove setup or role-management access from the caller's current role", async () => {
    const t = createHarness();
    const fixture = await seedAdminRoleFixture(t);
    const admin = withLocalAdminIdentity(t, fixture.adminUserId);

    await expect(
      admin.mutation(api.roles.mutations.update, {
        roleId: fixture.adminRoleId,
        capabilities: ["role.update", "role.revoke_capability"],
      }),
    ).rejects.toThrow("Cannot remove administrative access");

    await expect(
      admin.mutation(api.roles.mutations.update, {
        roleId: fixture.adminRoleId,
        pageAccess: ["/admin", "/admin/roles"],
      }),
    ).rejects.toThrow("Cannot remove administrative access");

    await expect(
      admin.mutation(api.roles.mutations.update, {
        roleId: fixture.adminRoleId,
        status: "inactive",
      }),
    ).rejects.toThrow("Cannot remove administrative access");

    await expect(
      admin.mutation(api.roles.mutations.update, {
        roleId: fixture.adminRoleId,
        type: "customer",
      }),
    ).rejects.toThrow("Cannot remove administrative access");

    const role = await t.run(async (ctx) => {
      return await ctx.db.get(fixture.adminRoleId);
    });

    expect(role?.status).toBe("active");
    expect(role?.type).toBe("internal");
    expect(role?.capabilities).toContain("manage_options");
    expect(role?.capabilities).toContain("role.update");
    expect(role?.pageAccess).toContain("/admin/setup");
  });

  test("blocks revoking the caller's role-management capability from their current role", async () => {
    const t = createHarness();
    const fixture = await seedAdminRoleFixture(t);
    const admin = withLocalAdminIdentity(t, fixture.adminUserId);

    await expect(
      admin.mutation(api.roles.mutations.revokeCapability, {
        roleId: fixture.adminRoleId,
        capability: "role.update",
      }),
    ).rejects.toThrow("Cannot remove administrative access");

    await expect(
      admin.mutation(api.roles.mutations.revokeCapability, {
        roleId: fixture.adminRoleId,
        capability: "post.update",
      }),
    ).resolves.toMatchObject({
      success: true,
      role: "administrator",
      capability: "post.update",
    });

    const role = await t.run(async (ctx) => {
      return await ctx.db.get(fixture.adminRoleId);
    });

    expect(role?.capabilities).toContain("role.update");
    expect(role?.capabilities).not.toContain("post.update");
  });

  test("allows role managers to update roles other than their current role", async () => {
    const t = createHarness();
    const fixture = await seedAdminRoleFixture(t);
    const admin = withLocalAdminIdentity(t, fixture.adminUserId);

    await expect(
      admin.mutation(api.roles.mutations.update, {
        roleId: fixture.editorRoleId,
        status: "inactive",
      }),
    ).resolves.toBe(fixture.editorRoleId);

    const editorRole = await t.run(async (ctx) => {
      return await ctx.db.get(fixture.editorRoleId);
    });

    expect(editorRole?.status).toBe("inactive");
  });
});
