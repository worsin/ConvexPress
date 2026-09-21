import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { insertWithMediaReferences, patchWithMediaReferences, replaceWithMediaReferences, deleteWithMediaReferences } from "../../media/attachmentGuard";
import { beginAuthorPostCountRepair, advanceAuthorPostCountRepair, type AuthorCountTask, type AuthorCountResult } from "../../helpers/authorPostCounts";
import * as jobs from "../authorCounts";

const modules = {
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
};
const account = (name: string) => ({ email: `${name}@example.invalid`, emailVerified: true,
  authSource: "local" as const, status: "active" as const, displayName: name, createdAt: 1, updatedAt: 1 });
const article = (authorId: any, title = "Post") => ({ authorId, type: "post" as const,
  title, slug: title.toLowerCase(), status: "publish" as const, visibility: "public" as const,
  commentStatus: "closed" as const, createdAt: 1, updatedAt: 1 });
async function apply(ctx: any, result: AuthorCountResult) {
  if (result.update) await patchWithMediaReferences(ctx, "users", result.update.authorId,
    { postCount: result.update.count, postCountReady: result.update.ready });
  return result.next;
}
async function runRepair(t: ReturnType<typeof convexTest>, task: AuthorCountTask | undefined) {
  let pages = 0;
  while (task) {
    if (++pages > 30) throw new Error("Repair failed to converge");
    const current = task;
    task = await t.run(async ctx => apply(ctx, await advanceAuthorPostCountRepair(ctx, current)));
  }
  return pages;
}

test("new users and every shared post-write operation maintain both authors atomically", async () => {
  const t = convexTest({ schema, modules });
  const a = await t.run(ctx => insertWithMediaReferences(ctx, "users", account("a")));
  const b = await t.run(ctx => insertWithMediaReferences(ctx, "users", account("b")));
  const count = (id: typeof a) => t.run(async ctx => (await ctx.db.get(id))?.postCount);
  expect(await count(a)).toBe(0);
  const post = await t.run(ctx => insertWithMediaReferences(ctx, "posts", article(a)));
  expect(await count(a)).toBe(1);
  await t.run(ctx => patchWithMediaReferences(ctx, "posts", post, { authorId: b }));
  expect(await count(a)).toBe(0); expect(await count(b)).toBe(1);
  const stateBefore = await t.run(ctx => ctx.db.query("authorPostCounts").withIndex("by_author", q => q.eq("authorId", b)).unique());
  await t.run(ctx => patchWithMediaReferences(ctx, "posts", post, { title: "Changed copy" }));
  expect(await t.run(ctx => ctx.db.get(stateBefore!._id))).toEqual(stateBefore);
  await t.run(ctx => patchWithMediaReferences(ctx, "posts", post, { status: "draft" }));
  expect(await count(b)).toBe(0);
  await t.run(ctx => patchWithMediaReferences(ctx, "posts", post, { status: "publish" }));
  expect(await count(b)).toBe(1);
  await t.run(ctx => replaceWithMediaReferences(ctx, "posts", post, { ...article(b), type: "page" }));
  expect(await count(b)).toBe(0);
  await t.run(ctx => replaceWithMediaReferences(ctx, "posts", post, article(b)));
  expect(await count(b)).toBe(1);
  await t.run(ctx => deleteWithMediaReferences(ctx, "posts", post));
  expect(await count(b)).toBe(0);
  await expect(t.run(async ctx => {
    await insertWithMediaReferences(ctx, "posts", article(a));
    throw new Error("Roll back source and count");
  })).rejects.toThrow("Roll back source and count");
  expect(await count(a)).toBe(0);
});

test("bounded repair ignores duplicate pages and restarts after concurrent reassignment or publication", async () => {
  const t = convexTest({ schema, modules });
  const { a, b, posts } = await t.run(async ctx => {
    const a = await ctx.db.insert("users", { ...account("legacy"), postCount: 999 });
    const b = await insertWithMediaReferences(ctx, "users", account("other"));
    const posts = [];
    for (let i = 0; i < 70; i++) posts.push(await ctx.db.insert("posts", { ...article(a, `post-${i}`), content: "x".repeat(30_000) }));
    await ctx.db.insert("posts", { ...article(a, "page"), type: "page" });
    await ctx.db.insert("posts", { ...article(a, "draft"), status: "draft" });
    return { a, b, posts };
  });
  const first = await t.run(async ctx => apply(ctx, await beginAuthorPostCountRepair(ctx, a)));
  expect((await t.run(ctx => ctx.db.get(a)))?.postCount).toBeUndefined();
  const next = await t.run(async ctx => apply(ctx, await advanceAuthorPostCountRepair(ctx, first!)));
  expect(next).toBeDefined();
  expect(await t.run(ctx => advanceAuthorPostCountRepair(ctx, first!))).toEqual({});
  expect(await t.run(ctx => advanceAuthorPostCountRepair(ctx, { ...next!, cursor: "out-of-order" }))).toEqual({});
  await t.run(async ctx => {
    await patchWithMediaReferences(ctx, "posts", posts[0]!, { status: "draft" });
    await patchWithMediaReferences(ctx, "posts", posts[69]!, { authorId: b });
    await insertWithMediaReferences(ctx, "posts", article(a, "new-post"));
  });
  const restarted = await t.run(async ctx => apply(ctx, await advanceAuthorPostCountRepair(ctx, next!)));
  expect(restarted?.generation).toBeGreaterThan(first!.generation);
  expect(restarted?.cursor).toBeNull();
  expect(await t.run(ctx => advanceAuthorPostCountRepair(ctx, next!))).toEqual({});
  expect(await runRepair(t, restarted)).toBeGreaterThan(1);
  expect(await t.run(ctx => ctx.db.get(a))).toMatchObject({ postCount: 69, postCountReady: true });
  expect(await t.run(ctx => ctx.db.get(b))).toMatchObject({ postCount: 1, postCountReady: true });
});

test("recovery resumes a stalled generation and never republishes a deleted author's total", async () => {
  const t = convexTest({ schema, modules });
  const a = await t.run(ctx => ctx.db.insert("users", account("stalled")));
  const first = await t.run(async ctx => apply(ctx, await beginAuthorPostCountRepair(ctx, a)));
  const resumed = await t.run(async ctx => apply(ctx, await beginAuthorPostCountRepair(ctx, a)));
  expect(resumed).toEqual(first);
  await t.run(ctx => deleteWithMediaReferences(ctx, "users", a));
  expect(await t.run(ctx => advanceAuthorPostCountRepair(ctx, resumed!))).toEqual({});
  expect(await t.run(ctx => ctx.db.query("authorPostCounts").withIndex("by_author", q => q.eq("authorId", a)).unique())).toBeNull();
});

test("registered sweep and page handlers repair legacy users and recover a lost continuation", async () => {
  const t = convexTest({ schema, modules });
  const a = await t.run(async ctx => {
    const id = await ctx.db.insert("users", { ...account("upgrade"), postCount: 800 });
    await ctx.db.insert("posts", article(id));
    return id;
  });
  const queued: AuthorCountTask[] = [];
  const context = (ctx: any) => ({ ...ctx, scheduler: { runAfter: async (_delay: number, _fn: unknown, task: AuthorCountTask) => { queued.push(task); return "scheduled"; } } });
  await t.run(ctx => (jobs.sweep as any)._handler(context(ctx), {}));
  expect(queued).toHaveLength(1);
  const task = queued.pop()!;
  await t.run(async ctx => {
    const state = await ctx.db.query("authorPostCounts").withIndex("by_author", q => q.eq("authorId", a)).unique();
    await ctx.db.patch(state!._id, { updatedAt: Date.now() - 120_000 });
  });
  await t.run(ctx => (jobs.sweep as any)._handler(context(ctx), {}));
  expect(queued.pop()).toEqual(task);
  await t.run(ctx => (jobs.page as any)._handler(context(ctx), task));
  expect(await t.run(ctx => ctx.db.get(a))).toMatchObject({ postCount: 1, postCountReady: true });
  await t.run(ctx => (jobs.page as any)._handler(context(ctx), task));
  expect(await t.run(ctx => ctx.db.get(a))).toMatchObject({ postCount: 1, postCountReady: true });
});
