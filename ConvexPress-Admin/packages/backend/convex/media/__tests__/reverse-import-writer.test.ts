import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { internal } from "../../_generated/api";
const modules = {
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/wordpressSync/internals.ts": () => import("../../wordpressSync/internals"),
};

test("actual WordPress relationship repair validates table identity and propagates missing attachment failures", async () => {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { email: "import@example.invalid", emailVerified: true, authSource: "local", status: "active", createdAt: 1, updatedAt: 1 });
    const postId = await ctx.db.insert("posts", { title: "Imported", slug: "imported", type: "post", status: "draft", visibility: "public", authorId: userId, commentStatus: "closed", createdAt: 1, updatedAt: 1 });
    const mediaId = await ctx.db.insert("media", { title: "Removed", slug: "removed", fileName: "removed.png", url: "https://example.invalid/removed", mimeType: "image/png", fileSize: 10, mediaType: "image", status: "active", uploadedBy: userId, createdAt: 1, updatedAt: 1 });
    await ctx.db.delete("media", mediaId);
    return { postId, mediaId };
  });
  await expect(t.mutation(internal.wordpressSync.internals.patchEntity, { table: "users", id: ids.postId, fields: { title: "Wrong table" } })).rejects.toThrow("does not belong");
  await expect(t.mutation(internal.wordpressSync.internals.patchEntity, { table: "posts", id: ids.postId, fields: { featuredImageId: ids.mediaId } })).rejects.toThrow("missing or unavailable");
  const post = await t.run(ctx => ctx.db.get("posts", ids.postId));
  expect(post?.title).toBe("Imported"); expect(post?.featuredImageId).toBeUndefined();
  await t.run(ctx => ctx.db.delete("posts", ids.postId));
  await t.mutation(internal.wordpressSync.internals.patchEntity, { table: "posts", id: ids.postId, fields: { featuredImageId: ids.mediaId } });
  expect(await t.run(ctx => ctx.db.get("posts", ids.postId))).toBeNull();
});
