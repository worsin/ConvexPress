import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";

import { api } from "../../_generated/api";
import schema from "../../schema";

const ADMIN_ISSUER = "https://convexpress-admin.local";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/auth/adminPresence.ts": () => import("../../auth/adminPresence"),
  "./convex/roles/mutations.ts": () => import("../mutations"),
  "./convex/users.ts": () => import("../../users"),
  "./convex/profiles/mutations.ts": () => import("../../profiles/mutations"),
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
        "profile.update",
        "profile.deactivate",
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

  test("blocks demoting the only login-capable administrator when stale admin records exist", async () => {
    const t = createHarness();
    const fixture = await seedAdminRoleFixture(t);
    const now = Date.now();

    const managerUserId = await t.run(async (ctx) => {
      const managerRoleId = await ctx.db.insert("roles", {
        name: "Role Manager",
        slug: "role-manager",
        description: "Can assign roles but is not an administrator.",
        level: 90,
        type: "internal",
        isDefault: false,
        isProtected: false,
        capabilities: ["role.assign"],
        pageAccess: ["/admin", "/admin/users"],
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("users", {
        authSource: "local",
        email: "inactive-admin@example.com",
        username: "inactiveadmin",
        passwordHash: "not-a-real-hash",
        displayName: "Inactive Admin",
        slug: "inactive-admin",
        emailVerified: true,
        status: "inactive",
        isInternal: true,
        internalRole: "admin",
        roleId: fixture.adminRoleId,
        registrationMethod: "self",
        registeredAt: now,
        createdAt: now,
        updatedAt: now,
      });

      return await ctx.db.insert("users", {
        authSource: "local",
        email: "role-manager@example.com",
        username: "rolemanager",
        passwordHash: "not-a-real-hash",
        displayName: "Role Manager",
        slug: "role-manager",
        emailVerified: true,
        status: "active",
        isInternal: true,
        internalRole: "editor",
        roleId: managerRoleId,
        registrationMethod: "self",
        registeredAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });

    const manager = withLocalAdminIdentity(t, managerUserId);

    await expect(
      manager.mutation(api.roles.mutations.assign, {
        userId: fixture.adminUserId,
        roleId: fixture.editorRoleId,
      }),
    ).rejects.toThrow("Cannot remove the last Administrator");

    const adminUser = await t.run(async (ctx) => {
      return await ctx.db.get(fixture.adminUserId);
    });

    expect(adminUser?.roleId).toBe(fixture.adminRoleId);
  });
});

for (const endpoint of ["assign", "legacy"] as const) {
  for (const authSource of ["clerk", undefined] as const) {
    test(`${endpoint} refuses an internal role for ${authSource ?? "unresolved legacy"} identity without writes or events`, async () => {
      const t = createHarness();
      const fixture = await seedAdminRoleFixture(t);
      const targetId = await t.run(async (ctx) => {
        const admin = await ctx.db.get(fixture.adminUserId);
        const { _id, _creationTime, ...fields } = admin!;
        return ctx.db.insert("users", {
          ...fields,
          authSource,
          clerkUserId: "user_synthetic_customer",
          passwordHash: undefined,
          roleId: undefined,
          internalRole: "customer",
          isInternal: false,
        });
      });
      const before = await t.run((ctx) => ctx.db.get(targetId));
      const caller = withLocalAdminIdentity(t, fixture.adminUserId);
      const operation =
        endpoint === "assign"
          ? caller.mutation(api.roles.mutations.assign, {
              userId: targetId,
              roleId: fixture.editorRoleId,
            })
          : caller.mutation(api.users.updateUserRole, {
              userId: targetId,
              internalRole: "editor",
              isInternal: true,
            });
      await expect(operation).rejects.toThrow("customer roles");
      expect(await t.run((ctx) => ctx.db.get(targetId))).toEqual(before);
      expect(
        await t.run((ctx) => ctx.db.query("roleChanges").collect()),
      ).toHaveLength(0);
      expect(
        await t.run((ctx) => ctx.db.query("events").collect()),
      ).toHaveLength(0);
    });
  }
  test(`${endpoint} assigns an active customer role to Clerk and rejects an inactive role`, async () => {
    const t = createHarness();
    const fixture = await seedAdminRoleFixture(t);
    const { targetId, customerRoleId } = await t.run(async (ctx) => {
      const role = await ctx.db.get(fixture.editorRoleId);
      const { _id, _creationTime, ...fields } = role!;
      const customerRoleId = await ctx.db.insert("roles", {
        ...fields,
        slug: "subscriber",
        name: "Subscriber",
        type: "customer",
        level: 0,
        capabilities: [],
      });
      const admin = await ctx.db.get(fixture.adminUserId);
      const { _id: _uid, _creationTime: _created, ...userFields } = admin!;
      const targetId = await ctx.db.insert("users", {
        ...userFields,
        authSource: "clerk",
        clerkUserId: "user_active_customer",
        passwordHash: undefined,
        roleId: undefined,
        internalRole: "customer",
        isInternal: false,
      });
      return { targetId, customerRoleId };
    });
    const caller = withLocalAdminIdentity(t, fixture.adminUserId);
    const assign = () =>
      endpoint === "assign"
        ? caller.mutation(api.roles.mutations.assign, {
            userId: targetId,
            roleId: customerRoleId,
          })
        : caller.mutation(api.users.updateUserRole, {
            userId: targetId,
            internalRole: "customer",
            isInternal: true,
          });
    await assign();
    const target = await t.run((ctx) => ctx.db.get(targetId));
    expect(target?.roleId).toBe(customerRoleId);
    expect(target?.isInternal).toBe(false);
    expect(target?.authSource).toBe("clerk");
    const customer = t.withIdentity({
      subject: "user_active_customer",
      issuer: "https://synthetic.clerk.accounts.dev",
      tokenIdentifier:
        "https://synthetic.clerk.accounts.dev|user_active_customer",
    });
    expect((await customer.query(api.users.getCurrentUser, {}))?._id).toBe(
      targetId,
    );
    expect(await customer.query(api.users.checkAdminAccess, {})).toBeNull();
    if (endpoint === "legacy") {
      const event = await t.run((ctx) => ctx.db.query("events").first());
      expect(JSON.parse(event!.payload).newIsInternal).toBe(false);
      expect(JSON.parse(event!.payload).newRole).toBe("customer");
    }
    expect(
      await t.run((ctx) => ctx.db.query("roleChanges").collect()),
    ).toHaveLength(1);
    await t.run((ctx) => ctx.db.patch(customerRoleId, { status: "inactive" }));
    await expect(assign()).rejects.toThrow("inactive role");
    expect(
      await t.run((ctx) => ctx.db.query("roleChanges").collect()),
    ).toHaveLength(1);
  });
}

for (const endpoint of ["assign", "legacy"] as const) {
  test(`${endpoint} preserves local/management operator assignments and refuses Clerk system roles`, async () => {
    const t = createHarness();
    const fixture = await seedAdminRoleFixture(t);
    const caller = withLocalAdminIdentity(t, fixture.adminUserId);
    for (const authSource of ["local", "management", "clerk"] as const) {
      const targetId = await t.run(async (ctx) => {
        const admin = await ctx.db.get(fixture.adminUserId);
        const { _id, _creationTime, ...fields } = admin!;
        return ctx.db.insert("users", {
          ...fields,
          authSource,
          roleId: undefined,
          internalRole: "customer",
          isInternal: false,
        });
      });
      if (authSource === "clerk")
        await t.run((ctx) =>
          ctx.db.patch(fixture.editorRoleId, { type: "system" }),
        );
      const operation =
        endpoint === "assign"
          ? caller.mutation(api.roles.mutations.assign, {
              userId: targetId,
              roleId: fixture.editorRoleId,
            })
          : caller.mutation(api.users.updateUserRole, {
              userId: targetId,
              internalRole: "editor",
              isInternal: false,
            });
      if (authSource === "clerk") {
        await expect(operation).rejects.toThrow("customer roles");
        expect(
          (await t.run((ctx) => ctx.db.get(targetId)))?.roleId,
        ).toBeUndefined();
      } else {
        await operation;
        const target = await t.run((ctx) => ctx.db.get(targetId));
        expect(target?.roleId).toBe(fixture.editorRoleId);
        expect(target?.isInternal).toBe(true);
        expect(target?.authSource).toBe(authSource);
      }
    }
    expect(
      await t.run((ctx) => ctx.db.query("roleChanges").collect()),
    ).toHaveLength(2);
    expect(await t.run((ctx) => ctx.db.query("events").collect())).toHaveLength(
      2,
    );
  });
}

for (const endpoint of ["profile", "bulk", "create"] as const) {
  test(`${endpoint} rejects ineffective Clerk role intent before writing`, async () => {
    const t = createHarness();
    const f = await seedAdminRoleFixture(t);
    const caller = withLocalAdminIdentity(t, f.adminUserId);
    const targetId = await t.run(async (ctx) => {
      const row = await ctx.db.get(f.adminUserId);
      const { _id, _creationTime, ...fields } = row!;
      return ctx.db.insert("users", {
        ...fields,
        authSource: "clerk",
        roleId: undefined,
        internalRole: "customer",
        isInternal: false,
      });
    });
    const before = await t.run((ctx) => ctx.db.get(targetId));
    if (endpoint === "profile")
      await expect(
        caller.mutation(api.profiles.mutations.updateUser, {
          userId: targetId,
          roleId: f.editorRoleId,
          nickname: "Should not save",
        }),
      ).rejects.toThrow("customer roles");
    if (endpoint === "bulk") {
      const result = await caller.mutation(
        api.profiles.mutations.bulkChangeRole,
        { userIds: [targetId], newRoleId: f.editorRoleId },
      );
      expect(result.updated).toBe(0);
      expect(result.errors[0]?.error).toContain("customer roles");
    }
    if (endpoint === "create")
      await expect(
        caller.mutation(api.profiles.mutations.createUser, {
          email: "create-customer@example.com",
          roleId: f.editorRoleId,
        }),
      ).rejects.toThrow("customer roles");
    expect(await t.run((ctx) => ctx.db.get(targetId))).toEqual(before);
    expect(await t.run((ctx) => ctx.db.query("users").collect())).toHaveLength(
      2,
    );
    expect(
      await t.run((ctx) => ctx.db.query("roleChanges").collect()),
    ).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query("events").collect())).toHaveLength(
      0,
    );
  });
}

test("bulk preflight preserves partial success, deduplicates targets, skips self and retains the last administrator", async () => {
  const t = createHarness();
  const f = await seedAdminRoleFixture(t);
  const ids = await t.run(async (ctx) => {
    const admin = await ctx.db.get(f.adminUserId);
    const { _id, _creationTime, ...fields } = admin!;
    const first = await ctx.db.insert("users", { ...fields });
    const second = await ctx.db.insert("users", { ...fields });
    const clerk = await ctx.db.insert("users", {
      ...fields,
      authSource: "clerk",
      roleId: undefined,
      internalRole: "customer",
      isInternal: false,
    });
    const role = await ctx.db.get(f.editorRoleId);
    const { _id: _roleId, _creationTime: _created, ...roleFields } = role!;
    const managerRole = await ctx.db.insert("roles", {
      ...roleFields,
      slug: "role-manager",
      level: 50,
      capabilities: ["role.assign"],
    });
    await ctx.db.patch(f.adminUserId, { roleId: managerRole });
    return { first, second, clerk };
  });
  const caller = withLocalAdminIdentity(t, f.adminUserId);
  const result = await caller.mutation(api.profiles.mutations.bulkChangeRole, {
    userIds: [f.adminUserId, ids.first, ids.first, ids.clerk, ids.second],
    newRoleId: f.editorRoleId,
  });
  expect(result.updated).toBe(1);
  expect(result.errors).toHaveLength(2);
  expect(
    result.errors.some((item) => item.error.includes("customer roles")),
  ).toBe(true);
  expect(
    result.errors.some((item) => item.error.includes("last Administrator")),
  ).toBe(true);
  expect((await t.run((ctx) => ctx.db.get(ids.first)))?.roleId).toBe(
    f.editorRoleId,
  );
  expect((await t.run((ctx) => ctx.db.get(ids.second)))?.roleId).toBe(
    f.adminRoleId,
  );
  expect((await t.run((ctx) => ctx.db.get(ids.clerk)))?.roleId).toBeUndefined();
  expect(await t.run((ctx) => ctx.db.query("events").collect())).toHaveLength(
    1,
  );
});

test("profile role change preserves self protection and permits a real customer role", async () => {
  const t = createHarness();
  const f = await seedAdminRoleFixture(t);
  const caller = withLocalAdminIdentity(t, f.adminUserId);
  await expect(
    caller.mutation(api.profiles.mutations.updateUser, {
      userId: f.adminUserId,
      roleId: f.editorRoleId,
    }),
  ).rejects.toThrow("own role");
  const { customerRole, target } = await t.run(async (ctx) => {
    const admin = await ctx.db.get(f.adminUserId);
    const { _id, _creationTime, ...fields } = admin!;
    const role = await ctx.db.get(f.editorRoleId);
    const { _id: _rid, _creationTime: _rtime, ...roleFields } = role!;
    return {
      customerRole: await ctx.db.insert("roles", {
        ...roleFields,
        type: "customer",
        slug: "subscriber",
        level: 0,
      }),
      target: await ctx.db.insert("users", {
        ...fields,
        authSource: "clerk",
        roleId: undefined,
      }),
    };
  });
  await caller.mutation(api.profiles.mutations.updateUser, {
    userId: target,
    roleId: customerRole,
  });
  expect((await t.run((ctx) => ctx.db.get(target)))?.roleId).toBe(customerRole);
  expect(
    await t.run((ctx) => ctx.db.query("roleChanges").collect()),
  ).toHaveLength(1);
});
