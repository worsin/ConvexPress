import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { COMMENT_TREE_LEVELS } from "../treeContract";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/comments/queries.ts": () => import("../queries"),
};

interface ThreadNode {
  content: string;
  depth: number;
  replies: ThreadNode[];
}

/** A reply chain deeper than the transport carries, plus a second thread and a held comment. */
async function fixture(chainLength: number) {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const roleId = await ctx.db.insert("roles", { name: "Subscriber", slug: "subscriber", description: "Test", level: 1, type: "customer", isDefault: true, isProtected: false, capabilities: [], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
    const user = await ctx.db.insert("users", { authSource: "local", email: "comment-reader@example.invalid", emailVerified: true, roleId, status: "active", createdAt: 1, updatedAt: 1 });
    const post = await ctx.db.insert("posts", { type: "post", title: "Threaded", slug: "threaded", status: "publish", visibility: "public", authorId: user, commentStatus: "open", createdAt: 1, updatedAt: 1 });
    const draft = await ctx.db.insert("posts", { type: "post", title: "Draft", slug: "draft", status: "draft", visibility: "public", authorId: user, commentStatus: "open", createdAt: 1, updatedAt: 1 });
    const comment = (content: string, createdAt: number, depth: number, parentId?: Id<"comments">, status: "approved" | "pending" = "approved") =>
      ctx.db.insert("comments", { postId: post, content, status, authorId: user, authorName: "Reader", parentId, depth, likeCount: 0, flagCount: 0, isEdited: false, createdAt, updatedAt: createdAt });
    let parent: Id<"comments"> | undefined;
    for (let depth = 0; depth < chainLength; depth++) parent = await comment(`chain-${depth}`, 10 + depth, depth, parent);
    await comment("second-thread", 1000, 0);
    await comment("held", 1001, 0, undefined, "pending");
    return { post, draft };
  });
  return { t, ids };
}

test("forPost returns the threaded tree through its exact returns validator", async () => {
  const { t, ids } = await fixture(3);
  const result = await t.query(api.comments.queries.forPost, { postId: ids.post });
  expect(result.total).toBe(2);
  expect(result.totalPages).toBe(1);
  expect(result.commentStatus).toBe("open");
  const threads: ThreadNode[] = result.comments;
  expect(threads.map((node) => node.content)).toEqual(["chain-0", "second-thread"]);
  expect(threads[0].replies.map((node) => node.content)).toEqual(["chain-1"]);
  expect(threads[0].replies[0].replies.map((node) => node.content)).toEqual(["chain-2"]);
  expect(threads[0].replies[0].replies[0].replies).toEqual([]);
});

test("forPost lifts replies nested past the transport depth to the last level, keeping every comment", async () => {
  const chainLength = COMMENT_TREE_LEVELS + 2;
  const { t, ids } = await fixture(chainLength);
  const result = await t.query(api.comments.queries.forPost, { postId: ids.post });
  let level: ThreadNode[] = result.comments;
  for (let depth = 0; depth < COMMENT_TREE_LEVELS - 1; depth++) {
    expect(level[0].content).toBe(`chain-${depth}`);
    level = level[0].replies;
  }
  expect(level.map((node) => node.content)).toEqual(
    Array.from({ length: chainLength - (COMMENT_TREE_LEVELS - 1) }, (_, i) => `chain-${COMMENT_TREE_LEVELS - 1 + i}`),
  );
  expect(level.map((node) => node.depth)).toEqual(
    Array.from({ length: chainLength - (COMMENT_TREE_LEVELS - 1) }, (_, i) => COMMENT_TREE_LEVELS - 1 + i),
  );
  for (const node of level) expect(node.replies).toEqual([]);
});

test("forPost on an unpublished post returns an empty page without a comment status", async () => {
  const { t, ids } = await fixture(1);
  const result = await t.query(api.comments.queries.forPost, { postId: ids.draft });
  expect(result).toEqual({ comments: [], total: 0, page: 1, perPage: 50, totalPages: 0 });
});
