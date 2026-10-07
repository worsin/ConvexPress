import { canonicalPostBody } from "../../__tests__/canonicalPostFixture";
import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { readTagCloud } from "../tagCloud";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
const modules = { "./convex/_generated/api.js": () => import("../../_generated/api.js"), "./convex/_generated/server.js": () => import("../../_generated/server.js"), "./convex/membership/policyReads.ts": () => import("../../membership/policyReads") };
const scope = { websiteKey: "site", instanceKey: "stage" };
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const user = await ctx.db.insert("users", { authSource: "local", email: "author@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("settings", { section: "plugins", values: { membershipEnabled: false }, updatedAt: 1, updatedBy: user });
    const tags = [];
    for (const name of ["Ceramics", "Design", "Empty", "Private plans", "Scheduled", "Wood & wool"]) tags.push(await ctx.db.insert("terms", { name, slug: name.toLowerCase().replaceAll(" ", "-"), taxonomy: "post_tag", count: 99999, isDefault: false, createdAt: 1, updatedAt: 1 }));
    const posts = [];
    for (const i of [0, 1, 3, 4, 5]) {
      const post = await ctx.db.insert("posts", { type: "post", title: `Story ${i}`, slug: `story-${i}`, publishedAt: i === 4 ? Date.now() + 86400000 : 100, visibility: i === 3 ? "private" : "public", status: "publish", authorId: user, commentStatus: "closed", ...canonicalPostBody("Never disclose source body"), createdAt: 1, updatedAt: 1 });
      // Deliberately raw legacy rows: topic discovery does not require derived caches.
      await ctx.db.insert("termRelationships", { postId: post, termId: tags[i]! }); posts.push(post);
    }
    return { user, tags, posts };
  });
  return { t, ids };
}
test("topics expose only currently discoverable posts, no counts or source bodies, and traverse without duplicates", async () => {
  const { t } = await fixture();
  const seen: string[] = []; let cursor: string | null = null;
  for (let page = 0; page < 12; page++) {
    const result = await t.run(ctx => readTagCloud(ctx, { max: 1, cursor }, scope, "doc"));
    seen.push(...result.items.map(item => item.name));
    expect(JSON.stringify(result)).not.toContain("Private plans");
    expect(JSON.stringify(result)).not.toContain("Never disclose");
    expect(JSON.stringify(result)).not.toContain("99999");
    cursor = result.nextCursor; if (!cursor) break;
  }
  expect(cursor).toBeNull(); expect(seen).toEqual(["Ceramics", "Design", "Wood & wool"]);
});
test("many inaccessible relationships yield an opaque continuation inside the same topic and eventually find its accessible post", async () => {
  const { t, ids } = await fixture();
  await t.run(async ctx => {
    const tag = await ctx.db.insert("terms", { name: "A confidential topic", slug: "eventually-public", taxonomy: "post_tag", count: 0, isDefault: false, createdAt: 1, updatedAt: 1 });
    for (let i = 0; i < 130; i++) await ctx.db.insert("termRelationships", { postId: ids.posts[2]!, termId: tag });
    await ctx.db.insert("termRelationships", { postId: ids.posts[0]!, termId: tag });
  });
  let cursor: string | null = null; const seen: string[] = []; let pending = 0;
  for (let page = 0; page < 20; page++) {
    const budget = new RequestReadLedger();
    const result = await t.run(ctx => readTagCloud(ctx, { max: 10, cursor }, scope, "doc", budget));
    expect(budget.queries).toBeLessThanOrEqual(256);
    if (!result.items.length && result.nextCursor) { pending++; expect(result.nextCursor).not.toContain("confidential"); }
    seen.push(...result.items.map(item => item.name)); cursor = result.nextCursor; if (!cursor) break;
  }
  expect(pending).toBeGreaterThan(0); expect(cursor).toBeNull();
  expect(seen).toEqual(["A confidential topic", "Ceramics", "Design", "Wood & wool"]);
});
test("scope, document, saved limit and cursor coordinates cannot be changed or forged", async () => {
  const { t, ids } = await fixture();
  const first = await t.run(ctx => readTagCloud(ctx, { max: 1 }, scope, "doc"));
  expect(first.nextCursor).not.toBeNull();
  for (const [args, target, document] of [
    [{ max: 2, cursor: first.nextCursor }, scope, "doc"],
    [{ max: 1, cursor: first.nextCursor }, { ...scope, instanceKey: "other" }, "doc"],
    [{ max: 1, cursor: first.nextCursor }, scope, "other"],
  ] as const) await expect(t.run(ctx => readTagCloud(ctx, args, target, document))).rejects.toThrow("another document");
  const bad = JSON.parse(first.nextCursor!); bad.termId = ids.user;
  await expect(t.run(ctx => readTagCloud(ctx, { max: 1, cursor: JSON.stringify(bad) }, scope, "doc"))).rejects.toThrow("coordinates");
  const budget = new RequestReadLedger();
  await expect(t.run(ctx => readTagCloud(ctx, { max: 1.5 }, scope, "doc", budget))).rejects.toThrow(); expect(budget.queries).toBe(0);
});
test("current route membership is rechecked after a grant is revoked", async () => {
  const { t, ids } = await fixture();
  const grant = await t.run(async ctx => {
    const settings = await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique();
    await ctx.db.patch("settings", settings!._id, { values: { membershipEnabled: true } });
    const plan = await ctx.db.insert("membership_plans", { title: "Readers", slug: "readers", status: "active", grantMode: "manual", priority: 1, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("membership_restriction_rules", { resourceType: "route", resourceIdOrKey: "/blog/story-0", ruleMode: "allow_only", planIds: [plan], teaserMode: "excerpt", loginRequired: true, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("membership_restriction_rules", { resourceType: "route", resourceIdOrKey: "/tag/design", ruleMode: "allow_only", planIds: [plan], teaserMode: "excerpt", loginRequired: true, createdAt: 1, updatedAt: 1 });
    return ctx.db.insert("membership_grants", { userId: ids.user, planId: plan, sourceType: "manual", status: "active", startsAt: 1, createdAt: 1, updatedAt: 1 });
  });
  const read = () => t.run(ctx => readTagCloud(ctx, {}, scope, "doc"));
  expect((await read()).items.map(item => item.name)).not.toContain("Ceramics");
  expect((await read()).items.map(item => item.name)).not.toContain("Design");
  const member = t.withIdentity({ subject: ids.user, tokenIdentifier: `https://convexpress-admin.local|${ids.user}` });
  expect((await member.run(ctx => readTagCloud(ctx, {}, scope, "doc"))).items.map(item => item.name)).toContain("Ceramics");
  await t.run(ctx => ctx.db.patch("membership_grants", grant, { status: "revoked" }));
  expect((await member.run(ctx => readTagCloud(ctx, {}, scope, "doc"))).items.map(item => item.name)).not.toContain("Ceramics");
});

test("deleted continuation coordinates offer a visible restart instead of stranding the document in an error", async () => {
  const { t } = await fixture();
  const first = await t.run(ctx => readTagCloud(ctx, { max: 1 }, scope, "doc"));
  const cursor = JSON.parse(first.nextCursor!);
  await t.run(async ctx => { const id=ctx.db.normalizeId("terms",cursor.termId); await ctx.db.delete("terms",id!); });
  const result = await t.run(ctx => readTagCloud(ctx,{max:1,cursor:first.nextCursor},scope,"doc"));
  expect(result.resetRequired).toBe(true);expect(result.items).toEqual([]);expect(result.nextCursor).toBeNull();expect(result.cursor).toBe(first.nextCursor);
});
