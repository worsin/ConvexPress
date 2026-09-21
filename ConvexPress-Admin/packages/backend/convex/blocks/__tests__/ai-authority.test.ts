import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference as ref } from "convex/server";
import schema from "../../schema";
const modules = {
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/blocks/queries.ts": () => import("../queries"),
  "./convex/blocks/mutations.ts": () => import("../mutations"),
};
test("AI authority uses the actual current role and owner checks at read and commit", async () => {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const role = await ctx.db.insert("roles", { name: "Author", slug: "author", type: "internal", description: "Fixture", level: 10, isDefault: false, isProtected: false, capabilities: ["page.update", "post.update"], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
    const fields = { authSource: "local" as const, emailVerified: true, status: "active" as const, roleId: role, createdAt: 1, updatedAt: 1 };
    const owner = await ctx.db.insert("users", { ...fields, email: "owner@example.invalid" }), other = await ctx.db.insert("users", { ...fields, email: "other@example.invalid" });
    const post = await ctx.db.insert("posts", { type: "page", title: "AI authority", slug: "ai-authority", content: "", status: "draft", visibility: "public", authorId: owner, commentStatus: "closed", blocks: [], blocksRevision: 0, createdAt: 1, updatedAt: 1 });
    return { role, owner, other, post };
  });
  const actor = (id: string) => t.withIdentity({ subject: id, tokenIdentifier: `https://convexpress-admin.local|${id}` });
  const owner = actor(ids.owner), other = actor(ids.other), read = ref<"query">("blocks/queries:getEditableDocumentForAi");
  for (const client of [t, owner, other]) await expect(client.query(read, { postId: ids.post })).rejects.toThrow();
  await t.run(ctx => ctx.db.patch("roles", ids.role, { capabilities: ["blocks.ai", "page.update", "post.update"] }));
  expect((await owner.query(read, { postId: ids.post })).title).toBe("AI authority");
  await expect(other.query(read, { postId: ids.post })).rejects.toThrow();
  // Simulate the provider interval. Read permission alone must not authorize a later write.
  await t.run(ctx => ctx.db.patch("roles", ids.role, { capabilities: ["page.update", "post.update"] }));
  await expect(owner.mutation(ref("blocks/mutations:replaceBlocksFromAi"), { postId: ids.post, expectedRevision: 0, blocks: [] })).rejects.toThrow();
  await expect(owner.mutation(ref("blocks/mutations:updateBlockAttrsFromAi"), { postId: ids.post, expectedRevision: 0, blockId: "one", attrs: {} })).rejects.toThrow();
  const post = await t.run(ctx => ctx.db.get("posts", ids.post));expect(post!.blocksRevision).toBe(0);expect(post!.blocks).toEqual([]);
});
