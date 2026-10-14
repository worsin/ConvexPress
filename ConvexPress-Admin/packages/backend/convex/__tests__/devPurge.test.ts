import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../schema";
import { internal } from "../_generated/api";

const modules = {
  "./convex/_generated/server.js": () => import("../_generated/server.js"),
  "./convex/_generated/api.js": () => import("../_generated/api.js"),
  "./convex/_devPurge.ts": () => import("../_devPurge"),
};

test("purgeWordPressSyncState wipes every WordPress sync table, including ID mappings", async () => {
  const previous = process.env.CONVEXPRESS_ENABLE_DEV_INTERNALS;
  process.env.CONVEXPRESS_ENABLE_DEV_INTERNALS = "true";
  try {
    const t = convexTest({ schema, modules });
    await t.run(async ctx => {
      const roleId = await ctx.db.insert("roles", { name: "Administrator", slug: "administrator", description: "Fixture", level: 100, type: "internal", status: "active", isDefault: false, isProtected: false, capabilities: [], pageAccess: [], createdAt: 1, updatedAt: 1 });
      const userId = await ctx.db.insert("users", { authSource: "local", email: "purge@example.invalid", emailVerified: true, roleId, status: "active", createdAt: 1, updatedAt: 1 });
      const siteId = await ctx.db.insert("wordpressSites", { name: "Fixture", siteUrl: "https://wp.example.invalid", username: "u", applicationPassword: "p", status: "active", createdBy: userId, createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("wpIdMappings", { siteId, objectType: "post", wpId: 1, convexId: "x", createdAt: 1 });
    });
    const result = await t.mutation(internal._devPurge.purgeWordPressSyncState, { confirm: "YES_PURGE_SYNC" });
    expect(result).toEqual({ wordpressSyncReconciliationFindings: 0, wordpressSyncReports: 0, wpIdMappings: 1, wordpressSyncJobs: 0, wordpressSites: 1 });
    expect(await t.run(async ctx => [...await ctx.db.query("wpIdMappings").collect(), ...await ctx.db.query("wordpressSites").collect()])).toEqual([]);
  } finally {
    if (previous === undefined) delete process.env.CONVEXPRESS_ENABLE_DEV_INTERNALS;
    else process.env.CONVEXPRESS_ENABLE_DEV_INTERNALS = previous;
  }
});
