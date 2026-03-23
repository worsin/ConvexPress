/**
 * Post System - Mutations
 *
 * All write operations for the post lifecycle:
 *   create           - Create a new post (auto-draft by default)
 *   update           - Update an existing post
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

import { ConvexError } from "convex/values";
import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { requireCan, getCurrentUser , getUserIdentifier } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { POST_EVENTS, SYSTEM } from "../events/constants";
import { generateUniqueSlug, sanitizeSlug } from "../helpers/slug";
import { checkPostCapability, isPostOwner, getUserRoleLevel } from "../helpers/postAuth";
import type { AuthUser, AuthPost } from "../helpers/postAuth";
import {
  createPostArgs,
  updatePostArgs,
  publishPostArgs,
  unpublishPostArgs,
  schedulePostArgs,
  trashPostArgs,
  restorePostArgs,
  deletePostArgs,
  duplicatePostArgs,
  autosavePostArgs,
  bulkTrashArgs,
  bulkRestoreArgs,
  bulkDeleteArgs,
  bulkPublishArgs,
  setMetaArgs,
  deleteMetaArgs,
  bulkSetMetaArgs,
  MAX_TITLE_LENGTH,
  MAX_EXCERPT_LENGTH,
  MAX_BULK_SIZE,
  TRASH_PURGE_DAYS_MS,
} from "./validators";

type PostStatus = Doc<"posts">["status"];

// ─── Create ─────────────────────────────────────────────────────────────────

/**
 * Create a new post.
 *
 * Defaults to "auto-draft" status with empty title/content.
 * Generates a unique slug from the title.
 * Assigns default category if no categories are specified.
 *
 * @returns The new post document ID
 */
export const create = mutation({
  args: createPostArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "post.create");

    // ── Validate title ──────────────────────────────────────────────────
    const title = (args.title ?? "").trim();
    if (title.length > MAX_TITLE_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Title must be ${MAX_TITLE_LENGTH} characters or fewer`,
      });
    }

    // ── Validate excerpt ────────────────────────────────────────────────
    if (args.excerpt && args.excerpt.length > MAX_EXCERPT_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Excerpt must be ${MAX_EXCERPT_LENGTH} characters or fewer`,
      });
    }

    // ── Determine status ────────────────────────────────────────────────
    let status = args.status ?? "auto-draft";

    // Contributors cannot publish/schedule/set private
    const roleLevel = await getUserRoleLevel(ctx, user as AuthUser);
    if (roleLevel < 60 && ["publish", "future", "private"].includes(status)) {
      status = "pending";
    }

    // ── Visibility logic ────────────────────────────────────────────────
    let visibility = args.visibility ?? "public";
    if (status === "private") {
      visibility = "private";
    }
    if (visibility === "password" && !args.password) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Password is required when visibility is 'password'",
      });
    }

    // ── Future scheduling validation ────────────────────────────────────
    let scheduledAt = args.scheduledAt;
    if (status === "future") {
      if (!scheduledAt || scheduledAt <= Date.now()) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Scheduled date must be in the future",
        });
      }
    }

    // ── Generate slug ───────────────────────────────────────────────────
    const slug = await generateUniqueSlug(ctx, title || "auto-draft", "post");

    // ── Determine comment status default ────────────────────────────────
    const commentStatus = args.commentStatus ?? "open";

    // ── Insert post ─────────────────────────────────────────────────────
    const now = Date.now();
    const postId = await ctx.db.insert("posts", {
      type: "post",
      title,
      slug,
      content: args.content,
      excerpt: args.excerpt,
      status,
      visibility,
      password: visibility === "password" ? args.password : undefined,
      authorId: user._id,
      featuredImageId: args.featuredImageId,
      commentStatus,
      commentCount: 0,
      isSticky: args.isSticky ?? false,
      publishedAt: status === "publish" ? now : undefined,
      scheduledAt: status === "future" ? scheduledAt : undefined,
      createdAt: now,
      updatedAt: now,
    });

    // ── Handle scheduled publish ────────────────────────────────────────
    if (status === "future" && scheduledAt) {
      await ctx.scheduler.runAt(
        scheduledAt,
        internal.posts.internals.publishScheduled,
        { postId },
      );
    }

    // ── Assign taxonomy terms ───────────────────────────────────────────
    // Note: Category/tag assignment is handled by the Taxonomy System.
    // If no categories are assigned, the default "Uncategorized" category
    // should be assigned on publish. For now, we store the intent and
    // let the Taxonomy System handle it.
    if (args.categoryIds && args.categoryIds.length > 0) {
      for (const termId of args.categoryIds) {
        // Check if relationship already exists
        const existing = await ctx.db
          .query("termRelationships")
          .withIndex("by_post_term", (q) =>
            q.eq("postId", postId).eq("termId", termId),
          )
          .unique();
        if (!existing) {
          await ctx.db.insert("termRelationships", {
            postId,
            termId,
          });
        }
      }
    }

    if (args.tagIds && args.tagIds.length > 0) {
      for (const termId of args.tagIds) {
        const existing = await ctx.db
          .query("termRelationships")
          .withIndex("by_post_term", (q) =>
            q.eq("postId", postId).eq("termId", termId),
          )
          .unique();
        if (!existing) {
          await ctx.db.insert("termRelationships", {
            postId,
            termId,
          });
        }
      }
    }

    // ── Emit event ──────────────────────────────────────────────────────
    await emitEvent(ctx, POST_EVENTS.CREATED, SYSTEM.POST, {
      postId,
      title,
      authorId: user._id,
      postType: "post",
      status,
    });

    // ── Emit post.scheduled event if status is "future" (C1 fix) ─────
    if (status === "future" && scheduledAt) {
      await emitEvent(ctx, POST_EVENTS.SCHEDULED, SYSTEM.POST, {
        postId,
        title,
        authorId: user._id,
        scheduledFor: scheduledAt,
      });
    }

    return postId;
  },
});

// ─── Update ─────────────────────────────────────────────────────────────────

/**
 * Update an existing post.
 *
 * Handles status transitions, slug regeneration, ownership checks,
 * and change tracking for the event payload.
 */
export const update = mutation({
  args: updatePostArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "post.update");

    // ── Fetch existing post ─────────────────────────────────────────────
    const post = await ctx.db.get("posts", args.postId);
    if (!post) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Post not found",
      });
    }

    // ── Ownership check ─────────────────────────────────────────────────
    await checkPostCapability(ctx, user as AuthUser, post as AuthPost, "edit");

    // ── Validate title ──────────────────────────────────────────────────
    if (args.title !== undefined && args.title.trim().length > MAX_TITLE_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Title must be ${MAX_TITLE_LENGTH} characters or fewer`,
      });
    }

    // ── Validate excerpt ────────────────────────────────────────────────
    if (args.excerpt !== undefined && args.excerpt.length > MAX_EXCERPT_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Excerpt must be ${MAX_EXCERPT_LENGTH} characters or fewer`,
      });
    }

    // ── Build patch ─────────────────────────────────────────────────────
    const now = Date.now();
    const patch: Record<string, unknown> = { updatedAt: now };
    const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];

    // Title
    if (args.title !== undefined) {
      const newTitle = args.title.trim();
      if (newTitle !== post.title) {
        patch.title = newTitle;
        changes.push({ field: "title", oldValue: post.title, newValue: newTitle });
      }
    }

    // Content
    if (args.content !== undefined && args.content !== post.content) {
      patch.content = args.content;
      changes.push({ field: "content", oldValue: "[content]", newValue: "[content]" });
    }

    // Excerpt
    if (args.excerpt !== undefined && args.excerpt !== post.excerpt) {
      patch.excerpt = args.excerpt || undefined;
      changes.push({ field: "excerpt", oldValue: post.excerpt, newValue: args.excerpt });
    }

    // Slug
    if (args.slug !== undefined) {
      const sanitized = sanitizeSlug(args.slug);
      if (!sanitized) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Invalid slug format",
        });
      }
      if (sanitized !== post.slug) {
        // Check uniqueness
        const slugConflict = await ctx.db
          .query("posts")
          .withIndex("by_slug", (q) =>
            q.eq("slug", sanitized).eq("type", post.type),
          )
          .first();
        if (slugConflict && slugConflict._id !== args.postId) {
          throw new ConvexError({
            code: "CONFLICT",
            message: `Slug "${sanitized}" is already in use`,
          });
        }
        patch.slug = sanitized;
        changes.push({ field: "slug", oldValue: post.slug, newValue: sanitized });
      }
    }

    // Status
    if (args.status !== undefined && args.status !== post.status) {
      const roleLevel = await getUserRoleLevel(ctx, user as AuthUser);
      let newStatus = args.status;

      // Contributors cannot publish/schedule/set private
      if (roleLevel < 60 && ["publish", "future", "private"].includes(newStatus)) {
        newStatus = "pending";
      }

      patch.status = newStatus;
      changes.push({ field: "status", oldValue: post.status, newValue: newStatus });

      // Handle scheduled publish
      if (newStatus === "future") {
        const scheduledAt = args.scheduledAt;
        if (!scheduledAt || scheduledAt <= Date.now()) {
          throw new ConvexError({
            code: "VALIDATION_ERROR",
            message: "Scheduled date must be in the future",
          });
        }
        patch.scheduledAt = scheduledAt;
        await ctx.scheduler.runAt(
          scheduledAt,
          internal.posts.internals.publishScheduled,
          { postId: args.postId },
        );
      }

      // If publishing, set publishedAt
      if (newStatus === "publish" && !post.publishedAt) {
        patch.publishedAt = now;
      }

      // If making private, update visibility
      if (newStatus === "private") {
        patch.visibility = "private";
      }
    }

    // Visibility
    if (args.visibility !== undefined && args.visibility !== post.visibility) {
      if (args.visibility === "password" && !args.password && !post.password) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Password is required when visibility is 'password'",
        });
      }
      patch.visibility = args.visibility;
      changes.push({ field: "visibility", oldValue: post.visibility, newValue: args.visibility });
    }

    // Password
    if (args.password !== undefined) {
      patch.password = args.password || undefined;
    }

    // Comment status
    if (args.commentStatus !== undefined && args.commentStatus !== post.commentStatus) {
      patch.commentStatus = args.commentStatus;
      changes.push({ field: "commentStatus", oldValue: post.commentStatus, newValue: args.commentStatus });
    }

    // Featured image
    if (args.featuredImageId !== undefined) {
      patch.featuredImageId = args.featuredImageId ?? undefined;
      if (post.featuredImageId !== args.featuredImageId) {
        changes.push({ field: "featuredImageId", oldValue: post.featuredImageId, newValue: args.featuredImageId });
      }
    }

    // Sticky
    if (args.isSticky !== undefined && args.isSticky !== post.isSticky) {
      // Only Editor+ can set sticky
      const roleLevel = await getUserRoleLevel(ctx, user as AuthUser);
      if (roleLevel < 80) {
        throw new ConvexError({
          code: "FORBIDDEN",
          message: "Only Editors and Administrators can set sticky posts",
        });
      }
      patch.isSticky = args.isSticky;
      changes.push({ field: "isSticky", oldValue: post.isSticky, newValue: args.isSticky });
    }

    // Author reassignment
    if (args.authorId !== undefined && args.authorId !== post.authorId) {
      const roleLevel = await getUserRoleLevel(ctx, user as AuthUser);
      if (roleLevel < 80) {
        throw new ConvexError({
          code: "FORBIDDEN",
          message: "Only Editors and Administrators can change post author",
        });
      }
      patch.authorId = args.authorId;
      changes.push({ field: "authorId", oldValue: post.authorId, newValue: args.authorId });
    }

    // Menu order
    if (args.menuOrder !== undefined && args.menuOrder !== post.menuOrder) {
      patch.menuOrder = args.menuOrder;
    }

    // Clear autosave fields on manual save
    patch.autosaveContent = undefined;
    patch.autosaveTitle = undefined;
    patch.autosavedAt = undefined;

    // ── Create revision snapshot BEFORE applying patch ─────────────────
    // Must be synchronous (not scheduled) to guarantee the snapshot captures
    // the state BEFORE the update is applied within this same transaction.
    if (post.status !== "auto-draft" && changes.length > 0) {
      const changedFieldNames = changes.map((c) => c.field);
      await ctx.runMutation(
        internal.revisions.internals.createOnSave,
        {
          parentId: args.postId,
          parentType: "post" as const,
          title: post.title ?? "",
          content: post.content ?? "",
          excerpt: post.excerpt,
          authorId: getUserIdentifier(user),
          changedFields: changedFieldNames,
        },
      );
    }

    // ── Apply patch ─────────────────────────────────────────────────────
    await ctx.db.patch("posts", args.postId, patch);

    // ── Handle taxonomy updates ─────────────────────────────────────────
    if (args.categoryIds !== undefined) {
      // Delete existing category relationships
      const existingRels = await ctx.db
        .query("termRelationships")
        .withIndex("by_post", (q) => q.eq("postId", args.postId))
        .collect();

      for (const rel of existingRels) {
        const term = await ctx.db.get("terms", rel.termId);
        if (term && term.taxonomy === "category") {
          await ctx.db.delete("termRelationships", rel._id);
        }
      }

      // Insert new category relationships
      if (args.categoryIds.length > 0) {
        for (const termId of args.categoryIds) {
          await ctx.db.insert("termRelationships", {
            postId: args.postId,
            termId,
          });
        }
      } else {
        // Ensure at least one category (default) if categoryIds is empty
        const defaultCategory = await ctx.db
          .query("terms")
          .withIndex("by_isDefault", (q) => q.eq("isDefault", true))
          .first();

        if (defaultCategory && defaultCategory.taxonomy === "category") {
          await ctx.db.insert("termRelationships", {
            postId: args.postId,
            termId: defaultCategory._id,
          });
        }
      }
    }

    if (args.tagIds !== undefined) {
      // Delete existing tag relationships
      const existingRels = await ctx.db
        .query("termRelationships")
        .withIndex("by_post", (q) => q.eq("postId", args.postId))
        .collect();

      for (const rel of existingRels) {
        const term = await ctx.db.get("terms", rel.termId);
        if (term && term.taxonomy === "post_tag") {
          await ctx.db.delete("termRelationships", rel._id);
        }
      }

      // Insert new tag relationships
      for (const termId of args.tagIds) {
        await ctx.db.insert("termRelationships", {
          postId: args.postId,
          termId,
        });
      }
    }

    // ── Emit event ──────────────────────────────────────────────────────
    if (changes.length > 0) {
      await emitEvent(ctx, POST_EVENTS.UPDATED, SYSTEM.POST, {
        postId: args.postId,
        title: (patch.title as string) ?? post.title,
        authorId: (patch.authorId as string) ?? post.authorId,
        changes,
      });
    }

    // ── Emit post.status_changed event when status transitions (C2 fix)
    const statusChange = changes.find((c) => c.field === "status");
    if (statusChange) {
      await emitEvent(ctx, POST_EVENTS.STATUS_CHANGED, SYSTEM.POST, {
        postId: args.postId,
        title: (patch.title as string) ?? post.title,
        authorId: (patch.authorId as string) ?? post.authorId,
        oldStatus: statusChange.oldValue,
        newStatus: statusChange.newValue,
      });

      // ── Emit post.scheduled event if new status is "future" (C1 fix)
      if (statusChange.newValue === "future" && patch.scheduledAt) {
        await emitEvent(ctx, POST_EVENTS.SCHEDULED, SYSTEM.POST, {
          postId: args.postId,
          title: (patch.title as string) ?? post.title,
          authorId: (patch.authorId as string) ?? post.authorId,
          scheduledFor: patch.scheduledAt,
        });
      }
    }

    return args.postId;
  },
});

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

    await ctx.db.patch("posts", args.postId, patch);

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
          await ctx.db.insert("termRelationships", {
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

    await ctx.db.patch("posts", args.postId, {
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
    await ctx.db.patch("posts", args.postId, {
      status: "future",
      scheduledAt: args.scheduledAt,
      updatedAt: now,
    });

    // Schedule the publish function
    const scheduledFnId = await ctx.scheduler.runAt(
      args.scheduledAt,
      internal.posts.internals.publishScheduled,
      { postId: args.postId },
    );

    // Store scheduled function ID in postMeta for cancellation
    const existingMeta = await ctx.db
      .query("postMeta")
      .withIndex("by_post_key", (q) =>
        q.eq("postId", args.postId).eq("key", "_scheduled_fn"),
      )
      .unique();

    if (existingMeta) {
      await ctx.db.patch("postMeta", existingMeta._id, {
        value: JSON.stringify({ functionId: scheduledFnId, scheduledAt: args.scheduledAt }),
      });
    } else {
      await ctx.db.insert("postMeta", {
        postId: args.postId,
        key: "_scheduled_fn",
        value: JSON.stringify({ functionId: scheduledFnId, scheduledAt: args.scheduledAt }),
      });
    }

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

    await ctx.db.patch("posts", args.postId, {
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

    await ctx.db.patch("posts", args.postId, {
      status: restoredStatus,
      previousStatus: undefined,
      trashedAt: undefined,
      slug: newSlug,
      updatedAt: now,
    });

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
      await ctx.db.delete("postMeta", meta._id);
    }

    // ── Delete all taxonomy relationships ────────────────────────────────
    const termRels = await ctx.db
      .query("termRelationships")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    for (const rel of termRels) {
      await ctx.db.delete("termRelationships", rel._id);
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
    await ctx.db.delete("posts", args.postId);

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
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "post.duplicate");

    const sourcePost = await ctx.db.get("posts", args.postId);
    if (!sourcePost) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Source post not found",
      });
    }

    await checkPostCapability(ctx, user as AuthUser, sourcePost as AuthPost, "read");

    const now = Date.now();
    const newTitle = `${sourcePost.title} (Copy)`;
    const newSlug = await generateUniqueSlug(ctx, newTitle, sourcePost.type as "post" | "page");

    // ── Create the duplicate post ───────────────────────────────────────
    const newPostId = await ctx.db.insert("posts", {
      type: sourcePost.type,
      title: newTitle,
      slug: newSlug,
      content: sourcePost.content,
      excerpt: sourcePost.excerpt,
      status: "draft",
      visibility: "public",
      authorId: user._id,
      featuredImageId: sourcePost.featuredImageId,
      commentStatus: sourcePost.commentStatus,
      commentCount: 0,
      isSticky: false,
      createdAt: now,
      updatedAt: now,
    });

    // ── Copy postMeta (except edit lock/last) ───────────────────────────
    const metaRecords = await ctx.db
      .query("postMeta")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    for (const meta of metaRecords) {
      if (meta.key === "_edit_lock" || meta.key === "_edit_last") continue;
      await ctx.db.insert("postMeta", {
        postId: newPostId,
        key: meta.key,
        value: meta.value,
      });
    }

    // ── Copy taxonomy assignments ───────────────────────────────────────
    const termRels = await ctx.db
      .query("termRelationships")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    for (const rel of termRels) {
      await ctx.db.insert("termRelationships", {
        postId: newPostId,
        termId: rel.termId,
        order: rel.order,
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

// ─── Autosave ───────────────────────────────────────────────────────────────

/**
 * Autosave post content.
 *
 * Updates only autosave fields. Does NOT:
 *   - Update `updatedAt` (autosave is invisible to modification tracking)
 *   - Create a revision
 *   - Emit events
 */
export const autosave = mutation({
  args: autosavePostArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const post = await ctx.db.get("posts", args.postId);
    if (!post) {
      // Silently fail if post was deleted (per knowledge doc)
      return { autosavedAt: 0 };
    }

    // Basic edit check - verify user can edit this post
    if (!isPostOwner(user, post) && (await getUserRoleLevel(ctx, user as AuthUser)) < 80) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Cannot edit this post",
      });
    }

    const now = Date.now();
    const patch: Record<string, unknown> = {
      autosavedAt: now,
    };

    if (args.title !== undefined) {
      patch.autosaveTitle = args.title;
    }
    if (args.content !== undefined) {
      patch.autosaveContent = args.content;
    }

    await ctx.db.patch("posts", args.postId, patch);

    return { autosavedAt: now };
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

        await ctx.db.patch("posts", postId, {
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

        await ctx.db.patch("posts", postId, {
          status: restoredStatus,
          previousStatus: undefined,
          trashedAt: undefined,
          slug: newSlug,
          updatedAt: now,
        });

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
          await ctx.db.delete("postMeta", meta._id);
        }

        // Delete taxonomy relationships
        const termRels = await ctx.db
          .query("termRelationships")
          .withIndex("by_post", (q) => q.eq("postId", postId))
          .collect();
        for (const rel of termRels) {
          await ctx.db.delete("termRelationships", rel._id);
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

        await ctx.db.delete("posts", postId);

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

        await ctx.db.patch("posts", postId, {
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
      await ctx.db.patch("postMeta", existing._id, { value: args.value });
      return existing._id;
    } else {
      return await ctx.db.insert("postMeta", {
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
      await ctx.db.delete("postMeta", existing._id);
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
        await ctx.db.patch("postMeta", existing._id, { value });
      } else {
        await ctx.db.insert("postMeta", {
          postId: args.postId,
          key,
          value,
        });
      }
    }

    return { success: true };
  },
});
