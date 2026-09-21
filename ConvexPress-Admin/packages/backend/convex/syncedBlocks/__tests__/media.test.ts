import { expect, test } from "bun:test";
import { makeFunctionReference as ref } from "convex/server";
import { fixture, create, save, get, withdraw, reference, review, publish } from "./fixture.test-support";
import { MEDIA_REVERSE_EPOCH_VARIABLE } from "../../media/reverseIndexVersion";
import { findMediaReferences } from "../../media/references";
import { referenceTables } from "../../media/referenceScan";
const restore = ref<"mutation">("syncedBlocks/content:restore"), remove = ref<"mutation">("media/mutations:remove");
const image = (id: string) => [{ id: "picture", name: "core/image", version: 2, attrs: { mediaId: id } }];
async function setup() {
  const f = await fixture();
  const media = await f.t.run(async ctx => {
    const role = (await ctx.db.get("roles", f.ids.role))!;
    await ctx.db.patch("roles", role._id, { level: 80, capabilities: [...role.capabilities, "media.delete", "manage_options", "post.restore"] });
    return ctx.db.insert("media", { title: "Studio photograph", fileName: "studio.jpg", slug: "studio", url: "https://example.invalid/studio.jpg", mimeType: "image/jpeg", fileSize: 128, mediaType: "image", status: "active", uploadedBy: f.ids.user, createdAt: 1, updatedAt: 1 });
  });
  return { ...f, media };
}
test("source create, save and restore refuse missing or unavailable declared media without advancing history", async () => {
  const f = await setup();
  await expect(f.operator.mutation(create, { title: "Bad image", blocks: image("not-a-media-id") })).rejects.toThrow();
  expect(await f.t.run(ctx => ctx.db.query("syncedBlocks").take(10))).toEqual([]);
  const source = await f.operator.mutation(create, { title: "Studio", blocks: image(f.media) });
  await f.t.run(ctx => ctx.db.patch("media", f.media, { status: "trashed" }));
  await expect(f.operator.mutation(save, { id: source.id, expectedGeneration: 1, title: "Studio", blocks: image(f.media) })).rejects.toThrow("unavailable");
  await expect(f.operator.mutation(restore, { id: source.id, expectedGeneration: 1, revision: 1, expectedDigest: source.digest })).rejects.toThrow("unavailable");
  await expect(f.operator.mutation(save, { id: source.id, expectedGeneration: 1, title: "Changed", blocks: image(f.media) })).rejects.toThrow("unavailable");
  expect((await f.operator.query(get, { id: source.id })).generation).toBe(1);
  await f.operator.mutation(save, { id: source.id, expectedGeneration: 1, title: "No photograph", blocks: [] });
  await expect(f.operator.mutation(restore, { id: source.id, expectedGeneration: 2, revision: 1, expectedDigest: source.digest })).rejects.toThrow("unavailable");
  expect((await f.operator.query(get, { id: source.id })).generation).toBe(2);
  expect(await f.t.run(ctx => ctx.db.query("syncedBlockRevisions").take(10))).toHaveLength(2);
});

test("published and withdrawn immutable revisions keep media protected after the newest draft removes it", async () => {
  const f = await setup();
  const source = await f.operator.mutation(create, { title: "Studio", blocks: image(f.media) });
  await f.release(source.id, 1, 1);
  await f.operator.mutation(save, { id: source.id, expectedGeneration: 2, title: "Without image", blocks: [] });
  await f.operator.mutation(withdraw, { id: source.id, expectedGeneration: 3 });
  const references = await f.t.run(ctx => findMediaReferences(ctx, f.media));
  expect(references).toContainEqual(expect.objectContaining({ table: "syncedBlockRevisions", opaque: true, mediaId: f.media }));
  await expect(f.operator.mutation(remove, { mediaId: f.media })).rejects.toThrow("This media is referenced");
  await expect(f.operator.mutation(remove, { mediaId: f.media, force: true })).rejects.toThrow("cannot be safely cleared");
  expect((await f.t.run(ctx => ctx.db.get("media", f.media)))?.status).toBe("active");
  expect((await f.operator.query(get, { id: source.id })).publishedRevision).toBeNull();
});

test("shared publication checks media in the complete nested graph without publishing a broken source", async () => {
  const f = await setup();
  const inner = await f.operator.mutation(create, { title: "Image", blocks: image(f.media) });await f.release(inner.id, 1, 1);
  const outer = await f.operator.mutation(create, { title: "Outer", blocks: reference(inner.id) });
  await f.t.run(ctx => ctx.db.patch("media", f.media, { status: "trashed" }));
  await expect(f.release(outer.id, 1, 1)).rejects.toThrow("unavailable");
  expect((await f.operator.query(get, { id: outer.id })).publishedRevision).toBeNull();
});

test("publication rechecks media availability after a successful review", async () => {
  const f = await setup();
  const source = await f.operator.mutation(create, { title: "Studio", blocks: image(f.media) });
  const selection = { id: source.id, expectedGeneration: 1, revision: 1 };
  const checked = await f.operator.query(review, selection);
  // Simulate an asset becoming unavailable between review and publication.
  await f.t.run(ctx => ctx.db.patch("media", f.media, { status: "failed" }));
  await expect(f.operator.mutation(publish, { ...selection, reviewDigest: checked.digest })).rejects.toThrow("unavailable");
  const current = await f.operator.query(get, { id: source.id });
  expect(current.generation).toBe(1);
  expect(current.publishedRevision).toBeNull();
});

test("normal backfill recovers pre-upgrade reusable revisions and new writes maintain exact owner edges", async () => {
  const previous = process.env[MEDIA_REVERSE_EPOCH_VARIABLE];
  process.env[MEDIA_REVERSE_EPOCH_VARIABLE] = "synced_media_fixture";
  try {
    const f = await setup(), source = await f.operator.mutation(create, { title: "Studio", blocks: image(f.media) });
    // Remove only infrastructure evidence to simulate a pre-upgrade revision.
    await f.t.run(async ctx => { for (const row of await ctx.db.query("media_reference_edges").take(20)) await ctx.db.delete("media_reference_edges", row._id); });
    let progress = await f.operator.mutation(ref<"mutation">("media/reverseBackfill:begin"), {});
    for (let step = 0; progress.status === "building" && step < 200; step++) progress = await f.operator.mutation(ref<"mutation">("media/reverseBackfill:step"), { generation: progress.generation, expectedSequence: progress.sequence });
    expect(progress.status).toBe("ready");expect(progress.completedOwners).toBe(referenceTables.length);
    expect((await f.t.run(ctx => findMediaReferences(ctx, f.media))).some(value => value.table === "syncedBlockRevisions")).toBe(true);
    await f.operator.mutation(save, { id: source.id, expectedGeneration: 1, title: "New title", blocks: image(f.media) });
    const edges = await f.t.run(ctx => ctx.db.query("media_reference_edges").take(20));
    expect(edges.filter(edge => edge.ownerTable === "syncedBlockRevisions")).toHaveLength(2);
    await expect(f.operator.mutation(remove, { mediaId: f.media, force: true })).rejects.toThrow("cannot be safely cleared");
  } finally { if (previous === undefined) delete process.env[MEDIA_REVERSE_EPOCH_VARIABLE];else process.env[MEDIA_REVERSE_EPOCH_VARIABLE] = previous; }
});
