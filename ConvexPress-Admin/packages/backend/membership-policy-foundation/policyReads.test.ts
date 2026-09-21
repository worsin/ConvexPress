import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { defineSchema, defineTable, makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { membershipTables } from "../convex/schema/membership";
import { rules, grants, POLICY_PAGE, requireCompletePolicyPage } from "./policyReads";
const schema = defineSchema({ ...membershipTables, users: defineTable({ name: v.string(), status: v.string() }), settings: defineTable({ section: v.string(), values: v.any() }).index("by_section", ["section"]) });
const modules = {
  "./convex/_generated/server.js": () => import("../convex/_generated/server.js"),
  "./convex/membership/policyReads.ts": () => import("./policyReads"),
  "./convex/fixtures.ts": () => import("./fixtures"),
};
const ruleRef = makeFunctionReference<"query">("membership/policyReads:rules");
const grantRef = makeFunctionReference<"query">("membership/policyReads:grants");
const rule = (key: string, resourceType: "page" | "route" = "page") => ({ resourceType, resourceIdOrKey: key, ruleMode: "allow_only" as const, planIds: [], teaserMode: "hide" as const, loginRequired: true, createdAt: 1, updatedAt: 1 });
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => ({
    userId: await ctx.db.insert("users", { name: "Fictional test member", status: "active" }),
    planId: await ctx.db.insert("membership_plans", { title: "Test", slug: "test", status: "active", grantMode: "manual", priority: 1, createdAt: 1, updatedAt: 1 }),
  }));
  await t.run(async ctx => { await ctx.db.insert("settings", { section: "plugins", values: { membershipEnabled: true } }); });
  return { t, ...ids };
}
test("actual nested functions retain separate pagination journals and both grant statuses", async () => {
  const { t, userId, planId } = await fixture();
  await t.run(async ctx => {
    await ctx.db.insert("membership_restriction_rules", rule("/member", "route"));
    for (const status of ["active", "grace"] as const) await ctx.db.insert("membership_grants", { userId, planId, status, sourceType: "manual", startsAt: 1, createdAt: 1, updatedAt: 1 });
  });
  expect(await t.query(makeFunctionReference<"query">("fixtures:nested"), { userId })).toEqual({ own: 1, rules: 1, active: 1, grace: 1 });
});
test("nested reads observe pending mutation writes and subsequent revocation without caching", async () => {
  const { t, userId, planId } = await fixture();
  expect(await t.mutation(makeFunctionReference<"mutation">("fixtures:pending"), { userId, planId })).toEqual({ before: 1, after: 0, grantsAfterRevoke: 0, allowedBefore: true, allowedAfterRevoke: false });
});
test("route index prefix excludes a large unrelated table and exact resource reads exclude others", async () => {
  const { t } = await fixture();
  await t.run(async ctx => {
    for (let i = 0; i < 1000; i++) await ctx.db.insert("membership_restriction_rules", rule(`page${i}`));
    await ctx.db.insert("membership_restriction_rules", rule("/member/*", "route"));
  });
  const routes = await t.query(ruleRef, { resourceType: "route", resourceIdOrKey: "/member/a" });
  expect(routes).toHaveLength(1);
  expect(routes[0].resourceIdOrKey).toBe("/member/*");
  expect(await t.query(ruleRef, { resourceType: "page", resourceIdOrKey: "page10" })).toHaveLength(1);
});
test("actual internal handlers refuse overflow for rules and either grant status", async () => {
  for (const source of ["rules", "active", "grace"] as const) {
    const { t, userId, planId } = await fixture();
    await t.run(async ctx => {
      if (source !== "rules") await ctx.db.insert("membership_restriction_rules", { ...rule("/member", "route"), planIds: [planId] });
      for (let i = 0; i < 257; i++) {
        if (source === "rules") await ctx.db.insert("membership_restriction_rules", rule("/member", "route"));
        else await ctx.db.insert("membership_grants", { userId, planId, status: source, sourceType: "manual", startsAt: 1, createdAt: 1, updatedAt: 1 });
      }
    });
    await expect(t.query(makeFunctionReference<"query">("fixtures:decision"), { userId, resourceIdOrKey: "/member" })).rejects.toThrow("MEMBERSHIP_POLICY_BUDGET");
    await expect(source === "rules" ? t.query(ruleRef, { resourceType: "route", resourceIdOrKey: "/member" }) : t.query(grantRef, { userId, status: source })).rejects.toThrow("MEMBERSHIP_POLICY_BUDGET");
  }
});
test("server-supplied row and byte budgets plus split metadata refuse incomplete permission evidence", async () => {
  for (const handler of [rules, grants]) {
    for (const result of [
      { isDone: false }, { isDone: true, pageStatus: "SplitRequired" },
      { isDone: true, pageStatus: "SplitRecommended" },
    ]) {
      const builder = { withIndex: () => builder, paginate: async (options: unknown) => { expect(options).toEqual(POLICY_PAGE); return { page: [], continueCursor: "end", ...result }; } };
      await expect((handler as any)._handler({ db: { query: () => builder } }, { resourceType: "route", resourceIdOrKey: "/", userId: "user", status: "active" })).rejects.toThrow("MEMBERSHIP_POLICY_BUDGET");
    }
  }
  expect(requireCompletePolicyPage({ page: [], isDone: true, continueCursor: "end", pageStatus: null, splitCursor: null })).toEqual([]);
  // Cloud returns an inert split cursor even for complete bounded pages. The
  // split status, completion flag and measured budgets determine completeness.
  for (const handler of [rules, grants]) {
    const builder = { withIndex: () => builder, paginate: async (options: unknown) => {
      expect(options).toEqual(POLICY_PAGE);
      return { page: [], isDone: true, continueCursor: "end", pageStatus: null, splitCursor: "middle" };
    } };
    expect(await (handler as any)._handler({ db: { query: () => builder } }, { resourceType: "route", resourceIdOrKey: "/", userId: "user", status: "active" })).toEqual([]);
  }
  const { t, userId } = await fixture();
  await expect(t.query(grantRef, { userId, status: "revoked" })).rejects.toThrow();
  await expect(t.query(ruleRef, { resourceType: "arbitrary", resourceIdOrKey: "/" })).rejects.toThrow();
});

test("complete-looking oversized raw documents refuse before allowing access", async () => {
  const { t, userId } = await fixture();
  await t.run(async ctx => { await ctx.db.insert("membership_restriction_rules", { ...rule("/member", "route"), customMessage: "x".repeat(POLICY_PAGE.maximumBytesRead + 1) }); });
  await expect(t.query(makeFunctionReference<"query">("fixtures:decision"), { userId, resourceIdOrKey: "/member" })).rejects.toThrow("MEMBERSHIP_POLICY_BUDGET");
});
