import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "../../_generated/api";
import schema from "../../schema";

const modules = {
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/posts/queries.ts": () => import("../queries"),
};

async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const roleId = await ctx.db.insert("roles", { name: "Editor", slug: "editor", description: "Fixture", level: 80, type: "internal", status: "active", isDefault: false, isProtected: false, capabilities: ["post.update"], pageAccess: [], createdAt: 1, updatedAt: 1 });
    const userId = await ctx.db.insert("users", { email: "list@example.test", emailVerified: true, status: "active", authSource: "local", roleId, createdAt: 1, updatedAt: 1 });
    const shared = { type: "post" as const, title: "Acceptance entry", content: "", authorId: userId, visibility: "private" as const, commentStatus: "closed" as const, createdAt: 1, updatedAt: 1 };
    const draftId = await ctx.db.insert("posts", { ...shared, slug: "draft", status: "draft" });
    const trashId = await ctx.db.insert("posts", { ...shared, slug: "trash", status: "trash", previousStatus: "draft", trashedAt: 2 });
    return { userId, draftId, trashId };
  });
  return { ...ids, editor: t.withIdentity({ subject: ids.userId, issuer: "https://convexpress-admin.local" }) };
}

for (const search of [undefined, "Acceptance"]) {
  test(`All and Mine exclude trash before pagination, including search=${Boolean(search)}`, async () => {
    const { editor, userId, draftId } = await fixture();
    const counts = await editor.query(api.posts.queries.counts, {});
    for (const authorId of [undefined, userId]) {
      const result = await editor.query(api.posts.queries.list, { search, authorId, perPage: 1 });
      expect(result.total).toBe(authorId ? counts.mine : counts.all);
      expect(result.total).toBe(1);
      expect(result.posts.map(p => p._id)).toEqual([draftId]);
      expect(result.totalPages).toBe(1);
    }
  });
  test(`Trash remains accessible explicitly, including search=${Boolean(search)}`, async () => {
    const { editor, trashId } = await fixture();
    const result = await editor.query(api.posts.queries.list, { search, status: "trash" });
    expect(result.total).toBe(1);
    expect(result.posts.map(p => p._id)).toEqual([trashId]);
  });
}
