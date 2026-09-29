import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { isPluginEnabled } from "../../helpers/plugins";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/settings/queries.ts": () => import("../../settings/queries"),
};
const affected = ["knowledgeBase", "tickets", "recipes", "gallery"];

test("public settings already publish enabled backend defaults without creating settings", async () => {
  const t = convexTest({ schema, modules });
  const settings = await t.query(api.settings.queries.getPublic, {});
  for (const id of affected) {
    expect(settings.plugins[id + "Enabled"]).toBe(true);
    expect(await t.run(ctx => isPluginEnabled(ctx, id))).toBe(true);
  }
  expect(await t.run(ctx => ctx.db.query("settings").take(1))).toEqual([]);
});

test("stored false and true choices survive public settings projection and handler gating", async () => {
  const t = convexTest({ schema, modules });
  const row = await t.run(async ctx => {
    const user = await ctx.db.insert("users", { authSource: "local", email: "plugin-defaults@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    return ctx.db.insert("settings", { section: "plugins", values: {}, updatedBy: user, updatedAt: 1 });
  });
  for (const enabled of [false, true]) {
    const values = Object.fromEntries(affected.map(id => [id + "Enabled", enabled]));
    await t.run(ctx => ctx.db.patch(row, { values }));
    const settings = await t.query(api.settings.queries.getPublic, {});
    for (const id of affected) {
      expect(settings.plugins[id + "Enabled"]).toBe(enabled);
      expect(await t.run(ctx => isPluginEnabled(ctx, id))).toBe(enabled);
    }
    expect((await t.run(ctx => ctx.db.get(row)))?.values).toEqual(values);
  }
});
