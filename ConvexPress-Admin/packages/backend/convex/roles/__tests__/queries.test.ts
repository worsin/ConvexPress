import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";

import { api } from "../../_generated/api";
import schema from "../../schema";

const ADMIN_ISSUER = "https://convexpress-admin.local";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/roles/queries.ts": () => import("../queries"),
};

function createHarness() {
  return convexTest({ schema, modules });
}

async function seedRolePolicyFixture(t: ReturnType<typeof createHarness>) {
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
      capabilities: ["role.update", "post.update", "manage_options"],
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
      capabilities: ["post.update", "media.upload"],
      pageAccess: ["/admin", "/admin/posts", "/admin/media"],
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const subscriberRoleId = await ctx.db.insert("roles", {
      name: "Subscriber",
      slug: "subscriber",
      description: "Default customer",
      level: 20,
      type: "customer",
      isDefault: true,
      isProtected: true,
      capabilities: ["profile.view"],
      pageAccess: ["/admin/users/profile"],
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

    const editorUserId = await ctx.db.insert("users", {
      authSource: "local",
      email: "editor@example.com",
      username: "editor",
      passwordHash: "not-a-real-hash",
      displayName: "Editor",
      slug: "editor",
      emailVerified: true,
      status: "active",
      isInternal: true,
      internalRole: "editor",
      roleId: editorRoleId,
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return {
      adminRoleId,
      editorRoleId,
      subscriberRoleId,
      adminUserId,
      editorUserId,
    };
  });
}

function withLocalAdminIdentity(
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

describe("roles queries", () => {
  test("allows a caller to read policy arrays for their own active role", async () => {
    const t = createHarness();
    const fixture = await seedRolePolicyFixture(t);
    const editor = withLocalAdminIdentity(
      t,
      fixture.editorUserId,
      "editor@example.com",
      "Editor",
    );

    const role = await editor.query(api.roles.queries.getRole, {
      roleId: fixture.editorRoleId,
    });

    expect(role?.capabilities).toContain("post.update");
    expect(role?.pageAccess).toContain("/admin/posts");
  });

  test("strips policy arrays from unrelated roles for non-role-admins", async () => {
    const t = createHarness();
    const fixture = await seedRolePolicyFixture(t);
    const editor = withLocalAdminIdentity(
      t,
      fixture.editorUserId,
      "editor@example.com",
      "Editor",
    );

    const role = await editor.query(api.roles.queries.getRole, {
      roleId: fixture.adminRoleId,
    });

    expect(role?.name).toBe("Administrator");
    expect(role?.capabilities).toEqual([]);
    expect(role?.pageAccess).toEqual([]);
  });

  test("allows role managers to read policy arrays for any role", async () => {
    const t = createHarness();
    const fixture = await seedRolePolicyFixture(t);
    const admin = withLocalAdminIdentity(
      t,
      fixture.adminUserId,
      "admin@example.com",
      "Admin",
    );

    const role = await admin.query(api.roles.queries.getRole, {
      roleId: fixture.editorRoleId,
    });

    expect(role?.capabilities).toContain("media.upload");
    expect(role?.pageAccess).toContain("/admin/media");
  });

  test("strips default-role policy arrays for non-role-admins", async () => {
    const t = createHarness();
    const fixture = await seedRolePolicyFixture(t);
    const editor = withLocalAdminIdentity(
      t,
      fixture.editorUserId,
      "editor@example.com",
      "Editor",
    );

    const defaultRole = await editor.query(api.roles.queries.getDefaultRole);

    expect(defaultRole?._id).toBe(fixture.subscriberRoleId);
    expect(defaultRole?.capabilities).toEqual([]);
    expect(defaultRole?.pageAccess).toEqual([]);
  });
});
