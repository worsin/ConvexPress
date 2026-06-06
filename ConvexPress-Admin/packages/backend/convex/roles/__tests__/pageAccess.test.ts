import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";

import { internal } from "../../_generated/api";
import schema from "../../schema";
import { BUILT_IN_ROLES } from "../../seed/roles";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/roles/internals.ts": () => import("../internals"),
};

function createHarness() {
  return convexTest({ schema, modules });
}

describe("built-in role page access", () => {
  test("only administrators get first-run setup page access", () => {
    const rolesBySlug = new Map(
      BUILT_IN_ROLES.map((role) => [role.slug, role]),
    );
    const administrator = rolesBySlug.get("administrator");

    expect(administrator?.pageAccess).toContain("/admin/setup");

    for (const role of BUILT_IN_ROLES) {
      if (role.slug === "administrator") continue;
      expect(role.pageAccess).not.toContain("/admin/setup");
    }
  });

  test("repairs existing administrator roles without reseeding everything", async () => {
    const t = createHarness();
    const now = Date.now();

    const roleId = await t.run(async (ctx) => {
      return await ctx.db.insert("roles", {
        name: "Administrator",
        slug: "administrator",
        description: "Customized live admin role",
        level: 100,
        type: "internal",
        isDefault: false,
        isProtected: true,
        capabilities: ["manage_options", "custom.live_capability"],
        pageAccess: ["/admin", "/admin/dashboard"],
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(
      t.mutation(internal.roles.internals.ensureAdminSetupPageAccess),
    ).resolves.toEqual({
      updated: true,
      added: "/admin/setup",
    });

    await expect(
      t.mutation(internal.roles.internals.ensureAdminSetupPageAccess),
    ).resolves.toEqual({
      updated: false,
      reason: "Administrator role already has setup page access",
    });

    const role = await t.run(async (ctx) => await ctx.db.get(roleId));

    expect(role?.description).toBe("Customized live admin role");
    expect(role?.capabilities).toEqual([
      "manage_options",
      "custom.live_capability",
    ]);
    expect(role?.pageAccess).toEqual([
      "/admin",
      "/admin/dashboard",
      "/admin/setup",
    ]);
  });
});
