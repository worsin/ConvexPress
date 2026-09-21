import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { insertTermRelationship, refreshTermDiscovery, syncPostDiscovery } from "../../helpers/postDiscovery";
import { insertWithMediaReferences, patchWithMediaReferences, replaceWithMediaReferences, deleteWithMediaReferences, patchDynamicWithMediaReferences, insertDynamicWithMediaReferences } from "../../media/attachmentGuard";
import { recover } from "../discovery";
import { write } from "../../contentPromotion/shared";

const modules = { "./convex/_generated/server.js": () => import("../../_generated/server.js"), "./convex/_generated/api.js": () => import("../../_generated/api.js") };
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const author = await insertWithMediaReferences(ctx, "users", { email: "editor@example.invalid", emailVerified: true, authSource: "local", status: "active", createdAt: 1, updatedAt: 1 });
    const other = await insertWithMediaReferences(ctx, "users", { email: "other@example.invalid", emailVerified: true, authSource: "local", status: "active", createdAt: 1, updatedAt: 1 });
    const term = await ctx.db.insert("terms", { name: "Field", slug: "field", taxonomy: "category", count: 0, isDefault: false, createdAt: 1, updatedAt: 1 });
    const post = await insertWithMediaReferences(ctx, "posts", { type: "post", title: "Article", slug: "article", authorId: author, status: "publish", visibility: "public", publishedAt: 100, commentStatus: "closed", createdAt: 1, updatedAt: 1 });
    return { author, other, term, post };
  });
  return { t, ids };
}
test("indexed taxonomy discovery follows publication, author and deletion in the source transaction", async () => {
  const { t, ids } = await fixture();
  const relationship = await t.run(ctx => insertTermRelationship(ctx, { postId: ids.post, termId: ids.term }));
  const listed = () => t.run(ctx => ctx.db.query("termRelationships").withIndex("by_term_discovery_published", q => q.eq("termId", ids.term).eq("discoveryEligible", true)).order("desc").take(10));
  expect((await listed())[0]).toMatchObject({ discoveryReady: true, discoveryPublishedAt: 100, discoveryAuthorId: ids.author });
  await t.run(ctx => patchWithMediaReferences(ctx, "posts", ids.post, { authorId: ids.other, publishedAt: 200 }));
  expect((await listed())[0]).toMatchObject({ discoveryPublishedAt: 200, discoveryAuthorId: ids.other });
  for (const patch of [{ status: "draft" as const }, { status: "publish" as const, visibility: "private" as const }, { visibility: "password" as const }, { visibility: "public" as const, type: "page" as const }]) {
    await t.run(ctx => patchWithMediaReferences(ctx, "posts", ids.post, patch));
    expect(await listed()).toEqual([]);
  }
  await t.run(async ctx => {
    const row = await ctx.db.get(ids.post); if (!row) throw Error("missing");
    const { _id, _creationTime, ...value } = row;
    await replaceWithMediaReferences(ctx, "posts", ids.post, { ...value, type: "post", visibility: "public" });
  });
  expect(await listed()).toHaveLength(1);
  await expect(t.run(async ctx => { await patchWithMediaReferences(ctx, "posts", ids.post, { status: "draft" }); throw Error("abort"); })).rejects.toThrow("abort");
  expect(await listed()).toHaveLength(1);
  await t.run(ctx => deleteWithMediaReferences(ctx, "posts", ids.post));
  expect(await listed()).toEqual([]);
  expect(await t.run(ctx => ctx.db.get(relationship))).toMatchObject({ discoveryReady: true, discoveryEligible: false });
});
test("promotion and dynamic relationship boundaries derive source coordinates instead of trusting copied metadata", async () => {
  const { t, ids } = await fixture();
  const relation = await t.run(ctx => write(ctx, "termRelationship", null, { postId: ids.post, termId: ids.term }));
  expect(await t.run(ctx => ctx.db.get(relation as any))).toMatchObject({ discoveryReady: true, discoveryPublishedAt: 100 });
  await t.run(ctx => write(ctx, "post", ids.post, { publishedAt: 500 }));
  expect(await t.run(ctx => ctx.db.get(relation as any))).toMatchObject({ discoveryPublishedAt: 500 });
  const draft = await t.run(ctx => write(ctx, "post", null, { type: "post", title: "Draft", slug: "draft", authorId: ids.other, status: "draft", visibility: "public", commentStatus: "closed", createdAt: 1, updatedAt: 1 }));
  await t.run(ctx => patchDynamicWithMediaReferences(ctx, relation, { postId: draft, discoveryEligible: true, discoveryPublishedAt: 999 }));
  expect(await t.run(ctx => ctx.db.get(relation as any))).toMatchObject({ discoveryEligible: false, discoveryAuthorId: ids.other });
  const imported = await t.run(ctx => insertDynamicWithMediaReferences(ctx, "termRelationships", { postId: ids.post, termId: ids.term, discoveryReady: false, discoveryEligible: false }));
  expect(await t.run(ctx => ctx.db.get(imported as any))).toMatchObject({ discoveryReady: true, discoveryEligible: true, discoveryPublishedAt: 500 });
});
test("legacy recovery is bounded, resumable after lost scheduling, and re-reads current source", async () => {
  const { t, ids } = await fixture();
  await t.run(async ctx => { for (let i = 0; i < 13; i++) await ctx.db.insert("termRelationships", { postId: ids.post, termId: ids.term, order: i }); });
  let calls = 0;
  const run = () => t.run(ctx => (recover as any)._handler({ ...ctx, scheduler: { runAfter: async () => { calls++; } } }, {}));
  const pending = () => t.run(ctx => ctx.db.query("termRelationships").withIndex("by_discovery_ready", q => q.eq("discoveryReady", undefined)).take(20));
  await run(); expect(await pending()).toHaveLength(9); expect(calls).toBe(1);
  await run(); expect(await pending()).toHaveLength(5); expect(calls).toBe(2);
  await t.run(ctx => patchWithMediaReferences(ctx, "posts", ids.post, { publishedAt: 700 }));
  expect(await pending()).toHaveLength(0);
  await run(); expect(calls).toBe(2);
  const rows = await t.run(ctx => ctx.db.query("termRelationships").withIndex("by_term_discovery_published", q => q.eq("termId", ids.term).eq("discoveryEligible", true)).take(20));
  expect(rows).toHaveLength(13); expect(rows.every(row => row.discoveryPublishedAt === 700)).toBe(true);
  // A deleted source can still have legacy orphan rows; those must never become candidates.
  await t.run(ctx => deleteWithMediaReferences(ctx, "posts", ids.post));
  const orphan = await t.run(ctx => ctx.db.insert("termRelationships", { postId: ids.post, termId: ids.term }));
  await run(); expect(await t.run(ctx => ctx.db.get(orphan))).toMatchObject({ discoveryReady: true, discoveryEligible: false });
  const explicitPending = await t.run(ctx => ctx.db.insert("termRelationships", { postId: ids.post, termId: ids.term, discoveryReady: false }));
  await run(); expect(await t.run(ctx => ctx.db.get(explicitPending))).toMatchObject({ discoveryReady: true, discoveryEligible: false });
});
test("publication refuses an oversized taxonomy fanout atomically, without leaving partially updated coordinates", async () => {
  const { t, ids } = await fixture();
  await t.run(async ctx => { for (let i = 0; i < 257; i++) await ctx.db.insert("termRelationships", { postId: ids.post, termId: ids.term, order: i }); });
  await expect(t.run(ctx => patchWithMediaReferences(ctx, "posts", ids.post, { status: "draft" }))).rejects.toThrow("256 taxonomy assignments");
  expect(await t.run(ctx => ctx.db.get(ids.post))).toMatchObject({ status: "publish" });
  const row = await t.run(ctx => ctx.db.query("termRelationships").first());
  expect(row?.discoveryReady).toBeUndefined();
});
