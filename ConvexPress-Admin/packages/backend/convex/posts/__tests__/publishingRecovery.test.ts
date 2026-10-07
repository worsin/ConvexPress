import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api, internal } from "../../_generated/api";
import schema from "../../schema";
import { replacePublicationSchedule } from "../../helpers/publicationSchedule";

const modules = {
  "./convex/posts/authorCounts.ts": () => import("../authorCounts"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/posts/mutations.ts": () => import("../mutations"),
  "./convex/pages/mutations.ts": () => import("../../pages/mutations"),
  "./convex/posts/internals.ts": () => import("../internals"),
  "./convex/revisions/internals.ts": () => import("../../revisions/internals"),
  "./convex/revisions/mutations.ts": () => import("../../revisions/mutations"),
};

async function fixture(scheduledAt: number) {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const roleId = await ctx.db.insert("roles", {
      name: "Editor", slug: "editor", description: "Fixture", level: 80,
      type: "internal", status: "active", isDefault: false, isProtected: true,
      capabilities: ["revision.restore", "post.update", "post.publish", "page.publish", "page.update"],
      pageAccess: [], createdAt: 1, updatedAt: 1,
    });
    const authorId = await ctx.db.insert("users", {
      email: "author@example.test", emailVerified: true, status: "active", authSource: "local", internalRole: "administrator",
      roleId,
      createdAt: 1, updatedAt: 1,
    });
    const postId = await ctx.db.insert("posts", {
      type: "post", title: "Original", slug: "original", content: "Legacy",
      visibility: "public", status: "future", authorId, commentStatus: "closed",
      scheduledAt, createdAt: 1, updatedAt: 1,
      contentMode: "blocks", blocks: [{ id: "one", name: "core/paragraph", version: 1, attrs: { text: "Prior block" } }],
      blocksVersion: 1, blocksRevision: 3,
    });
    return { authorId, postId };
  });
  return { t, ...ids };
}

describe("publishing recovery", () => {
  test("an old scheduled job cannot publish before the current deadline", async () => {
    const { t, postId } = await fixture(Date.now() + 3_600_000);
    await t.mutation(internal.posts.internals.publishScheduled, { postId });
    expect((await t.run((ctx) => ctx.db.get(postId)))?.status).toBe("future");
  });

  test("an unscheduled future record cannot be published by a stale job", async () => {
    const { t, postId } = await fixture(Date.now() - 1);
    await t.run((ctx) => ctx.db.patch(postId, { scheduledAt: undefined }));
    await t.mutation(internal.posts.internals.publishScheduled, { postId });
    expect((await t.run((ctx) => ctx.db.get(postId)))?.status).toBe("future");
  });

  test("block-only edits create a recoverable complete prior snapshot", async () => {
    const { t, postId, authorId } = await fixture(Date.now() + 60_000);
    const revisionId = await t.mutation(internal.revisions.internals.createOnSave, {
      parentId: postId, parentType: "post", title: "Original", content: "Legacy",
      authorId, changedFields: ["blocks"],
    });
    expect(revisionId).not.toBeNull();
    const revision = await t.run((ctx) => ctx.db.get(revisionId!));
    expect(revision).toMatchObject({
      contentMode: "blocks", blocksVersion: 1, blocksRevision: 3,
      blocks: [{ id: "one", name: "core/paragraph", version: 1, attrs: { text: "Prior block" } }],
    });
  });

  test("restoring a block revision restores the authoring mode and retains an undo snapshot", async () => {
    const { t, postId, authorId } = await fixture(Date.now() + 60_000);
    const revisionId = await t.mutation(internal.revisions.internals.createOnSave, {
      parentId: postId, parentType: "post", title: "Original", content: "Legacy",
      authorId, changedFields: ["blocks"],
    });
    await t.run((ctx) => ctx.db.patch(postId, {
      contentMode: "article", blocks: [], content: "New article", title: "Changed",
    }));
    const editor = t.withIdentity({ subject: authorId, issuer: "https://convexpress-admin.local", tokenIdentifier: `https://convexpress-admin.local|${authorId}` });
    await editor.mutation(api.revisions.mutations.restore, { revisionId: revisionId! });
    const restored = await t.run((ctx) => ctx.db.get(postId));
    expect(restored?.blocksRevision).toBe(4);
    expect(restored).toMatchObject({ contentMode: "blocks", title: "Original", blocks: [{ attrs: { text: "Prior block" } }] });
    const undo = await t.run((ctx) => ctx.db.query("revisions").withIndex("by_parent", (q) => q.eq("parentId", postId)).order("desc").first());
    expect(undo).toMatchObject({ contentMode: "article", title: "Changed", blocks: [] });
    await editor.mutation(api.revisions.mutations.restore, { revisionId: undo!._id });
    expect(await t.run((ctx) => ctx.db.get(postId))).toMatchObject({ contentMode: "article", title: "Changed", blocks: [] });
  });

  test("a due job publishes once and repeated execution is harmless", async () => {
    const { t, postId } = await fixture(Date.now() - 1);
    await t.mutation(internal.posts.internals.publishScheduled, { postId });
    const first = await t.run((ctx) => ctx.db.get(postId));
    expect(first?.status).toBe("publish");
    await t.mutation(internal.posts.internals.publishScheduled, { postId });
    expect((await t.run((ctx) => ctx.db.get(postId)))?.publishedAt).toBe(first?.publishedAt);
  });

  test("replacing a schedule cancels the old job and keeps the new deadline", async () => {
    const { t, postId } = await fixture(Date.now() + 60_000);
    const first = await t.run((ctx) => replacePublicationSchedule(ctx, postId, Date.now() + 120_000));
    const deadline = Date.now() + 240_000;
    const second = await t.run((ctx) => replacePublicationSchedule(ctx, postId, deadline));
    const jobs = await t.run(async (ctx) => ({
      first: await ctx.db.system.get(first), second: await ctx.db.system.get(second),
    }));
    expect(jobs.first?.state.kind).toBe("canceled");
    expect(jobs.second?.state.kind).toBe("pending");
    expect(jobs.second?.scheduledTime).toBe(deadline);
  });

  test("a mismatched schedule generation cannot publish even after the new deadline", async () => {
    const currentDeadline = Date.now() - 1;
    const { t, postId } = await fixture(currentDeadline);
    await t.mutation(internal.posts.internals.publishScheduled, { postId, expectedScheduledAt: currentDeadline - 60_000 });
    expect((await t.run((ctx) => ctx.db.get(postId)))?.status).toBe("future");
  });
  for (const legacyBlocks of [true, false]) {
    test(`legacy ${legacyBlocks ? "block" : "article"} revisions remain recoverable`, async () => {
      const { t, postId, authorId } = await fixture(Date.now() + 60_000);
      const blocks = [{ id: "old", name: "core/paragraph", version: 1, attrs: { text: "Old" } }];
      const revisionId = await t.run((ctx) => ctx.db.insert("revisions", {
        parentId: postId, parentType: "post", title: "Old", content: legacyBlocks ? JSON.stringify(blocks) : "Old article",
        authorId, changedFields: legacyBlocks ? ["content", "blocks"] : ["content"],
        revisionNumber: 1, type: "manual", contentLength: 10, createdAt: 1,
      }));
      const editor = t.withIdentity({ subject: authorId, issuer: "https://convexpress-admin.local" });
      await editor.mutation(api.revisions.mutations.restore, { revisionId });
      const restored = await t.run((ctx) => ctx.db.get(postId));
      expect(restored?.contentMode).toBe(legacyBlocks ? "blocks" : "article");
      expect(restored?.blocks).toEqual(legacyBlocks ? blocks : undefined);
      expect(restored?.content).toBe(legacyBlocks ? "" : "Old article");
    });
  }

});

for (const type of ["post", "page"] as const) {
  test(`${type} historical prompt/layout snapshots remain restorable with a complete undo`, async () => {
    const { t, postId, authorId } = await fixture(Date.now() + 60_000);
    await t.run(ctx => ctx.db.patch(postId, { type, status: "draft", pagePrompt: "Original prompt", layoutId: "original-layout" }));
    const editor = t.withIdentity({ subject: authorId, issuer: "https://convexpress-admin.local" });
    // Build an archived revision through the retained snapshot writer, not a retired editor endpoint.
    await t.mutation(internal.revisions.internals.createOnSave, {
      parentId: postId, parentType: type, title: "Original", content: "Legacy",
      authorId, changedFields: ["pagePrompt"],
    });
    await t.run(ctx => ctx.db.patch(postId, { pagePrompt: "Changed prompt" }));
    const revision = await t.run(ctx => ctx.db.query("revisions").withIndex("by_parent", q => q.eq("parentId", postId)).first());
    expect(revision).not.toBeNull();
    expect(revision).toMatchObject({ pagePrompt: "Original prompt", layoutId: "original-layout", changedFields: ["pagePrompt"] });
    await t.run(ctx => ctx.db.patch(postId, { layoutId: "changed-layout" }));
    await editor.mutation(api.revisions.mutations.restore, { revisionId: revision!._id });
    expect(await t.run(ctx => ctx.db.get(postId))).toMatchObject({ pagePrompt: "Original prompt", layoutId: "original-layout" });
    const undo = await t.run(ctx => ctx.db.query("revisions").withIndex("by_parent", q => q.eq("parentId", postId)).order("desc").first());
    expect(undo).toMatchObject({ pagePrompt: "Changed prompt", layoutId: "changed-layout" });
  });
}

for (const snapshotVersion of [1, 2] as const) {
  test(`snapshot v${snapshotVersion} respects whether absent layout and prompt were captured`, async () => {
    const { t, postId, authorId } = await fixture(Date.now() + 60_000);
    const revisionId = await t.run(ctx => ctx.db.insert("revisions", {
      parentId: postId, parentType: "post", title: "Earlier", content: "Earlier body", snapshotVersion,
      contentMode: "article", authorId, changedFields: ["title"], revisionNumber: 1, type: "manual", contentLength: 12, createdAt: 1,
    }));
    await t.run(ctx => ctx.db.patch(postId, { layoutId: "current-layout", pagePrompt: "Current prompt" }));
    const editor = t.withIdentity({ subject: authorId, issuer: "https://convexpress-admin.local" });
    await editor.mutation(api.revisions.mutations.restore, { revisionId });
    const restored = await t.run(ctx => ctx.db.get(postId));
    expect(restored?.layoutId).toBe(snapshotVersion === 1 ? "current-layout" : undefined);
    expect(restored?.pagePrompt).toBe(snapshotVersion === 1 ? "Current prompt" : undefined);
  });
}
