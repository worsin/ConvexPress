/**
 * Post System - Internal Functions
 *
 * Non-client-callable functions used by:
 *   - Convex scheduled functions (cron-like behavior)
 *   - Other system internals (cross-system calls)
 *
 * Functions:
 *   publishScheduled  - Auto-publish a future-dated post when its time arrives
 *   purgeOldTrash     - Permanently delete a post that's been in trash > 30 days
 *   updatePostCount   - Recalculate an author's published post count
 *   getAllPublished    - Return all published posts with minimal data (for bulk operations)
 */

import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { emitEvent } from "../helpers/events";
import { POST_EVENTS, SYSTEM } from "../events/constants";

// ─── Publish Scheduled Post ─────────────────────────────────────────────────

/**
 * Auto-publish a future-dated post when its scheduled time arrives.
 *
 * This is called by `ctx.scheduler.runAt()` when a post is given
 * status "future". It fires at the scheduled time.
 *
 * Safety: If the post has been manually published, trashed, deleted,
 * or its status changed before the scheduled time, this is a no-op.
 */
export const publishScheduled = internalMutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }) => {
    const post = await ctx.db.get("posts", postId);

    // Post was deleted, or status changed from "future" - no-op
    if (!post || post.status !== "future") return;

    const now = Date.now();

    await ctx.db.patch("posts", postId, {
      status: "publish",
      publishedAt: now,
      scheduledAt: undefined,
      updatedAt: now,
    });

    // Emit post.published event
    await emitEvent(ctx, POST_EVENTS.PUBLISHED, SYSTEM.POST, {
      postId,
      title: post.title,
      authorId: post.authorId,
      publishedAt: now,
      url: `/blog/${post.slug}`,
      scheduledPublish: true,
    });

    // ── Update author post count (H3 fix) ────────────────────────────────
    await ctx.scheduler.runAfter(
      0,
      internal.posts.internals.updatePostCount,
      { authorId: post.authorId },
    );
  },
});

// ─── Purge Old Trash ────────────────────────────────────────────────────────

/**
 * Permanently delete a post that's been in trash for 30+ days.
 *
 * This is called by `ctx.scheduler.runAt()` when a post is trashed.
 * It fires at `trashedAt + 30 days`.
 *
 * Safety: If the post was restored before 30 days elapsed, this is a no-op.
 * Also handles cases where the post was already permanently deleted.
 */
export const purgeOldTrash = internalMutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }) => {
    const post = await ctx.db.get("posts", postId);

    // Post was already deleted or restored - no-op
    if (!post || post.status !== "trash") return;

    // ── Delete all postMeta ─────────────────────────────────────────────
    const metaRecords = await ctx.db
      .query("postMeta")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .collect();

    for (const meta of metaRecords) {
      await ctx.db.delete("postMeta", meta._id);
    }

    // ── Delete all taxonomy relationships ────────────────────────────────
    const termRels = await ctx.db
      .query("termRelationships")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .collect();

    for (const rel of termRels) {
      await ctx.db.delete("termRelationships", rel._id);
    }

    // ── Delete all revisions (H1 fix) ──────────────────────────────────
    await ctx.runMutation(
      internal.revisions.internals.deleteByParent,
      { parentId: postId },
    );

    // ── Delete all comments (H1 fix) ────────────────────────────────────
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .collect();

    for (const comment of comments) {
      await ctx.db.delete("comments", comment._id);
    }

    // ── Capture event data before deletion ──────────────────────────────
    const eventPayload = {
      postId,
      title: post.title,
      authorId: post.authorId,
      autoPurge: true,
    };

    // ── Delete the post record ──────────────────────────────────────────
    await ctx.db.delete("posts", postId);

    // ── Emit event ──────────────────────────────────────────────────────
    await emitEvent(ctx, POST_EVENTS.DELETED, SYSTEM.POST, eventPayload);
  },
});

// ─── Update Author Post Count ───────────────────────────────────────────────

/**
 * Recalculate an author's published post count.
 *
 * Called after status changes (publish, unpublish, trash, delete)
 * to keep the denormalized `postCount` field on the users table accurate.
 *
 * This counts all posts of type "post" with status "publish" for the given author.
 */
export const updatePostCount = internalMutation({
  args: { authorId: v.id("users") },
  handler: async (ctx, { authorId }) => {
    const author = await ctx.db.get("users", authorId);
    if (!author) return;

    // Count published posts by this author
    const publishedPosts = await ctx.db
      .query("posts")
      .withIndex("by_author", (q) =>
        q.eq("authorId", authorId).eq("type", "post").eq("status", "publish"),
      )
      .collect();

    const count = publishedPosts.length;

    // Update the denormalized count on the user record
    await ctx.db.patch("users", authorId, {
      postCount: count,
      updatedAt: Date.now(),
    });
  },
});

// ─── Get All Published Posts ─────────────────────────────────────────────────

/**
 * Return all published posts (type "post", status "publish") with minimal data.
 *
 * Used by:
 *   - Routing System: `onPermalinksChanged` event handler to generate batch
 *     redirects when the permalink structure changes.
 *   - Sitemap System: Bulk URL generation for all published content.
 *
 * Returns only the fields needed for URL generation:
 *   - _id, slug, publishedAt, numericId (if available)
 *
 * WARNING: This loads ALL published posts into memory. For sites with
 * thousands of posts, this could be expensive. The calling code should
 * process results in batches.
 */
export const getAllPublished = internalQuery({
  args: {},
  handler: async (ctx) => {
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_status", (q) => q.eq("status", "publish"))
      .take(10000);

    // Filter to type "post" only (exclude pages, attachments, etc.)
    // and return minimal fields for URL generation
    return posts
      .filter((p) => p.type === "post")
      .map((p) => ({
        _id: p._id,
        slug: p.slug,
        publishedAt: p.publishedAt,
      }));
  },
});
