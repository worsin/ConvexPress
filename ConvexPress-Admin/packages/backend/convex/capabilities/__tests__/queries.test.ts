import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";

import { api } from "../../_generated/api";
import schema from "../../schema";

const ADMIN_ISSUER = "https://convexpress-admin.local";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/capabilities/queries.ts": () => import("../queries"),
};

function createHarness() {
  return convexTest({ schema, modules });
}

async function seedUserHarness(
  t: ReturnType<typeof createHarness>,
  options: {
    email: string;
    username: string;
    roleSlug: string;
    capabilities: string[];
    pageAccess?: string[];
  },
) {
  const now = Date.now();
  const result = await t.run(async (ctx) => {
    const roleId = await ctx.db.insert("roles", {
      name: options.roleSlug,
      slug: options.roleSlug,
      description: "Test admin role",
      level: 100,
      type: "internal",
      isDefault: false,
      isProtected: options.roleSlug === "administrator",
      capabilities: options.capabilities,
      pageAccess: options.pageAccess ?? ["/admin"],
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const userId = await ctx.db.insert("users", {
      authSource: "local",
      email: options.email,
      username: options.username,
      passwordHash: "not-a-real-hash",
      displayName: options.username,
      slug: options.username,
      emailVerified: true,
      status: "active",
      isInternal: true,
      internalRole: options.roleSlug,
      roleId,
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return { userId };
  });

  return t.withIdentity({
    issuer: ADMIN_ISSUER,
    subject: result.userId,
    tokenIdentifier: `${ADMIN_ISSUER}|${result.userId}`,
    email: options.email,
    name: options.username,
  });
}

async function seedCapabilityHarness(t: ReturnType<typeof createHarness>) {
  const now = Date.now();

  return await t.run(async (ctx) => {
    const updateRoleCapabilityId = await ctx.db.insert("capabilities", {
      name: "Update Role",
      actionCode: "role.update",
      notes: "Update roles and inspect role policy.",
      status: "Active",
      auditStatus: "Complete",
      completion: 1,
      category: "Roles",
      roleNames: ["Administrator"],
      eventCodes: ["role.updated"],
      systemName: "Role & Capability System",
      airtableRecordId: "rec-role-update",
      syncedAt: now,
    });

    await ctx.db.insert("capabilities", {
      name: "Read Post",
      actionCode: "post.read",
      notes: "Read posts.",
      status: "Planned",
      auditStatus: "Incomplete",
      completion: 0.5,
      category: "Content",
      roleNames: ["Editor"],
      eventCodes: [],
      systemName: "Content",
      airtableRecordId: "rec-post-read",
      syncedAt: now,
    });

    return { updateRoleCapabilityId };
  });
}

async function seedRoleManagerHarness(t: ReturnType<typeof createHarness>) {
  return await seedUserHarness(t, {
    email: "admin@example.com",
    username: "admin",
    roleSlug: "administrator",
    capabilities: ["role.update"],
    pageAccess: ["/admin", "/admin/tools/capabilities"],
  });
}

describe("capabilities queries", () => {
  test("allows role managers to list, count, and read capability definitions", async () => {
    const t = createHarness();
    const admin = await seedRoleManagerHarness(t);
    const { updateRoleCapabilityId } = await seedCapabilityHarness(t);

    const all = await admin.query(api.capabilities.queries.list, {});
    expect(all.map((capability) => capability.actionCode)).toEqual([
      "post.read",
      "role.update",
    ]);

    const filtered = await admin.query(api.capabilities.queries.list, {
      category: "Roles",
      search: "role",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.actionCode).toBe("role.update");

    const counts = await admin.query(api.capabilities.queries.counts, {});
    expect(counts).toEqual({ all: 2, Active: 1, Planned: 1 });

    const capability = await admin.query(api.capabilities.queries.get, {
      id: updateRoleCapabilityId,
    });
    expect(capability?.name).toBe("Update Role");
  });

  test("rejects authenticated users without role management capability", async () => {
    const t = createHarness();
    const viewer = await seedUserHarness(t, {
      email: "viewer@example.com",
      username: "viewer",
      roleSlug: "viewer",
      capabilities: ["post.read"],
    });
    const { updateRoleCapabilityId } = await seedCapabilityHarness(t);

    await expect(
      viewer.query(api.capabilities.queries.list, {}),
    ).rejects.toThrow("Insufficient permissions");
    await expect(
      viewer.query(api.capabilities.queries.counts, {}),
    ).rejects.toThrow("Insufficient permissions");
    await expect(
      viewer.query(api.capabilities.queries.get, {
        id: updateRoleCapabilityId,
      }),
    ).rejects.toThrow("Insufficient permissions");
  });
});
