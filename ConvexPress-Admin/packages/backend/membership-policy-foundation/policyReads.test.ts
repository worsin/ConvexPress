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

const blockBatchRef = makeFunctionReference<"query">("membership/policyReads:measuredBlockRules");
const blockRule = (key: string) => ({ ...rule(key), resourceType: "block" as const });
test("block batches measure raw rows, isolate target types and retain a late deny", async () => {
  const { t, userId, planId } = await fixture();
  await t.run(async ctx => {
    for (let i = 0; i < 300; i++) await ctx.db.insert("membership_restriction_rules", blockRule(`unrelated-${i}`));
    await ctx.db.insert("membership_restriction_rules", rule("intro"));
    for (let i = 0; i < 255; i++) await ctx.db.insert("membership_restriction_rules", blockRule("intro"));
    await ctx.db.insert("membership_restriction_rules", { ...blockRule("intro"), ruleMode: "deny_if_missing", planIds: [planId], customMessage: "Last rule must survive" });
  });
  const result = await t.query(blockBatchRef, { keys: ["missing", "intro"] });
  expect(result.rows).toBe(256);
  expect(result.items).toHaveLength(256);
  expect(result.items.at(-1).ruleMode).toBe("deny_if_missing");
  expect(result.items.every((row: { resourceType: string; resourceIdOrKey: string }) => row.resourceType === "block" && row.resourceIdOrKey === "intro")).toBe(true);
  const { getDocumentSize } = await import("convex/values");
  const raw = await t.run(ctx => ctx.db.query("membership_restriction_rules").withIndex("by_resource", q => q.eq("resourceType", "block").eq("resourceIdOrKey", "intro")).take(257));
  expect(result.bytes).toBe(raw.reduce((sum, row) => sum + getDocumentSize(row), 0));
  const { createMembershipAccessEvaluator } = await import("../convex/membership/access");
  expect(await t.run(async ctx => {
    const access = createMembershipAccessEvaluator(ctx);
    await access.preloadBlocks(["missing", "intro"]);
    return (await access({ userId, resourceType: "block", resourceIdOrKey: "intro" })).allowed;
  })).toBe(false);
  await t.run(ctx => ctx.db.insert("membership_restriction_rules", blockRule("intro")));
  await expect(t.query(blockBatchRef, { keys: ["missing", "intro"] })).rejects.toThrow("MEMBERSHIP_POLICY_BUDGET");
});
test("block batches reject aggregate row and byte overflow instead of returning partial policy", async () => {
  const { t } = await fixture();
  const keys = Array.from({ length: 9 }, (_, i) => `target-${i}`);
  await t.run(async ctx => {
    for (const key of keys) for (let i = 0; i < 256; i++) await ctx.db.insert("membership_restriction_rules", blockRule(key));
  });
  await expect(t.query(blockBatchRef, { keys })).rejects.toThrow("MEMBERSHIP_POLICY_BUDGET");
  const oversized = await fixture();
  await oversized.t.run(async ctx => {
    for (const key of ["a", "b"]) await ctx.db.insert("membership_restriction_rules", { ...blockRule(key), customMessage: "x".repeat(270_000) });
  });
  expect((await oversized.t.query(blockBatchRef, { keys: ["a"] })).rows).toBe(1);
  await expect(oversized.t.query(blockBatchRef, { keys: ["a", "b"] })).rejects.toThrow("MEMBERSHIP_POLICY_BUDGET");
});
test("block batches reject malformed and unbounded target sets", async () => {
  const { t } = await fixture();
  for (const keys of [[], [""], ["a", "a"], ["a".repeat(257)], Array.from({ length: 129 }, (_, i) => `key-${i}`)])
    await expect(t.query(blockBatchRef, { keys })).rejects.toThrow("MEMBERSHIP_POLICY_KEYS");
  expect(await t.query(blockBatchRef, { keys: Array.from({ length: 128 }, (_, i) => `key-${i}`) })).toEqual({ items: [], rows: 0, bytes: 0 });
});
