/**
 * Revision System - Mutations
 *
 * All write operations for revisions:
 *   restore       - Restore a revision (copy content back to parent post)
 *   deleteRevision - Delete a specific revision (Admin only)
 *
 * Authorization:
 *   - restore: revision.restore + post.update (ownership-aware, Editor+)
 *   - deleteRevision: revision.delete (Administrator only)
 *
 * NOTE: Revision creation is handled by internal functions (createOnSave,
 * createAutosave) called by the Post System and Content Editor System.
 * Clients do not create revisions directly.
 *
 * NOTE: deleteAllForPost was moved to internals.ts as `deleteByParent`
 * to avoid duplication (issue #59).
 */

import { ConvexError } from "convex/values";
import { mutation } from "../_generated/server";
import { requireCan , getUserIdentifier } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { REVISION_EVENTS, SYSTEM } from "../events/constants";
import { getNextRevisionNumber, getRevisionSettings, requireRevisionAccess } from "../helpers/revisions";
import {
  restoreRevisionArgs,
  deleteRevisionArgs,
} from "./validators";

// ─── Restore ────────────────────────────────────────────────────────────────

/**
 * Restore a revision by copying its snapshot data back to the parent post.
 *
 * Flow:
 *   1. Validate revision and parent post exist
 *   2. Check capabilities: revision.restore + post.update
 *   3. Verify post is not in trash (must restore from trash first)
 *   4. Create a NEW revision of the post's CURRENT state (safety net)
 *   5. Copy revision's title, content, excerpt back to parent
 *   6. Clear autosave fields on parent
 *   7. Prune excess revisions if needed
 *   8. Emit revision.restored event
 *
 * The safety-net revision ensures the current state is never lost.
 * Users can always "undo" a restore by restoring the safety-net revision.
 *
 * @returns The updated parent post ID
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const restore = mutation({
  args: restoreRevisionArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // ── Auth: require revision.restore capability ────────────────────────
    const user = await requireCan(ctx, "revision.restore");

    // ── Fetch the revision ──────────────────────────────────────────────
    const revision = await ctx.db.get("revisions", args.revisionId);
    if (!revision) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Revision not found",
      });
    }

    // ── Fetch the parent post ───────────────────────────────────────────
    const post = await ctx.db.get("posts", revision.parentId);
    if (!post) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Parent post no longer exists",
      });
    }

    // ── Check post is not in trash ──────────────────────────────────────
    if (post.status === "trash") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Cannot restore revision on a trashed post. Restore the post from trash first.",
      });
    }

    // ── Ownership-aware edit check ──────────────────────────────────────
    // Uses shared helper from helpers/revisions.ts to avoid permission drift
    await requireRevisionAccess(ctx, user, post, "post.update");

    // ── Get the user identifier for this user ────────────────────────────
    const authorId = getUserIdentifier(user);

    // ── Step 1: Create a safety-net revision of the CURRENT state ───────
    const currentRevisionNumber = await getNextRevisionNumber(
      ctx,
      revision.parentId,
    );

    // Determine which fields will change
    const changedFields: string[] = [];
    if (revision.title !== post.title) changedFields.push("title");
    if (revision.content !== (post.content ?? "")) changedFields.push("content");
    if ((revision.excerpt ?? "") !== (post.excerpt ?? "")) changedFields.push("excerpt");

    await ctx.db.insert("revisions", {
      parentId: revision.parentId,
      parentType: revision.parentType,
      title: post.title,
      content: post.content ?? "",
      excerpt: post.excerpt,
      revisionNumber: currentRevisionNumber,
      type: "manual",
      authorId: authorId,
      changedFields,
      contentLength: (post.content ?? "").length,
      createdAt: Date.now(),
    });

    // ── Step 2: Copy revision snapshot fields to parent post ────────────
    const now = Date.now();
    await ctx.db.patch("posts", revision.parentId, {
      title: revision.title,
      content: revision.content,
      excerpt: revision.excerpt,
      updatedAt: now,
      // Clear autosave fields
      autosaveContent: undefined,
      autosaveTitle: undefined,
      autosavedAt: undefined,
    });

    // ── Step 3: Prune excess revisions ──────────────────────────────────
    const { maxRevisions } = await getRevisionSettings(ctx);

    if (maxRevisions > 0) {
      const manualRevisions = await ctx.db
        .query("revisions")
        .withIndex("by_parent_type", (q: ConvexQueryBuilder) =>
          q.eq("parentId", revision.parentId).eq("type", "manual"),
        )
        .collect();

      if (manualRevisions.length > maxRevisions) {
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        manualRevisions.sort((a, b) => a.revisionNumber - b.revisionNumber);
        const toDelete = manualRevisions.length - maxRevisions;
        for (let i = 0; i < toDelete; i++) {
          await ctx.db.delete("revisions", manualRevisions[i]._id);
        }
      }
    }

    // ── Step 4: Emit event ──────────────────────────────────────────────
    await emitEvent(ctx, REVISION_EVENTS.RESTORED, SYSTEM.REVISION, {
      revisionId: args.revisionId,
      postId: revision.parentId,
      restoredBy: authorId,
      revisionNumber: revision.revisionNumber,
      previousRevisionNumber: currentRevisionNumber,
    });

    return revision.parentId;
  },
});

// ─── Delete Single Revision ─────────────────────────────────────────────────

/**
 * Delete a specific revision.
 *
 * Administrator-only operation. Used for cleanup or removing
 * sensitive content from revision history.
 *
 * No event emitted (revision deletion is a cleanup operation).
 *
 * @returns Success indicator
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const deleteRevision = mutation({
  args: deleteRevisionArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // ── Auth: require revision.delete capability (Admin only) ────────────
    await requireCan(ctx, "revision.delete");

    // ── Fetch the revision ──────────────────────────────────────────────
    const revision = await ctx.db.get("revisions", args.revisionId);
    if (!revision) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Revision not found",
      });
    }

    // ── Delete ──────────────────────────────────────────────────────────
    await ctx.db.delete("revisions", args.revisionId);

    return { success: true };
  },
});

// NOTE: deleteAllForPost lives in internals.ts as `deleteByParent`.
// It was previously duplicated here as a public internalMutation.
// Removed to eliminate duplication (issue #59). Use internal.revisions.internals.deleteByParent.
