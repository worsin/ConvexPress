import { canonicalPostBody } from "../../__tests__/canonicalPostFixture";
import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { readPostGrid } from "../postGrid";
import { insertTermRelationship, refreshTermDiscovery } from "../../helpers/postDiscovery";
import { makeFunctionReference } from "convex/server";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
const modules = { "./convex/canonicalDocuments.ts": () => import("../../canonicalDocuments"), "./convex/_generated/api.js": () => import("../../_generated/api.js"), "./convex/_generated/server.js": () => import("../../_generated/server.js"), "./convex/membership/policyReads.ts": () => import("../../membership/policyReads") };
const scope = { websiteKey: "site", instanceKey: "stage" };
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const user = await ctx.db.insert("users", { authSource: "local", email: "author@example.invalid", emailVerified: true, status: "active", displayName: "Public author", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("settings", { section: "plugins", values: { membershipEnabled: false }, updatedAt: 1, updatedBy: user });
    const category = await ctx.db.insert("terms", { name: "Field", slug: "field", taxonomy: "category", count: 0, isDefault: false, createdAt: 1, updatedAt: 1 });
    const tag = await ctx.db.insert("terms", { name: "Design", slug: "design", taxonomy: "post_tag", count: 0, isDefault: false, createdAt: 1, updatedAt: 1 });
    const posts = [];
    for (let i = 0; i < 7; i++) {
      const post = await ctx.db.insert("posts", { type: "post", title: `Story ${i}`, slug: `story-${i}`, publishedAt: i < 4 ? 100 : 200 + i, visibility: "public", status: "publish", authorId: user, commentStatus: "closed", ...canonicalPostBody("Private source body"), excerpt: "Public excerpt", createdAt: 1, updatedAt: 1 });
      await insertTermRelationship(ctx, { postId: post, termId: category });
      if (i % 2 === 0) await insertTermRelationship(ctx, { postId: post, termId: tag });
      posts.push(post);
    }
    for (let i = 0; i < 220; i++) await ctx.db.insert("posts", { type: "post", title: `Unrelated ${i}`, slug: `unrelated-${i}`, publishedAt: 1000 + i, visibility: "public", status: "publish", authorId: user, commentStatus: "closed", createdAt: 1, updatedAt: 1 });
    return { user, category, tag, posts };
  });
  return { t, ids };
}
test("indexed category/author pages ignore unrelated posts and preserve ties without duplicate or missing results", async () => {
  const { t, ids } = await fixture();
  const query = { category: ids.category, author: ids.user };
  const seen: string[] = []; let cursor: string | null = null; let pages = 0;
  do {
    const budget = new RequestReadLedger();
    const result = await t.run(ctx => readPostGrid(ctx, { query, limit: 2, cursor }, scope, "document", budget));
    expect(budget.documents).toBeLessThan(60);
    expect(JSON.stringify(result)).not.toContain("Private source body");
    seen.push(...result.items.map(item => item.id)); cursor = result.nextCursor;
    if (++pages > 10) throw Error("Pagination did not converge");
  } while (cursor);
  expect(new Set(seen).size).toBe(7); expect(new Set(seen)).toEqual(new Set(ids.posts));
  expect(seen.slice(0, 3)).toEqual([ids.posts[6], ids.posts[5], ids.posts[4]]);
});
test("multiple independent grids can resolve in one query transaction and intersect category/tag", async () => {
  const { t, ids } = await fixture();
  const [a, b] = await t.run(async ctx => [
    await readPostGrid(ctx, { query: { category: ids.category }, limit: 2 }, scope, "document"),
    await readPostGrid(ctx, { query: { category: ids.category, tag: ids.tag }, limit: 4, showExcerpt: false }, scope, "document"),
  ]);
  expect(a.items.map(item => item.id)).toEqual([ids.posts[6], ids.posts[5]]);
  expect(new Set(b.items.map(item => item.id))).toEqual(new Set(ids.posts.filter((_, index) => index % 2 === 0)));
  expect(b.items.every(item => item.excerpt === null)).toBe(true); expect(b.nextCursor).toBeNull();
});
test("duplicate imported taxonomy pairs cannot repeat a post on a later page", async () => {
  const { t, ids } = await fixture();
  await t.run(async ctx => {
    for (let i = 0; i < 3; i++) {
      const id = await ctx.db.insert("termRelationships", { postId: ids.posts[6], termId: ids.category, order: i });
      await refreshTermDiscovery(ctx, id);
    }
  });
  let cursor: string | null = null; const seen: string[] = [];
  for (let page = 0; page < 12; page++) {
    const result = await t.run(ctx => readPostGrid(ctx, { query: { category: ids.category }, limit: 1, cursor }, scope, "document"));
    seen.push(...result.items.map(item => item.id)); cursor = result.nextCursor;
    if (cursor === null) break;
  }
  expect(cursor).toBeNull(); expect(seen).toHaveLength(7); expect(new Set(seen)).toEqual(new Set(ids.posts));
});
test("cursors cannot switch query, page, installation or escape the chosen index range", async () => {
  const { t, ids } = await fixture();
  const query = { category: ids.category }, first = await t.run(ctx => readPostGrid(ctx, { query, limit: 1 }, scope, "document"));
  expect(first.nextCursor).not.toBeNull();
  for (const [args, targetScope, doc] of [
    [{ query, limit: 2, cursor: first.nextCursor }, scope, "document"],
    [{ query, limit: 1, cursor: first.nextCursor }, { ...scope, instanceKey: "other" }, "document"],
    [{ query, limit: 1, cursor: first.nextCursor }, scope, "another"],
  ] as const) await expect(t.run(ctx => readPostGrid(ctx, args, targetScope, doc))).rejects.toThrow("another document");
  const tampered = JSON.parse(first.nextCursor!); tampered.key[0] = ids.tag;
  await expect(t.run(ctx => readPostGrid(ctx, { query, limit: 1, cursor: JSON.stringify(tampered) }, scope, "document"))).rejects.toThrow("outside the selected");
  const wrongType = JSON.parse(first.nextCursor!); wrongType.key[wrongType.key.length - 3] = "timestamp";
  await expect(t.run(ctx => readPostGrid(ctx, { query, limit: 1, cursor: JSON.stringify(wrongType) }, scope, "document"))).rejects.toThrow("invalid index coordinates");
  const budget = new RequestReadLedger();
  await expect(t.run(ctx => readPostGrid(ctx, { limit: 1.2 }, scope, "document", budget))).rejects.toThrow(); expect(budget.queries).toBe(0);
});
test("unprepared taxonomy indexes refuse partial results and current private/draft sources cannot become cards", async () => {
  const { t, ids } = await fixture();
  const legacy = await t.run(ctx => ctx.db.insert("termRelationships", { postId: ids.posts[0], termId: ids.category }));
  const read = () => t.run(ctx => readPostGrid(ctx, { query: { category: ids.category }, limit: 20 }, scope, "document"));
  await expect(read()).rejects.toThrow("still being prepared");
  await t.run(ctx => refreshTermDiscovery(ctx, legacy));
  await t.run(async ctx => {
    const roleId = await ctx.db.insert("roles", {name:"Editor",slug:"editor",description:"Fixture",level:80,type:"internal",status:"active",isDefault:false,isProtected:false,capabilities:["post.update","post.publish"],pageAccess:[],createdAt:1,updatedAt:1});
    await ctx.db.patch(ids.user,{roleId});
    await ctx.db.insert("convexpress_siteIdentity",{identityKey:"site-identity",websiteKey:"site",instanceKey:"stage",environmentKind:"staging",deploymentOrigin:"https://fixture.convex.cloud",managementOrigin:"https://fixture.convex.site",siteOrigin:"https://fixture.example.invalid",siteContractVersion:"1",schemaVersion:"1",engineVersion:"1",managementCapabilities:[],initializedAt:1,updatedAt:1});
    await ctx.db.insert("settings",{section:"appearance.template",values:{active:"core",overrides:{},variants:{},settings:{}},legacyAppearanceMigration:{version:2,migratedAt:1},updatedAt:1,updatedBy:ids.user});
  });
  const editor=t.withIdentity({subject:ids.user,tokenIdentifier:`https://convexpress-admin.local|${ids.user}`});
  const publish=makeFunctionReference<"mutation">("canonicalDocuments:setPublication");
  await editor.mutation(publish,{postId:ids.posts[6],expectedRevision:1,status:"private"});
  await editor.mutation(publish,{postId:ids.posts[5],expectedRevision:1,status:"draft"});
  // Even an external write that bypasses source maintenance cannot expose private content.
  await t.run(ctx => ctx.db.patch("posts", ids.posts[4], { visibility: "private" }));
  const result = await read();
  expect(new Set(result.items.map(item => item.id))).toEqual(new Set(ids.posts.slice(0, 4)));
  expect(result.items).toHaveLength(4);
});
test("resource and route membership restrictions are evaluated again after access is revoked", async () => {
  const { t, ids } = await fixture();
  const grant = await t.run(async ctx => {
    const setting = await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique();
    await ctx.db.patch("settings", setting!._id, { values: { membershipEnabled: true } });
    const plan = await ctx.db.insert("membership_plans", { title: "Readers", slug: "readers", status: "active", grantMode: "manual", priority: 1, createdAt: 1, updatedAt: 1 });
    for (const target of [{ resourceType: "post", resourceIdOrKey: ids.posts[6] }, { resourceType: "route", resourceIdOrKey: "/blog/story-5" }])
      await ctx.db.insert("membership_restriction_rules", { ...target, ruleMode: "allow_only", planIds: [plan], teaserMode: "excerpt", loginRequired: true, createdAt: 1, updatedAt: 1 });
    return ctx.db.insert("membership_grants", { userId: ids.user, planId: plan, sourceType: "manual", status: "active", startsAt: 1, createdAt: 1, updatedAt: 1 });
  });
  const args = { query: { category: ids.category }, limit: 2 };
  expect((await t.run(ctx => readPostGrid(ctx, args, scope, "document"))).items.map(item => item.id)).not.toContain(ids.posts[6]);
  const member = t.withIdentity({ subject: ids.user, tokenIdentifier: `https://convexpress-admin.local|${ids.user}` });
  expect((await member.run(ctx => readPostGrid(ctx, args, scope, "document"))).items.map(item => item.id)).toEqual([ids.posts[6], ids.posts[5]]);
  await t.run(ctx => ctx.db.patch("membership_grants", grant, { status: "revoked" }));
  const revoked = await member.run(ctx => readPostGrid(ctx, args, scope, "document"));
  expect(revoked.items.map(item => item.id)).not.toContain(ids.posts[6]);
  expect(revoked.items.map(item => item.id)).not.toContain(ids.posts[5]);
});
