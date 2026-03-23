/**
 * Search System - Event Handlers
 *
 * Event listener handler functions that react to content lifecycle events
 * from other systems. These are registered as event listeners in the
 * eventListeners table and invoked by the Event Dispatcher's processEvent
 * pipeline.
 *
 * Events handled:
 *   - post.created      -> Index new post (draft, not publicly searchable yet)
 *   - post.published    -> Update index entry status to "publish"
 *   - post.updated      -> Re-index post with updated content/title/excerpt
 *   - post.trashed      -> Update index entry status to "trash"
 *   - post.deleted      -> Remove index entry entirely
 *   - post.unpublished  -> Update index entry status (hidden from public)
 *   - post.restored     -> Update index entry status (restored from trash)
 *   - page.created      -> Index new page
 *   - page.published    -> Update index entry status
 *   - page.updated      -> Re-index page
 *   - page.trashed      -> Update index entry status
 *   - page.deleted      -> Remove index entry
 *   - media.uploaded    -> Index new media item
 *   - media.updated     -> Re-index media item
 *   - media.deleted     -> Remove index entry
 *   - comment.created   -> Index new approved comment
 *   - comment.approved  -> Index newly approved comment
 *   - comment.deleted   -> Remove index entry
 *   - comment.spammed   -> Remove index entry (spam is not searchable)
 *   - taxonomy.term_updated  -> Re-index all posts with updated term
 *   - taxonomy.term_assigned -> Re-index affected post
 *   - taxonomy.term_removed  -> Re-index affected post
 *
 * Each handler receives { eventId } and reads the event payload from the database.
 * Handlers are internalMutations because they call onContentChanged which writes
 * to the searchIndex table.
 *
 * Registration:
 *   These handlers must be registered as event listeners in the eventListeners
 *   table. The Event Dispatcher System will invoke them when matching events fire.
 *   Registration is done via seed data or admin UI, not in this file.
 */

import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

// ─── Post & Page Event Handler ──────────────────────────────────────────────

/**
 * Handle post/page lifecycle events for incremental search reindexing.
 *
 * Covers: post.created, post.published, post.updated, post.trashed,
 *         post.unpublished, post.restored, page.created, page.published,
 *         page.updated, page.trashed
 *
 * These events trigger an upsert of the content into the search index.
 */
export const onPostOrPageChanged = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload);

    // Determine content type from event code
    const contentType = event.code.startsWith("page.") ? "page" : "post";

    // Extract the content ID from the payload
    const contentId = payload.postId || payload.pageId || "";
    if (!contentId) return;

    // Schedule the incremental reindex
    await ctx.scheduler.runAfter(
      0,
      internal.search.internals.onContentChanged,
      {
        contentType,
        contentId,
        action: "upsert",
      },
    );
  },
});

// ─── Post & Page Deletion Handler ───────────────────────────────────────────

/**
 * Handle post.deleted and page.deleted events.
 *
 * Removes the content from the search index entirely.
 */
export const onPostOrPageDeleted = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload);

    const contentType = event.code.startsWith("page.") ? "page" : "post";
    const contentId = payload.postId || payload.pageId || "";
    if (!contentId) return;

    await ctx.scheduler.runAfter(
      0,
      internal.search.internals.onContentChanged,
      {
        contentType,
        contentId,
        action: "delete",
      },
    );
  },
});

// ─── Media Event Handler ────────────────────────────────────────────────────

/**
 * Handle media.uploaded and media.updated events.
 *
 * Indexes or re-indexes a media item in the search index.
 */
export const onMediaChanged = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload);
    const contentId = payload.mediaId || "";
    if (!contentId) return;

    await ctx.scheduler.runAfter(
      0,
      internal.search.internals.onContentChanged,
      {
        contentType: "media",
        contentId,
        action: "upsert",
      },
    );
  },
});

/**
 * Handle media.deleted events.
 *
 * Removes the media item from the search index.
 */
export const onMediaDeleted = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload);
    const contentId = payload.mediaId || "";
    if (!contentId) return;

    await ctx.scheduler.runAfter(
      0,
      internal.search.internals.onContentChanged,
      {
        contentType: "media",
        contentId,
        action: "delete",
      },
    );
  },
});

// ─── Comment Event Handler ──────────────────────────────────────────────────

/**
 * Handle comment.created and comment.approved events.
 *
 * Indexes or re-indexes a comment in the search index.
 * Only approved comments are indexed (the onContentChanged handler
 * checks status and removes non-approved comments).
 */
export const onCommentChanged = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload);
    const contentId = payload.commentId || "";
    if (!contentId) return;

    await ctx.scheduler.runAfter(
      0,
      internal.search.internals.onContentChanged,
      {
        contentType: "comment",
        contentId,
        action: "upsert",
      },
    );
  },
});

/**
 * Handle comment.deleted and comment.spammed events.
 *
 * Removes the comment from the search index.
 * Spam comments are not searchable.
 */
export const onCommentRemoved = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload);
    const contentId = payload.commentId || "";
    if (!contentId) return;

    await ctx.scheduler.runAfter(
      0,
      internal.search.internals.onContentChanged,
      {
        contentType: "comment",
        contentId,
        action: "delete",
      },
    );
  },
});

// ─── Taxonomy Event Handlers ────────────────────────────────────────────────

/**
 * Handle taxonomy.term_assigned and taxonomy.term_removed events.
 *
 * Re-indexes the affected post to update denormalized category/tag names
 * in the search index.
 */
export const onTaxonomyTermPostChanged = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload);
    const postId = payload.postId || "";
    if (!postId) return;

    await ctx.scheduler.runAfter(
      0,
      internal.search.internals.onContentChanged,
      {
        contentType: "post",
        contentId: postId,
        action: "upsert",
      },
    );
  },
});

/**
 * Handle taxonomy.term_updated events.
 *
 * When a taxonomy term is renamed, all posts with that term need to be
 * re-indexed to update the denormalized categoryNames/tagNames arrays.
 *
 * This handler fetches all posts associated with the updated term and
 * schedules incremental reindex for each.
 */
export const onTaxonomyTermUpdated = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload);
    const termId = payload.termId || "";
    if (!termId) return;

    // Find all posts associated with this term via termRelationships
    try {
      const assignments = await ctx.db
        .query("termRelationships")
        .withIndex("by_term", (q) => q.eq("termId", termId))
        .collect();

      for (const assignment of assignments) {
        await ctx.scheduler.runAfter(
          0,
          internal.search.internals.onContentChanged,
          {
            contentType: "post",
            contentId: assignment.postId.toString(),
            action: "upsert",
          },
        );
      }
    } catch {
      // Taxonomy tables may not exist yet - graceful degradation
    }
  },
});
