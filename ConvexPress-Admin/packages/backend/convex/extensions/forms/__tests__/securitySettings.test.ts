import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../../_generated/server.js"),
  "./convex/extensions/forms/spam.ts": () => import("../spam"),
};
const update = makeFunctionReference<"mutation">("extensions/forms/spam:updateSecuritySettings");
const read = makeFunctionReference<"query">("extensions/forms/spam:getSecuritySettings");

async function fixture() {
  const t = convexTest({ schema, modules });
  const { user, plugin } = await t.run(async ctx => {
    const role = await ctx.db.insert("roles", { name: "Forms operator", slug: "forms-operator", description: "Test fixture", level: 1, type: "internal", isDefault: false, isProtected: false, capabilities: ["form.manage_security"], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
    const user = await ctx.db.insert("users", { authSource: "local", email: "forms-settings@example.invalid", roleId: role, emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    const plugin = await ctx.db.insert("settings", { section: "plugins", values: { formsEnabled: true }, updatedAt: 1, updatedBy: user });
    return { user, plugin };
  });
  const account = t.withIdentity({ subject: user, tokenIdentifier: `https://convexpress-admin.local|${user}` });
  return { t, account, user, plugin };
}

test("security ceiling can be set, omitted, cleared and set again without changing other policies", async () => {
  const { t, account } = await fixture();
  await account.mutation(update, { perFormLimit: 12, windowMs: 60000, skipForLoggedIn: false });
  await account.mutation(update, { honeypotEnabled: false });
  expect(await account.query(read, {})).toMatchObject({ perFormLimit: 12, windowMs: 60000, skipForLoggedIn: false });
  await account.mutation(update, { perFormLimit: null });
  const row = await t.run(ctx => ctx.db.query("form_security_settings").withIndex("by_key", q => q.eq("key", "global")).unique());
  expect(row).not.toHaveProperty("perFormLimit");
  expect(row).toMatchObject({ windowMs: 60000, skipForLoggedIn: false, honeypotEnabled: false });
  expect((await account.query(read, {})).perFormLimit).toBeUndefined();
  await account.mutation(update, { perFormLimit: 3 });
  expect((await account.query(read, {})).perFormLimit).toBe(3);
  for (const value of [0, -1]) await expect(account.mutation(update, { perFormLimit: value })).rejects.toThrow();
  expect((await account.query(read, {})).perFormLimit).toBe(3);
});

test("explicit clear works on fresh settings and retains account/plugin authorization", async () => {
  const { t, account, user, plugin } = await fixture();
  await expect(t.mutation(update, { perFormLimit: null })).rejects.toThrow();
  await account.mutation(update, { perFormLimit: null });
  expect((await account.query(read, {})).perFormLimit).toBeUndefined();
  await t.run(ctx => ctx.db.patch("settings", plugin, { values: { formsEnabled: false } }));
  await expect(account.mutation(update, { perFormLimit: 5 })).rejects.toThrow();
  await t.run(async ctx => { await ctx.db.patch("settings", plugin, { values: { formsEnabled: true } }); await ctx.db.patch("users", user, { status: "banned" }); });
  await expect(account.mutation(update, { perFormLimit: null })).rejects.toThrow();
});
