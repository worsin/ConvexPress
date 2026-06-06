import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";

import { api } from "../../_generated/api";
import schema from "../../schema";

const ADMIN_ISSUER = "https://convexpress-admin.local";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/profiles/queries.ts": () => import("../queries"),
};

function createHarness() {
  return convexTest({ schema, modules });
}

async function seedUserDirectoryFixture(t: ReturnType<typeof createHarness>) {
  const now = Date.now();

  return await t.run(async (ctx) => {
    const directoryRoleId = await ctx.db.insert("roles", {
      name: "Directory Manager",
      slug: "directory-manager",
      description: "Can manage users.",
      level: 40,
      type: "internal",
      isDefault: false,
      isProtected: false,
      capabilities: ["role.assign"],
      pageAccess: ["/admin", "/admin/users"],
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const legacyAdminRoleId = await ctx.db.insert("roles", {
      name: "Legacy Admin Without User Capabilities",
      slug: "legacy-admin-without-user-capabilities",
      description: "High-level role without user directory capabilities.",
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

    const viewerRoleId = await ctx.db.insert("roles", {
      name: "Viewer",
      slug: "viewer",
      description: "Can read public content.",
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

    const managerUserId = await ctx.db.insert("users", {
      authSource: "local",
      email: "manager@example.com",
      username: "manager",
      passwordHash: "not-a-real-hash",
      displayName: "Manager",
      slug: "manager",
      emailVerified: true,
      status: "active",
      isInternal: true,
      internalRole: "manager",
      roleId: directoryRoleId,
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const viewerUserId = await ctx.db.insert("users", {
      authSource: "local",
      email: "viewer@example.com",
      username: "viewer",
      passwordHash: "not-a-real-hash",
      displayName: "Viewer",
      slug: "viewer",
      emailVerified: true,
      status: "active",
      isInternal: true,
      internalRole: "viewer",
      roleId: viewerRoleId,
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

    const inactiveUserId = await ctx.db.insert("users", {
      authSource: "local",
      email: "inactive@example.com",
      username: "inactive",
      passwordHash: "not-a-real-hash",
      displayName: "Inactive User",
      slug: "inactive",
      emailVerified: true,
      status: "inactive",
      isInternal: true,
      internalRole: "viewer",
      roleId: viewerRoleId,
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return {
      managerUserId,
      viewerUserId,
      legacyAdminUserId,
      inactiveUserId,
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

describe("profiles queries", () => {
  test("uses capabilities, not role level or legacy role names, for user directory reads", async () => {
    const t = createHarness();
    const fixture = await seedUserDirectoryFixture(t);
    const manager = withLocalIdentity(
      t,
      fixture.managerUserId,
      "manager@example.com",
      "Manager",
    );
    const legacyAdmin = withLocalIdentity(
      t,
      fixture.legacyAdminUserId,
      "legacy@example.com",
      "Legacy Admin",
    );

    const managerList = await manager.query(api.profiles.queries.listUsers, {
      perPage: 10,
    });
    expect(managerList.total).toBe(4);
    expect(managerList.users.map((user) => user.email)).toContain(
      "inactive@example.com",
    );

    const managerCounts = await manager.query(api.profiles.queries.counts, {});
    expect(managerCounts).toEqual({
      total: 4,
      active: 3,
      inactive: 1,
      banned: 0,
    });

    const legacyList = await legacyAdmin.query(api.profiles.queries.listUsers, {
      perPage: 10,
    });
    expect(legacyList).toEqual({
      users: [],
      total: 0,
      page: 1,
      perPage: 50,
      totalPages: 0,
    });

    const legacyCounts = await legacyAdmin.query(api.profiles.queries.counts, {});
    expect(legacyCounts).toEqual({
      total: 0,
      active: 0,
      inactive: 0,
      banned: 0,
    });
  });

  test("does not expose inactive users through public getUser fallback", async () => {
    const t = createHarness();
    const fixture = await seedUserDirectoryFixture(t);
    const viewer = withLocalIdentity(
      t,
      fixture.viewerUserId,
      "viewer@example.com",
      "Viewer",
    );
    const manager = withLocalIdentity(
      t,
      fixture.managerUserId,
      "manager@example.com",
      "Manager",
    );

    const viewerResult = await viewer.query(api.profiles.queries.getUser, {
      userId: fixture.inactiveUserId,
    });
    expect(viewerResult).toBeNull();

    const managerResult = await manager.query(api.profiles.queries.getUser, {
      userId: fixture.inactiveUserId,
    });
    expect(managerResult?.email).toBe("inactive@example.com");
  });
});
