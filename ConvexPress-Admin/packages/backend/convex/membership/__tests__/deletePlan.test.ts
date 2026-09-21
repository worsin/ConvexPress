import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../schema";
const modules = {
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/membership/mutations.ts": () => import("../mutations"),
};
test("deleting one membership plan preserves unrelated empty and nonempty restrictions", async () => {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const roleId = await ctx.db.insert("roles", { name: "Administrator", slug: "administrator", description: "Test fixture", level: 100, type: "internal", status: "active", isDefault: false, isProtected: false, capabilities: ["manage_options"], pageAccess: [], createdAt: 1, updatedAt: 1 });
    const userId = await ctx.db.insert("users", { email: "plans@example.test", emailVerified: true, authSource: "local", roleId, status: "active", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("settings", { section: "plugins", values: { membershipEnabled: true }, updatedAt: 1, updatedBy: userId });
    const plan = (slug: string) => ctx.db.insert("membership_plans", { title: slug, slug, status: "active", grantMode: "manual", priority: 0, createdAt: 1, updatedAt: 1 });
    const target = await plan("delete-me"), other = await plan("keep-me");
    const rules = [];
    for (const [key, planIds] of [["empty", []], ["other", [other]], ["target", [target]], ["shared", [target, other]]] as const) rules.push(await ctx.db.insert("membership_restriction_rules", { resourceType: "route", resourceIdOrKey: "/" + key, ruleMode: "allow_only", planIds: [...planIds], loginRequired: true, teaserMode: "hide", createdAt: 1, updatedAt: 1 }));
    return { userId, target, other, rules };
  });
  const before = await t.run(async ctx => Promise.all(ids.rules.map(id => ctx.db.get("membership_restriction_rules", id))));
  expect(await t.withIdentity({ subject: ids.userId, issuer: "https://convexpress-admin.local" }).mutation(makeFunctionReference<"mutation">("membership/mutations:deletePlan"), { planId: ids.target })).toEqual({ deleted: true });
  const after = await t.run(async ctx => Promise.all(ids.rules.map(id => ctx.db.get("membership_restriction_rules", id))));
  expect(after[0]).toEqual(before[0]); expect(after[1]).toEqual(before[1]); expect(after[2]).toBeNull(); expect(after[3]?.planIds).toEqual([ids.other]);
  expect(await t.run(ctx => ctx.db.get("membership_plans", ids.target))).toBeNull();
  expect(await t.run(ctx => ctx.db.get("membership_plans", ids.other))).not.toBeNull();
});
