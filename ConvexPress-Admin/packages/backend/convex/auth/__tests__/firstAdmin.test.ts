import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";

import { api } from "../../_generated/api";
import schema from "../../schema";
import { verifyPassword } from "../helpers";

const PASSWORD = "CorrectHorseBatteryStaple42!";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/auth/setup.ts": () => import("../setup"),
  "./convex/auth/internals.ts": () => import("../internals"),
  "./convex/auth/queries.ts": () => import("../queries"),
  "./convex/roles/internals.ts": () => import("../../roles/internals"),
};

function createHarness() {
  return convexTest({ schema, modules });
}

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
});
