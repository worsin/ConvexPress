import { expect, test } from "bun:test";
import { fixture, create, save, withdraw, reference, text } from "./fixture.test-support";
import { syncDocumentContactForms } from "../../canonicalDocuments/contactDocuments";
import { validateCanonicalTree } from "../../canonicalDocuments/foundation/generated/instances";

async function setup() {
  const f = await fixture();
  const child = await f.operator.mutation(create, { title: "Child", blocks: text });await f.release(child.id, 1, 1);
  const parent = await f.operator.mutation(create, { title: "Parent", blocks: reference(child.id) });await f.release(parent.id, 1, 1);
  const blocks = validateCanonicalTree([{ ...reference(parent.id)[0], id: "latest" }, { ...reference(parent.id, 1)[0], id: "pinned" }]);
  const postId = await f.t.run(ctx => ctx.db.insert("posts", { type: "page", title: "Studio", slug: "studio", status: "draft", visibility: "public", authorId: f.ids.user, commentStatus: "closed", blocksVersion: 2, blocks, createdAt: 1, updatedAt: 1 }));
  const reconcile = (candidate: unknown = blocks) => f.operator.run(ctx => syncDocumentContactForms(ctx, { postId, title: "Studio", blocks: validateCanonicalTree(candidate) }));
  const rows = () => f.t.run(ctx => ctx.db.query("syncedBlockConsumers").withIndex("by_document", q => q.eq("postId", postId)).take(20));
  return { ...f, parent, child, blocks, postId, reconcile, rows };
}

test("contact-free reusable content records unique nested consumer edges and no-op saves preserve them", async () => {
  const f = await setup();await f.reconcile();const rows = await f.rows();
  expect(rows).toHaveLength(2);expect(rows.map(row => row.sourceId).sort()).toEqual([f.parent.id, f.child.id].sort());
  expect(rows.every(row => row.websiteKey === "synced" && row.instanceKey === "staging" && row.deploymentOrigin === "https://synced.convex.cloud")).toBe(true);
  await f.reconcile();expect(await f.rows()).toEqual(rows);
  await f.t.run(ctx => syncDocumentContactForms(ctx, { postId: f.postId, title: "Studio", blocks: f.blocks, scheduled: true }));
  expect(await f.rows()).toEqual(rows);
  expect(await f.t.run(ctx => ctx.db.query("forms").take(1))).toEqual([]);
});

test("latest and pinned graphs retain their union while edited and removed references clean up exact edges", async () => {
  const f = await setup();await f.reconcile();
  const replacement = await f.operator.mutation(create, { title: "Replacement", blocks: text });await f.release(replacement.id, 1, 1);
  await f.operator.mutation(save, { id: f.parent.id, expectedGeneration: 2, title: "Parent", blocks: reference(replacement.id) });await f.release(f.parent.id, 3, 2);
  await f.reconcile();expect((await f.rows()).map(row => row.sourceId).sort()).toEqual([f.parent.id, f.child.id, replacement.id].sort());
  await f.reconcile(reference(f.parent.id));expect((await f.rows()).map(row => row.sourceId).sort()).toEqual([f.parent.id, replacement.id].sort());
  await f.reconcile([]);expect(await f.rows()).toEqual([]);
});

test("withdrawn sources remain discoverable for republishing without retaining unreachable descendants", async () => {
  const f = await setup();await f.reconcile();
  await f.operator.mutation(withdraw, { id: f.child.id, expectedGeneration: 2 });await f.reconcile();
  expect((await f.rows()).map(row => row.sourceId).sort()).toEqual([f.parent.id, f.child.id].sort());
  await f.operator.mutation(withdraw, { id: f.parent.id, expectedGeneration: 2 });await f.reconcile();
  expect((await f.rows()).map(row => row.sourceId)).toEqual([f.parent.id]);
  await f.release(f.child.id, 3, 1);await f.release(f.parent.id, 3, 1);await f.reconcile();
  expect((await f.rows()).map(row => row.sourceId).sort()).toEqual([f.parent.id, f.child.id].sort());
});

test("foreign installation heads create no edges and scheduled execution cannot repair missing dependency evidence", async () => {
  const f = await setup();
  await expect(f.t.run(ctx => syncDocumentContactForms(ctx, { postId: f.postId, title: "Studio", blocks: f.blocks, scheduled: true }))).rejects.toThrow("Save this document again");
  expect(await f.rows()).toEqual([]);
  await f.reconcile();
  await f.t.run(ctx => ctx.db.patch("convexpress_siteIdentity", f.ids.site, { instanceKey: "different-environment" }));
  await f.reconcile();expect(await f.rows()).toEqual([]);
});

test("one source can discover multiple consumer pages through its scoped index", async () => {
  const f = await setup();await f.reconcile();
  const copy = await f.t.run(async ctx => {
    const source = (await ctx.db.get("posts", f.postId))!;
    const { _id, _creationTime, ...value } = source;
    return ctx.db.insert("posts", { ...value, slug: "copy" });
  });
  await f.operator.run(ctx => syncDocumentContactForms(ctx, { postId: copy, title: "Copy", blocks: f.blocks }));
  const consumers = await f.t.run(ctx => ctx.db.query("syncedBlockConsumers").withIndex("by_source_scope", q => q.eq("sourceId", f.child.id).eq("websiteKey", "synced").eq("instanceKey", "staging").eq("deploymentOrigin", "https://synced.convex.cloud")).take(10));
  expect(consumers.map(row => row.postId).sort()).toEqual([f.postId, copy].sort());
  await f.reconcile([]);expect((await f.t.run(ctx => ctx.db.query("syncedBlockConsumers").withIndex("by_document", q => q.eq("postId", copy)).take(10)))).toHaveLength(2);
});

test("dependency overflow refuses atomically instead of accepting a truncated consumer list", async () => {
  const f = await setup();
  await f.t.run(async ctx => {
    for (let i = 0; i < 9; i++) await ctx.db.insert("syncedBlockConsumers", { postId: f.postId, sourceId: f.parent.id, websiteKey: "synced", instanceKey: "staging", deploymentOrigin: "https://synced.convex.cloud" });
  });
  const before = await f.rows();
  await expect(f.operator.run(async ctx => {
    await ctx.db.patch("posts", f.postId, { title: "Must roll back" });
    await syncDocumentContactForms(ctx, { postId: f.postId, title: "Must roll back", blocks: f.blocks });
  })).rejects.toThrow("Saved reusable dependencies exceed");
  expect(await f.rows()).toEqual(before);
  expect((await f.t.run(ctx => ctx.db.get("posts", f.postId)))!.title).toBe("Studio");
});

test("bounded duplicate edges are repaired without changing the retained canonical edge", async () => {
  const f = await setup();await f.reconcile();const before = await f.rows();
  await f.t.run(async ctx => {
    const { _id, _creationTime, ...value } = before[0];await ctx.db.insert("syncedBlockConsumers", value);
  });
  await f.reconcile();expect(await f.rows()).toEqual(before);
});
