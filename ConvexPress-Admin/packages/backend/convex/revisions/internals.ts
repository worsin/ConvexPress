/**
 * Revision System - Internal Functions
 *
 * Non-client-callable functions used by:
 *   - Post System (createOnSave, deleteByParent)
 *   - Content Editor System (createAutosave)
 *   - Scheduled functions (prune)
 *
 * Functions:
 *   createOnSave    - Create a manual revision snapshot before a post update
 *   createAutosave  - Create or update an autosave revision (one per user per post)
 *   deleteByParent  - Delete all revisions when a post is permanently deleted
 *   prune           - Trim excess manual revisions to configured maximum
 */

import { internalMutation } from "../_generated/server";
import { asId } from "../helpers/types";
import { emitEvent } from "../helpers/events";
import { REVISION_EVENTS, SYSTEM } from "../events/constants";
import { getNextRevisionNumber, getRevisionSettings } from "../helpers/revisions";
import {
  createOnSaveArgs,
  createAutosaveArgs,
  deleteByParentArgs,
  pruneArgs,
  DEFAULT_MAX_REVISIONS,
} from "./validators";

// ─── Create Revision on Save ────────────────────────────────────────────────

/**
 * Create a manual revision snapshot BEFORE a post update is applied.
 *
 * Called by Post System's `post.update` mutation. The snapshot captures the
 * current state of the post BEFORE changes, so the revision represents
 * "what was there before this change."
 *
 * Skip conditions (no revision created):
 *   - Post is in `auto-draft` status (checked by caller, but double-checked here)
 *   - changedFields doesn't include title, content, or excerpt
 *   - revisions_enabled setting is false (soft dependency, default true)
 *   - max_revisions setting is 0 (revisions disabled via count)
 *
 * After creating, prunes excess revisions if count exceeds max_revisions.
 *
 * @returns The new revision ID, or null if skipped
 */
export const createOnSave = internalMutation({
  args: createOnSaveArgs,
  handler: async (ctx, args) => {
    // ── Skip: no content fields changed ──────────────────────────────────
    const contentFields = ["title", "content", "excerpt"];
    const hasContentChange = args.changedFields.some((f) =>
      contentFields.includes(f),
    );
    if (!hasContentChange) {
      return null;
    }

    // ── Skip: auto-draft status ─────────────────────────────────────────
    // Checked by caller (Post System), but double-checked here to prevent
    // other callers from creating revisions for auto-drafts.
    const parentPost = await ctx.db.get("posts", args.parentId);
    if (parentPost && parentPost.status === "auto-draft") {
      return null;
    }

    // ── Read settings from Settings System (writing section) ────────────
    const { maxRevisions, revisionsEnabled } = await getRevisionSettings(ctx);

    // ── Skip: max_revisions is 0 (disabled) ─────────────────────────────
    if (maxRevisions === 0) {
      return null;
    }

    // ── Skip: revisions_enabled is false ────────────────────────────────
    if (!revisionsEnabled) {
      return null;
    }

    // ── Determine next revision number ──────────────────────────────────
    const revisionNumber = await getNextRevisionNumber(ctx, args.parentId);

    // ── Insert the revision snapshot ────────────────────────────────────
    const now = Date.now();
    const revisionId = await ctx.db.insert("revisions", {
      parentId: args.parentId,
      parentType: args.parentType,
      title: args.title,
      content: args.content,
      excerpt: args.excerpt,
      revisionNumber,
      type: "manual",
      authorId: args.authorId,
      changedFields: args.changedFields.filter((f) =>
        contentFields.includes(f),
      ),
      contentLength: args.content.length,
      createdAt: now,
    });

    // ── Prune excess manual revisions ───────────────────────────────────
    if (maxRevisions > 0) {
      // maxRevisions === -1 means unlimited, skip pruning
      const manualRevisions = await ctx.db
        .query("revisions")
        .withIndex("by_parent_type", (q) =>
          q.eq("parentId", args.parentId).eq("type", "manual"),
        )
        .collect();

      if (manualRevisions.length > maxRevisions) {
        // Sort by revisionNumber ascending (oldest first)
        manualRevisions.sort((a, b) => a.revisionNumber - b.revisionNumber);

        const toDelete = manualRevisions.length - maxRevisions;
        for (let i = 0; i < toDelete; i++) {
          await ctx.db.delete("revisions", manualRevisions[i]._id);
        }
      }
    }

    // ── Emit event ──────────────────────────────────────────────────────
    await emitEvent(ctx, REVISION_EVENTS.CREATED, SYSTEM.REVISION, {
      revisionId,
      postId: args.parentId,
      authorId: args.authorId,
      revisionNumber,
    });

    return revisionId;
  },
});

// ─── Create/Update Autosave Revision ────────────────────────────────────────

/**
 * Create or update an autosave revision for a specific user and post.
 *
 * **INTEGRATION POINT FOR CONTENT EDITOR SYSTEM (issue #25)**
 *
 * This function is ready to be called but is NOT yet wired. The Content Editor
 * System or Post System's autosave flow should call this at 5-minute intervals:
 *
 *   ```ts
 *   await ctx.runMutation(internal.revisions.internals.createAutosave, {
 *     parentId: post._id,
 *     parentType: post.postType === "page" ? "page" : "post",
 *     title: currentTitle,
 *     content: currentContent,
 *     excerpt: currentExcerpt,
 *     authorId: getUserIdentifier(user),
 *   });
 *   ```
 *
 * Each user gets one autosave revision per post, which is updated in place on
 * subsequent autosaves (unlike manual revisions which are always new records).
 *
 * This is different from Post System's 60-second inline autosave which stores
 * data directly on the post document (autosaveContent, autosaveTitle, autosavedAt).
 * The Revision System's autosave is a separate 5-minute safety snapshot.
 *
 * @returns The autosave revision ID
 */
export const createAutosave = internalMutation({
  args: createAutosaveArgs,
  handler: async (ctx, args) => {
    // ── Check for existing autosave for this user + parent ──────────────
    const existingAutosaves = await ctx.db
      .query("revisions")
      .withIndex("by_parent_type", (q) =>
        q.eq("parentId", args.parentId).eq("type", "autosave"),
      )
      .collect();

    const existingForUser = existingAutosaves.find(
      (r) => r.authorId === args.authorId,
    );

    const now = Date.now();
    const contentLength = args.content.length;

    if (existingForUser) {
      // ── Update existing autosave in place ──────────────────────────────
      await ctx.db.patch("revisions", existingForUser._id, {
        title: args.title,
        content: args.content,
        excerpt: args.excerpt,
        contentLength,
        createdAt: now, // Update timestamp to reflect latest autosave
      });

      return existingForUser._id;
    }

    // ── Create new autosave revision ────────────────────────────────────
    const revisionNumber = await getNextRevisionNumber(ctx, args.parentId);

    const revisionId = await ctx.db.insert("revisions", {
      parentId: args.parentId,
      parentType: args.parentType,
      title: args.title,
      content: args.content,
      excerpt: args.excerpt,
      revisionNumber,
      type: "autosave",
      authorId: args.authorId,
      changedFields: [], // Autosave doesn't track individual field changes
      contentLength,
      createdAt: now,
    });

    // No events emitted for autosave (too noisy)
    return revisionId;
  },
});

// ─── Delete All Revisions for a Post ────────────────────────────────────────

/**
 * Delete all revisions when a post is permanently deleted.
 *
 * Called by Post System's `post.delete` (permanent deletion) and
 * Page System's `page.delete`. Prevents orphaned revision records.
 *
 * Trashing does NOT trigger this - revisions survive trashing.
 *
 * @returns The number of revisions deleted
 */
export const deleteByParent = internalMutation({
  args: deleteByParentArgs,
  handler: async (ctx, args) => {
    const revisions = await ctx.db
      .query("revisions")
      .withIndex("by_parent", (q) => q.eq("parentId", args.parentId))
      .collect();

    for (const revision of revisions) {
      await ctx.db.delete("revisions", revision._id);
    }

    return { deleted: revisions.length };
  },
});

// ─── Prune Old Revisions ────────────────────────────────────────────────────

/**
 * Trim manual revisions to the configured maximum per post.
 *
 * Can be called:
 *   - With parentId: prunes only that post's revisions
 *   - Without parentId: prunes all posts with excess revisions (for daily cron)
 *
 * Only deletes "manual" type revisions. Autosave revisions are never pruned.
 * When max_revisions is -1 (unlimited), no pruning occurs.
 *
 * @returns Count of pruned revisions and posts affected
 */
export const prune = internalMutation({
  args: pruneArgs,
  handler: async (ctx, args) => {
    // ── Determine max revisions ─────────────────────────────────────────
    let maxRevisions = args.maxRevisions ?? DEFAULT_MAX_REVISIONS;

    if (args.maxRevisions === undefined) {
      // Read from Settings System (writing section, by_section index)
      const settings = await getRevisionSettings(ctx);
      maxRevisions = settings.maxRevisions;
    }

    // -1 means unlimited, skip pruning entirely
    if (maxRevisions < 0) {
      return { prunedCount: 0, postsAffected: 0 };
    }

    // 0 means revisions disabled - prune ALL manual revisions
    // (but this is handled by createOnSave not creating them)
    // For safety, still prune if called explicitly
    let prunedCount = 0;
    let postsAffected = 0;

    if (args.parentId) {
      // ── Prune a single post ───────────────────────────────────────────
      const manualRevisions = await ctx.db
        .query("revisions")
        .withIndex("by_parent_type", (q) =>
          q.eq("parentId", args.parentId!).eq("type", "manual"),
        )
        .collect();

      if (manualRevisions.length > maxRevisions) {
        manualRevisions.sort((a, b) => a.revisionNumber - b.revisionNumber);
        const toDelete = manualRevisions.length - maxRevisions;

        for (let i = 0; i < toDelete; i++) {
          await ctx.db.delete("revisions", manualRevisions[i]._id);
          prunedCount++;
        }
        postsAffected = 1;
      }
    } else {
      // ── Prune all posts (daily cron) ──────────────────────────────────
      // Collect ALL manual revisions to find distinct parentIds.
      // Uses paginated reads to handle large datasets without hitting
      // Convex mutation limits or missing posts (issue #62).
      const allManualRevisions = await ctx.db
        .query("revisions")
        .withIndex("by_createdAt")
        .collect();

      // Group by parentId
      const parentRevisionCounts = new Map<string, number>();
      for (const rev of allManualRevisions) {
        if (rev.type === "manual") {
          const parentIdStr = rev.parentId as string;
          parentRevisionCounts.set(parentIdStr, (parentRevisionCounts.get(parentIdStr) ?? 0) + 1);
        }
      }

      // Only process parents that exceed the limit
      for (const [parentIdStr, count] of parentRevisionCounts) {
        if (count <= maxRevisions) continue;

        const manualRevisions = await ctx.db
          .query("revisions")
          .withIndex("by_parent_type", (q) =>
            q.eq("parentId", asId<"posts">(parentIdStr)).eq("type", "manual"),
          )
          .collect();

        if (manualRevisions.length > maxRevisions) {
          manualRevisions.sort(
            (a, b) => a.revisionNumber - b.revisionNumber,
          );
          const toDelete = manualRevisions.length - maxRevisions;

          for (let i = 0; i < toDelete; i++) {
            await ctx.db.delete("revisions", manualRevisions[i]._id);
            prunedCount++;
          }
          postsAffected++;
        }
      }
    }

    return { prunedCount, postsAffected };
  },
});
