import { expect, test } from "bun:test";
import type { Id } from "../../_generated/dataModel";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";
import { applyReferenceClear, prepareReferenceClear, type MediaReference } from "../references";

const target = "m1" as Id<"media">;
const ref = (table: MediaReference["table"], documentId: string, field: string, path: string): MediaReference =>
  ({ table, documentId, field, path, mediaId: target, opaque: false });

test("force clear removes root, nested-object and array references per table and keeps siblings", async () => {
  const ctx = commerceHarness({
    media: [{ _id: "m1", status: "active" }, { _id: "m2", status: "active" }],
    posts: [{ _id: "p", type: "post", featuredImageId: "m1", hero: { imageId: "m1", title: "Hero" }, topics: [{ imageId: "m2" }, { imageId: "m1", title: "Topic" }], updatedAt: 1 }],
    commerce_product_variants: [{ _id: "v", galleryMediaIds: ["m1", "m2", "m1"] }],
  });
  const plan = await prepareReferenceClear(ctx, [
    ref("posts", "p", "featuredImageId", "featuredImageId"),
    ref("posts", "p", "hero.imageId", "hero.imageId"),
    ref("posts", "p", "topics.*.imageId", "topics.1.imageId"),
    ref("commerce_product_variants", "v", "galleryMediaIds.*", "galleryMediaIds.0"),
    ref("commerce_product_variants", "v", "galleryMediaIds.*", "galleryMediaIds.2"),
  ]);
  expect(plan.writes.map(write => write.table)).toEqual(["posts", "commerce_product_variants"]);
  await applyReferenceClear(ctx, plan);
  const [post] = ctx.tables.posts;
  expect(post.featuredImageId).toBeUndefined();
  expect(post.hero).toEqual({ title: "Hero" });
  expect(post.topics).toEqual([{ imageId: "m2" }, { title: "Topic" }]);
  expect(post.updatedAt).toBeGreaterThan(1);
  expect(ctx.tables.commerce_product_variants[0].galleryMediaIds).toEqual(["m2"]);
});

test("a reference whose path no longer resolves to the media item is refused before any write", async () => {
  const ctx = commerceHarness({ media: [{ _id: "m1", status: "active" }], posts: [{ _id: "p", type: "post", hero: { imageId: "other" } }] });
  await expect(prepareReferenceClear(ctx, [ref("posts", "p", "hero.imageId", "hero.imageId")])).rejects.toMatchObject({ data: { code: "MEDIA_REFERENCE_UNCLEARABLE" } });
  expect(ctx.tables.posts[0].hero).toEqual({ imageId: "other" });
});
