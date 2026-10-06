import * as catalogRevisionWrites from "../media/attachmentGuard";
import { deleteTermRelationship } from "../helpers/postDiscovery";
import { insertTermRelationship } from "../helpers/postDiscovery";
import { canonicalBoundary, duplicateDocument, canonicalTrashRestorePermit } from "../canonicalDocuments/service";

import { assertNoNewDisabledBlocks } from "../blocks/policy";
import { replacePublicationSchedule } from "../helpers/publicationSchedule";
/**
 * Post System - Mutations
 *
 * All write operations for the post lifecycle:
 *   publish          - Publish a post
 *   unpublish        - Revert a published post to draft
 *   trash            - Move a post to trash
 *   restore          - Restore a post from trash
 *   permanentDelete  - Permanently delete a post and all related data
 *   duplicate        - Clone a post as a new draft
 *   autosave         - Upsert autosave data (no event emission)
 *   bulkTrash        - Bulk trash multiple posts
 *   bulkRestore      - Bulk restore multiple posts
 *   bulkDelete       - Bulk permanently delete posts
 *   bulkPublish      - Bulk publish posts
 *
 * PostMeta mutations:
 *   setMeta          - Upsert a meta key-value pair
 *   deleteMeta       - Delete a meta key-value pair
 *   bulkSetMeta      - Bulk upsert meta key-value pairs
 *
 * Authorization model:
 *   - Every mutation calls requireCan() for base capability check
 *   - Ownership-aware checks via checkPostCapability() for post-level operations
 *   - Contributors cannot publish/schedule/set private
 *   - Authors can only edit/trash own posts
 *   - Editors and Admins have full access
 *
 * All write mutations (except autosave) emit events via the Event Dispatcher System.
 */

import { ConvexError, v } from "convex/values";
import { authoringSnapshot } from "../helpers/authoringSnapshot";
import { canEditContent } from "../helpers/publicContent";

import { assertPagePathAvailable } from "../helpers/pageRouteGuard";
import { prepareContentRestrictionCopy } from "../membership/policyCopy";
import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";

import { requireCan, getCurrentUser, getUserIdentifier } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { POST_EVENTS, SYSTEM } from "../events/constants";
import { generateUniqueSlug } from "../helpers/slug";
import { checkPostCapability, isPostOwner, getUserRoleLevel } from "../helpers/postAuth";

import type { AuthUser, AuthPost } from "../helpers/postAuth";
import {
  publishPostArgs,
  unpublishPostArgs,
  schedulePostArgs,
  trashPostArgs,
  restorePostArgs,
  deletePostArgs,
  duplicatePostArgs,
  bulkTrashArgs,
  bulkRestoreArgs,
  bulkDeleteArgs,
  bulkPublishArgs,
  setMetaArgs,
  deleteMetaArgs,
  bulkSetMetaArgs,
  MAX_TITLE_LENGTH,
  MAX_BULK_SIZE,
  TRASH_PURGE_DAYS_MS,
} from "./validators";
import { validateBlocks, validateBlocksAgainstCatalog } from "../blocks/helpers";
import { deleteWithMediaReferences, insertWithMediaReferences, patchWithMediaReferences } from "../media/attachmentGuard";

type PostStatus = Doc<"posts">["status"];

// New documents are created through canonicalDocuments.create or the canonical HTTP API.

// Metadata and authoring use revision-checked canonicalDocuments mutations.

// ─── Publish ────────────────────────────────────────────────────────────────

/**
 * Publish a post.
 *
 * Sets status to "publish", publishedAt to now.
 * Validates post has a title (cannot publish empty title).
 */
export const publish = mutation({
  args: publishPostArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "post.publish");

    const post = await ctx.db.get("posts", args.postId);
    if (!post) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Post not found",
      });
    }

    // Already published - idempotent
    if (post.status === "publish") {
      return args.postId;
    }

    // Cannot publish from trash
    if (post.status === "trash") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Cannot publish a trashed post. Restore it first.",
      });
    }

    // Capability check
    await checkPostCapability(ctx, user as AuthUser, post as AuthPost, "publish");

    // Validate title
    if (!post.title || !post.title.trim()) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Cannot publish a post with an empty title",
      });
    }

    // ── Update post ─────────────────────────────────────────────────────
    const now = Date.now();
    const patch: Record<string, unknown> = {
      status: "publish",
      publishedAt: post.publishedAt ?? now,
      scheduledAt: undefined, // Clear scheduled date
      updatedAt: now,
    };

    // Set visibility to public if not already private or password
    if (post.visibility !== "private" && post.visibility !== "password") {
      patch.visibility = "public";
    }

    await patchWithMediaReferences<"posts">(ctx, "posts", args.postId, patch);

    // ── Ensure default category ─────────────────────────────────────────
    // Check if post has any categories assigned
    if (post.type === "post") {
      const categoryRels = await ctx.db
        .query("termRelationships")
        .withIndex("by_post", (q) => q.eq("postId", args.postId))
        .collect();

      // Check if any of the assigned terms are categories
      let hasCategory = false;
      for (const rel of categoryRels) {
        const term = await ctx.db.get("terms", rel.termId);
        if (term && term.taxonomy === "category") {
          hasCategory = true;
          break;
        }
      }

      // If no categories, assign the default category
      if (!hasCategory) {
        const defaultCategory = await ctx.db
          .query("terms")
          .withIndex("by_isDefault", (q) => q.eq("isDefault", true))
          .first();

        if (defaultCategory && defaultCategory.taxonomy === "category") {
          await insertTermRelationship(ctx, {
            postId: args.postId,
            termId: defaultCategory._id,
          });
        }
      }
    }

    // ── Emit event ──────────────────────────────────────────────────────
    await emitEvent(ctx, POST_EVENTS.PUBLISHED, SYSTEM.POST, {
      postId: args.postId,
      title: post.title,
      authorId: post.authorId,
      publishedAt: patch.publishedAt,
      url: `/blog/${post.slug}`,
    });

    // ── Update author post count (H3 fix) ────────────────────────────────
    await ctx.scheduler.runAfter(
      0,
      internal.posts.internals.updatePostCount,
      { authorId: post.authorId },
    );

    return args.postId;
  },
});

// ─── Unpublish ──────────────────────────────────────────────────────────────

/**
 * Unpublish a post (revert to draft or pending).
 */
export const unpublish = mutation({
  args: unpublishPostArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "post.unpublish");

    const post = await ctx.db.get("posts", args.postId);
    if (!post) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Post not found",
      });
    }

    if (post.status !== "publish" && post.status !== "private") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Post is not currently published or private",
      });
    }

    await checkPostCapability(ctx, user as AuthUser, post as AuthPost, "edit");

    const now = Date.now();
    const targetStatus = args.targetStatus ?? "draft";

    await patchWithMediaReferences<"posts">(ctx, "posts", args.postId, {
      status: targetStatus,
      visibility: "public",
      updatedAt: now,
    });

    await emitEvent(ctx, POST_EVENTS.UNPUBLISHED, SYSTEM.POST, {
      postId: args.postId,
      title: post.title,
      authorId: post.authorId,
    });

    // ── Update author post count (H3 fix) ────────────────────────────────
    await ctx.scheduler.runAfter(
      0,
      internal.posts.internals.updatePostCount,
      { authorId: post.authorId },
    );

    return args.postId;
  },
});

// ─── Schedule ────────────────────────────────────────────────────────────────

/**
 * Schedule a post for future publication.
 *
 * Sets status to "future", stores the scheduled time, and registers a
 * Convex scheduled function to auto-publish at that time.
 * Stores the scheduled function ID in postMeta for potential cancellation.
 */
export const schedule = mutation({
  args: schedulePostArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "post.publish");

    const post = await ctx.db.get("posts", args.postId);
    if (!post) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Post not found",
      });
    }

    if (post.status === "trash") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Cannot schedule a trashed post. Restore it first.",
      });
    }

    // Capability check
    await checkPostCapability(ctx, user as AuthUser, post as AuthPost, "publish");

    // Validate scheduledAt is in the future (at least 1 minute from now)
    const oneMinuteFromNow = Date.now() + 60_000;
    if (args.scheduledAt <= oneMinuteFromNow) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Scheduled date must be at least 1 minute in the future",
      });
    }

    const now = Date.now();

    // Update post to future status
    await patchWithMediaReferences<"posts">(ctx, "posts", args.postId, {
      status: "future",
      scheduledAt: args.scheduledAt,
      updatedAt: now,
    });

    await replacePublicationSchedule(ctx, args.postId, args.scheduledAt);

    // Emit event
    await emitEvent(ctx, POST_EVENTS.SCHEDULED, SYSTEM.POST, {
      postId: args.postId,
      title: post.title,
      authorId: post.authorId,
      scheduledFor: args.scheduledAt,
    });

    return args.postId;
  },
});

// ─── Trash ──────────────────────────────────────────────────────────────────

/**
 * Move a post to trash.
 *
 * Stores the previous status for restore. Schedules auto-purge after 30 days.
 */
export const trash = mutation({
  args: trashPostArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "post.trash");

    const post = await ctx.db.get("posts", args.postId);
    if (!post) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Post not found",
      });
    }

    if (post.status === "trash") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Post is already in trash",
      });
    }

    await checkPostCapability(ctx, user as AuthUser, post as AuthPost, "delete");

    const now = Date.now();

    await patchWithMediaReferences<"posts">(ctx, "posts", args.postId, {
      previousStatus: post.status,
      status: "trash",
      trashedAt: now,
      updatedAt: now,
    });

    // Schedule auto-purge after 30 days
    await ctx.scheduler.runAt(
      now + TRASH_PURGE_DAYS_MS,
      internal.posts.internals.purgeOldTrash,
      { postId: args.postId },
    );

    await emitEvent(ctx, POST_EVENTS.TRASHED, SYSTEM.POST, {
      postId: args.postId,
      title: post.title,
      authorId: post.authorId,
    });

    // ── Update author post count if trashing a published post (H3 fix) ──
    if (post.status === "publish") {
      await ctx.scheduler.runAfter(
        0,
        internal.posts.internals.updatePostCount,
        { authorId: post.authorId },
      );
    }

    return { success: true };
  },
});

// ─── Restore ────────────────────────────────────────────────────────────────

/**
 * Restore a post from trash.
 *
 * Restores the previous status. If the previous status was "future" and
 * the scheduled date is now in the past, restores as "draft" instead.
 */
export const restore = mutation({
  args: restorePostArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "post.restore");

    const post = await ctx.db.get("posts", args.postId);
    if (!post) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Post not found",
      });
    }

    if (post.status !== "trash") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Post is not in trash",
      });
    }

    await checkPostCapability(ctx, user as AuthUser, post as AuthPost, "delete");

    const now = Date.now();
    let restoredStatus: PostStatus =
      (post.previousStatus as PostStatus | undefined) ?? "draft";

    // If the previous status was "future" and the scheduled date has passed,
    // restore as "draft" instead
    if (restoredStatus === "future" && post.scheduledAt && post.scheduledAt <= now) {
      restoredStatus = "draft";
    }

    // Re-check slug uniqueness after restore
    const slugConflict = await ctx.db
      .query("posts")
      .withIndex("by_slug", (q) =>
        q.eq("slug", post.slug).eq("type", post.type),
      )
      .first();

    let newSlug = post.slug;
    if (slugConflict && slugConflict._id !== args.postId) {
      newSlug = await generateUniqueSlug(ctx, post.title, post.type as "post" | "page", args.postId);
    }

    const restorePatch = {
      status: restoredStatus,
      previousStatus: undefined,
      trashedAt: undefined,
      slug: newSlug,
      updatedAt: now,
    };
    const restorePermit = await canonicalTrashRestorePermit(ctx, post, restorePatch);
    await patchWithMediaReferences<"posts">(ctx, "posts", args.postId, restorePatch, restorePermit);

    await emitEvent(ctx, POST_EVENTS.RESTORED, SYSTEM.POST, {
      postId: args.postId,
      title: post.title,
      authorId: post.authorId,
    });

    return args.postId;
  },
});

// ─── Permanent Delete ───────────────────────────────────────────────────────

/**
 * Permanently delete a post and all related data.
 *
 * Deletes: postMeta, termRelationships, and the post record itself.
 * Unless `force` is true, the post must be in trash.
 */
export const permanentDelete = mutation({
  args: deletePostArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "post.delete");

    const post = await ctx.db.get("posts", args.postId);
    if (!post) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Post not found",
      });
    }

    if (!args.force && post.status !== "trash") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Post must be in trash before permanent deletion. Use force=true to skip.",
      });
    }

    await checkPostCapability(ctx, user as AuthUser, post as AuthPost, "delete");

    // ── Delete all postMeta ─────────────────────────────────────────────
    const metaRecords = await ctx.db
      .query("postMeta")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    for (const meta of metaRecords) {
      await deleteWithMediaReferences<"postMeta">(ctx, "postMeta", meta._id);
    }

    // ── Delete all taxonomy relationships ────────────────────────────────
    const termRels = await ctx.db
      .query("termRelationships")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    for (const rel of termRels) {
      await deleteTermRelationship(ctx, rel._id);
    }

    // ── Delete all revisions (synchronous to ensure cleanup before post deletion)
    await ctx.runMutation(
      internal.revisions.internals.deleteByParent,
      { parentId: args.postId },
    );

    // ── Delete all comments for this post (C4 fix) ──────────────────────
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    for (const comment of comments) {
      await ctx.db.delete("comments", comment._id);
    }

    // ── Capture data for event before deleting ──────────────────────────
    const eventPayload = {
      postId: args.postId,
      title: post.title,
      authorId: post.authorId,
    };

    // ── Delete the post record ──────────────────────────────────────────
    await deleteWithMediaReferences<"posts">(ctx, "posts", args.postId);

    // ── Emit event ──────────────────────────────────────────────────────
    await emitEvent(ctx, POST_EVENTS.DELETED, SYSTEM.POST, eventPayload);

    // ── Update author post count (H3 fix) ────────────────────────────────
    await ctx.scheduler.runAfter(
      0,
      internal.posts.internals.updatePostCount,
      { authorId: post.authorId },
    );

    return { success: true };
  },
});

// ─── Duplicate ──────────────────────────────────────────────────────────────

/**
 * Clone a post as a new draft.
 *
 * Creates a copy with "(Copy)" appended to the title, as a draft
 * owned by the current user.
 */
export const duplicate = mutation({
  args: duplicatePostArgs,
  returns: v.id("posts"),
  handler: async (ctx, args) => {
    if (args.expectedRevision !== undefined) return canonicalBoundary(async () => (await duplicateDocument(ctx, { postId: args.postId, expectedRevision: args.expectedRevision! })).postId);
    const user = await requireCan(ctx, "post.duplicate");

    const sourcePost = await ctx.db.get("posts", args.postId);
    if (!sourcePost) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Source post not found",
      });
    }

    // Duplication exposes the complete stored body, including protected content.
    // Public read access must never grant the right to create an editable copy.
    if (!(await canEditContent(ctx, sourcePost))) {
      throw new ConvexError({ code: "FORBIDDEN", message: "You must be able to edit the source content to duplicate it" });
    }

    if (sourcePost.blocksVersion === 2) throw new ConvexError({ code: "CANONICAL_REVISION_REQUIRED", message: "Reload the canonical document and supply its current revision before duplicating it." });
    if (sourcePost.blocksVersion !== undefined && sourcePost.blocksVersion !== 1) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "This block document version requires a compatible duplication adapter" });
    }
    const authored = authoringSnapshot(sourcePost);
    if (authored.blocks !== undefined) {
      validateBlocks(authored.blocks);
      authored.blocks = validateBlocksAgainstCatalog(authored.blocks);
      await assertNoNewDisabledBlocks(ctx, [], authored.blocks);
      authored.blocksRevision = 1;
    }

    // Preflight every copied collection before inserting anything. Iteration
    // stops at the budget rather than loading an unbounded metadata collection.
    let copyBytes = new TextEncoder().encode(JSON.stringify(sourcePost)).byteLength;
    let copyRows = 0;
    async function boundedRows<T>(query: AsyncIterable<T>): Promise<T[]> {
      const rows: T[] = [];
      for await (const row of query) {
        copyBytes += new TextEncoder().encode(JSON.stringify(row)).byteLength;
        copyRows += 1;
        if (rows.length >= 256 || copyRows > 512 || copyBytes > 2 * 1024 * 1024) {
          throw new ConvexError({ code: "LIMIT_EXCEEDED", message: "This content exceeds the atomic duplication limit; reduce its metadata or relationships before retrying" });
        }
        rows.push(row);
      }
      return rows;
    }
    const metaRecords = await boundedRows(ctx.db.query("postMeta")
      .withIndex("by_post", q => q.eq("postId", args.postId)));
    const termRels = await boundedRows(ctx.db.query("termRelationships")
      .withIndex("by_post", q => q.eq("postId", args.postId)));
    const restrictionCopy = await prepareContentRestrictionCopy(ctx, sourcePost, {
      maxRows: Math.min(256, 512 - copyRows), maxBytes: 2 * 1024 * 1024 - copyBytes,
    });
    copyRows += restrictionCopy.policies.length;
    copyBytes += restrictionCopy.bytes;
    const fieldValues = await boundedRows(ctx.db.query("fieldValues")
      .withIndex("by_entity", q => q.eq("entityType", sourcePost.type).eq("entityId", String(args.postId))));

    const now = Date.now();
    const copySuffix = " (Copy)";
    const newTitle = `${sourcePost.title.slice(0, MAX_TITLE_LENGTH - copySuffix.length).trimEnd()}${copySuffix}`;
    const newSlug = await generateUniqueSlug(ctx, newTitle, sourcePost.type as "post" | "page");
    if (sourcePost.type === "page") await assertPagePathAvailable(ctx, `/${newSlug}`);

    // ── Create the duplicate post ───────────────────────────────────────
    const newPostId: import("../_generated/dataModel").Id<"posts"> = await insertWithMediaReferences<"posts">(ctx, "posts", {
      ...authored,
      type: sourcePost.type,
      title: newTitle,
      slug: newSlug,
      status: "draft",
      visibility: sourcePost.status === "private" ? "private" : sourcePost.visibility,
      password: sourcePost.password,
      authorId: user._id,
      layoutId: sourcePost.layoutId,
      pagePrompt: sourcePost.pagePrompt,
      ...(sourcePost.type === "page" ? { path: `/${newSlug}`, depth: 0 } : {}),
      commentStatus: sourcePost.commentStatus,
      commentCount: 0,
      isSticky: false,
      createdAt: now,
      updatedAt: now,
    });

    // ── Copy postMeta (except edit lock/last) ───────────────────────────
    for (const meta of metaRecords) {
      if (["_edit_lock", "_edit_last", "_scheduled_fn"].includes(meta.key)) continue;
      await insertWithMediaReferences<"postMeta">(ctx, "postMeta", {
        postId: newPostId,
        key: meta.key,
        value: meta.value,
      });
    }

    // ── Copy taxonomy assignments ───────────────────────────────────────
    for (const rel of termRels) {
      await insertTermRelationship(ctx, {
        postId: newPostId,
        termId: rel.termId,
        order: rel.order,
      });
    }

    for (const policy of restrictionCopy.policies) {
      await catalogRevisionWrites.insertWithMediaReferences<"membership_restriction_rules">(ctx, "membership_restriction_rules", {
        ...policy, resourceType: sourcePost.type, resourceIdOrKey: String(newPostId), createdAt: now, updatedAt: now,
      });
    }
    for (const field of fieldValues) {
      const { _id, _creationTime, ...value } = field;
      await insertWithMediaReferences<"fieldValues">(ctx, "fieldValues", {
        ...value, entityId: String(newPostId), updatedBy: getUserIdentifier(user), updatedAt: now,
      });
    }

    // ── Emit event (C3 fix: use DUPLICATED instead of CREATED) ─────────
    await emitEvent(ctx, POST_EVENTS.DUPLICATED, SYSTEM.POST, {
      postId: newPostId,
      title: newTitle,
      authorId: user._id,
      postType: sourcePost.type,
      status: "draft",
      duplicatedFrom: args.postId,
    });

    return newPostId;
  },
});

// ─── Bulk Trash ─────────────────────────────────────────────────────────────

/**
 * Bulk trash multiple posts.
 */
export const bulkTrash = mutation({
  args: bulkTrashArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "post.bulk_delete");

    if (args.postIds.length === 0) {
      return { trashed: 0, errors: [] };
    }
    if (args.postIds.length > MAX_BULK_SIZE) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Bulk operations limited to ${MAX_BULK_SIZE} items`,
      });
    }

    let trashed = 0;
    const errors: Array<{ postId: string; error: string }> = [];
    const now = Date.now();
    const correlationId = `bulk-trash-${now}`;

    for (const postId of args.postIds) {
      try {
        const post = await ctx.db.get("posts", postId);
        if (!post) {
          errors.push({ postId: postId.toString(), error: "Post not found" });
          continue;
        }
        if (post.status === "trash") {
          errors.push({ postId: postId.toString(), error: "Already in trash" });
          continue;
        }

        // ── Per-post ownership capability check (C5 fix) ────────────
        try {
          await checkPostCapability(ctx, user as AuthUser, post as AuthPost, "delete");
        } catch (capErr: unknown) {
          errors.push({
            postId: postId.toString(),
            error: capErr instanceof Error ? capErr.message : "Insufficient permissions",
          });
          continue;
        }

        await patchWithMediaReferences<"posts">(ctx, "posts", postId, {
          previousStatus: post.status,
          status: "trash",
          trashedAt: now,
          updatedAt: now,
        });

        // Schedule auto-purge
        await ctx.scheduler.runAt(
          now + TRASH_PURGE_DAYS_MS,
          internal.posts.internals.purgeOldTrash,
          { postId },
        );

        await emitEvent(ctx, POST_EVENTS.TRASHED, SYSTEM.POST, {
          postId,
          title: post.title,
          authorId: post.authorId,
        }, { correlationId });

        trashed++;
      } catch (e: unknown) {
        errors.push({
          postId: postId.toString(),
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }

    return { trashed, errors };
  },
});

// ─── Bulk Restore ───────────────────────────────────────────────────────────

/**
 * Bulk restore multiple posts from trash.
 */
export const bulkRestore = mutation({
  args: bulkRestoreArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "post.restore");

    if (args.postIds.length === 0) {
      return { restored: 0, errors: [] };
    }
    if (args.postIds.length > MAX_BULK_SIZE) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Bulk operations limited to ${MAX_BULK_SIZE} items`,
      });
    }

    let restored = 0;
    const errors: Array<{ postId: string; error: string }> = [];
    const now = Date.now();
    const correlationId = `bulk-restore-${now}`;

    for (const postId of args.postIds) {
      try {
        const post = await ctx.db.get("posts", postId);
        if (!post) {
          errors.push({ postId: postId.toString(), error: "Post not found" });
          continue;
        }
        if (post.status !== "trash") {
          errors.push({ postId: postId.toString(), error: "Post is not in trash" });
          continue;
        }

        let restoredStatus: PostStatus =
          (post.previousStatus as PostStatus | undefined) ?? "draft";
        if (restoredStatus === "future" && post.scheduledAt && post.scheduledAt <= now) {
          restoredStatus = "draft";
        }

        // Re-check slug uniqueness after restore (H2 fix)
        const slugConflict = await ctx.db
          .query("posts")
          .withIndex("by_slug", (q) =>
            q.eq("slug", post.slug).eq("type", post.type),
          )
          .first();

        let newSlug = post.slug;
        if (slugConflict && slugConflict._id !== postId) {
          newSlug = await generateUniqueSlug(ctx, post.title, post.type as "post" | "page", postId);
        }

        const restorePatch = {
          status: restoredStatus,
          previousStatus: undefined,
          trashedAt: undefined,
          slug: newSlug,
          updatedAt: now,
        };
        const restorePermit = await canonicalTrashRestorePermit(ctx, post, restorePatch);
        await patchWithMediaReferences<"posts">(ctx, "posts", postId, restorePatch, restorePermit);

        await emitEvent(ctx, POST_EVENTS.RESTORED, SYSTEM.POST, {
          postId,
          title: post.title,
          authorId: post.authorId,
        }, { correlationId });

        restored++;
      } catch (e: unknown) {
        errors.push({
          postId: postId.toString(),
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }

    return { restored, errors };
  },
});

// ─── Bulk Delete ────────────────────────────────────────────────────────────

/**
 * Bulk permanently delete posts (must be in trash).
 */
export const bulkDelete = mutation({
  args: bulkDeleteArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "post.bulk_delete");

    if (args.postIds.length === 0) {
      return { deleted: 0, errors: [] };
    }
    if (args.postIds.length > MAX_BULK_SIZE) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Bulk operations limited to ${MAX_BULK_SIZE} items`,
      });
    }

    let deleted = 0;
    const errors: Array<{ postId: string; error: string }> = [];
    const correlationId = `bulk-delete-${Date.now()}`;

    for (const postId of args.postIds) {
      try {
        const post = await ctx.db.get("posts", postId);
        if (!post) {
          errors.push({ postId: postId.toString(), error: "Post not found" });
          continue;
        }
        if (post.status !== "trash") {
          errors.push({ postId: postId.toString(), error: "Post must be in trash" });
          continue;
        }

        // Delete postMeta
        const metaRecords = await ctx.db
          .query("postMeta")
          .withIndex("by_post", (q) => q.eq("postId", postId))
          .collect();
        for (const meta of metaRecords) {
          await deleteWithMediaReferences<"postMeta">(ctx, "postMeta", meta._id);
        }

        // Delete taxonomy relationships
        const termRels = await ctx.db
          .query("termRelationships")
          .withIndex("by_post", (q) => q.eq("postId", postId))
          .collect();
        for (const rel of termRels) {
          await deleteTermRelationship(ctx, rel._id);
        }

        // Delete all revisions (synchronous to ensure cleanup before post deletion)
        await ctx.runMutation(
          internal.revisions.internals.deleteByParent,
          { parentId: postId },
        );

        // Delete all comments for this post
        const comments = await ctx.db
          .query("comments")
          .withIndex("by_post", (q) => q.eq("postId", postId))
          .collect();
        for (const comment of comments) {
          await ctx.db.delete("comments", comment._id);
        }

        const eventPayload = {
          postId,
          title: post.title,
          authorId: post.authorId,
        };

        await deleteWithMediaReferences<"posts">(ctx, "posts", postId);

        await emitEvent(ctx, POST_EVENTS.DELETED, SYSTEM.POST, eventPayload, { correlationId });

        deleted++;
      } catch (e: unknown) {
        errors.push({
          postId: postId.toString(),
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }

    return { deleted, errors };
  },
});

// ─── Bulk Publish ───────────────────────────────────────────────────────────

/**
 * Bulk publish multiple posts.
 */
export const bulkPublish = mutation({
  args: bulkPublishArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "post.bulk_publish");

    if (args.postIds.length === 0) {
      return { published: 0, errors: [] };
    }
    if (args.postIds.length > MAX_BULK_SIZE) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Bulk operations limited to ${MAX_BULK_SIZE} items`,
      });
    }

    let published = 0;
    const errors: Array<{ postId: string; error: string }> = [];
    const now = Date.now();
    const correlationId = `bulk-publish-${now}`;

    for (const postId of args.postIds) {
      try {
        const post = await ctx.db.get("posts", postId);
        if (!post) {
          errors.push({ postId: postId.toString(), error: "Post not found" });
          continue;
        }
        if (post.status === "publish") {
          continue; // Already published, skip silently
        }
        if (post.status === "trash") {
          errors.push({ postId: postId.toString(), error: "Cannot publish trashed post" });
          continue;
        }
        if (!post.title || !post.title.trim()) {
          errors.push({ postId: postId.toString(), error: "Cannot publish post with empty title" });
          continue;
        }

        // ── Per-post ownership capability check (matches bulkTrash pattern)
        try {
          await checkPostCapability(ctx, user as AuthUser, post as AuthPost, "publish");
        } catch (capErr: unknown) {
          errors.push({
            postId: postId.toString(),
            error: capErr instanceof Error ? capErr.message : "Insufficient permissions",
          });
          continue;
        }

        await patchWithMediaReferences<"posts">(ctx, "posts", postId, {
          status: "publish",
          publishedAt: post.publishedAt ?? now,
          scheduledAt: undefined,
          updatedAt: now,
        });

        await emitEvent(ctx, POST_EVENTS.PUBLISHED, SYSTEM.POST, {
          postId,
          title: post.title,
          authorId: post.authorId,
          publishedAt: post.publishedAt ?? now,
          url: `/blog/${post.slug}`,
        }, { correlationId });

        published++;
      } catch (e: unknown) {
        errors.push({
          postId: postId.toString(),
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }

    return { published, errors };
  },
});

// ─── PostMeta Mutations ─────────────────────────────────────────────────────

/**
 * Set (upsert) a post meta key-value pair.
 *
 * Enforces ownership-aware authorization: Authors can only set meta
 * on their own posts; Editors/Admins can set meta on any post.
 */
export const setMeta = mutation({
  args: setMetaArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "post.update");

    const post = await ctx.db.get("posts", args.postId);
    if (!post) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Post not found",
      });
    }

    // Ownership-aware capability check
    await checkPostCapability(ctx, user as AuthUser, post as AuthPost, "edit");

    // Check if key already exists for this post
    const existing = await ctx.db
      .query("postMeta")
      .withIndex("by_post_key", (q) =>
        q.eq("postId", args.postId).eq("key", args.key),
      )
      .unique();

    if (existing) {
      await patchWithMediaReferences<"postMeta">(ctx, "postMeta", existing._id, { value: args.value });
      return existing._id;
    } else {
      return await insertWithMediaReferences<"postMeta">(ctx, "postMeta", {
        postId: args.postId,
        key: args.key,
        value: args.value,
      });
    }
  },
});

/**
 * Delete a post meta key-value pair.
 *
 * Enforces ownership-aware authorization: Authors can only delete meta
 * on their own posts; Editors/Admins can delete meta on any post.
 */
export const deleteMeta = mutation({
  args: deleteMetaArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "post.update");

    const post = await ctx.db.get("posts", args.postId);
    if (!post) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Post not found",
      });
    }

    // Ownership-aware capability check
    await checkPostCapability(ctx, user as AuthUser, post as AuthPost, "edit");

    const existing = await ctx.db
      .query("postMeta")
      .withIndex("by_post_key", (q) =>
        q.eq("postId", args.postId).eq("key", args.key),
      )
      .unique();

    if (existing) {
      await deleteWithMediaReferences<"postMeta">(ctx, "postMeta", existing._id);
    }

    return { success: true };
  },
});

/**
 * Bulk set (upsert) multiple post meta key-value pairs.
 *
 * Enforces ownership-aware authorization: Authors can only set meta
 * on their own posts; Editors/Admins can set meta on any post.
 */
export const bulkSetMeta = mutation({
  args: bulkSetMetaArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "post.update");

    const post = await ctx.db.get("posts", args.postId);
    if (!post) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Post not found",
      });
    }

    // Ownership-aware capability check
    await checkPostCapability(ctx, user as AuthUser, post as AuthPost, "edit");

    for (const { key, value } of args.meta) {
      const existing = await ctx.db
        .query("postMeta")
        .withIndex("by_post_key", (q) =>
          q.eq("postId", args.postId).eq("key", key),
        )
        .unique();

      if (existing) {
        await patchWithMediaReferences<"postMeta">(ctx, "postMeta", existing._id, { value });
      } else {
        await insertWithMediaReferences<"postMeta">(ctx, "postMeta", {
          postId: args.postId,
          key,
          value,
        });
      }
    }

    return { success: true };
  },
});
