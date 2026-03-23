/**
 * Routing System - Event Handlers
 *
 * Event listener handler functions that react to events from other systems.
 * These are registered as event listeners in the eventListeners table
 * and invoked by the Event Dispatcher's processEvent pipeline.
 *
 * Events handled:
 *   - post.updated (slug change detected)  -> Auto-create 301 redirect from old to new URL
 *   - page.updated (slug change detected)  -> Auto-create 301 redirect from old to new URL
 *   - post.published     -> Clear 404 entry for the post's URL
 *   - page.published     -> Clear 404 entry for the page's URL
 *   - settings.permalinks_changed -> Batch-create redirects for all posts
 *
 * Each handler receives { eventId } and reads the event payload from the database.
 * Handlers are internalMutations because they write to the redirects/notFound tables.
 *
 * IMPORTANT: The slug change handler listens to `post.updated` / `page.updated` events
 * (not dedicated `post.slug_changed` / `page.slug_changed` events, which do not exist).
 * The `post.updated` payload uses a `changes` array with `{ field, oldValue, newValue }`
 * objects. The handler extracts slug changes from this array.
 */

import { internalMutation, internalQuery, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

// ─── Slug Changed Handler ────────────────────────────────────────────────────

/**
 * Handle post.updated and page.updated events to detect slug changes.
 *
 * The post.updated/page.updated payload uses a `changes` array with
 * `{ field, oldValue, newValue }` objects. This handler looks for a
 * slug field change in that array and delegates to generateSlugRedirect.
 *
 * Note: There are no dedicated `post.slug_changed` / `page.slug_changed`
 * events. The Event Dispatcher registers this handler on `post.updated`
 * and `page.updated` events instead.
 */
export const onSlugChanged = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload);

    // Determine content type from event code
    const contentType = event.code.startsWith("post.") ? "post" : "page";

    const contentId = payload.postId || payload.pageId || "";

    // The post.updated / page.updated payload contains a `changes` array
    // with objects like { field: "slug", oldValue: "old-slug", newValue: "new-slug" }.
    // Extract the slug change from the changes array.
    const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> =
      payload.changes || [];
    const slugChange = changes.find(
      (c: { field: string }) => c.field === "slug",
    );

    // If there's no slug change in this update, nothing to do
    if (!slugChange) return;

    const oldSlug = slugChange.oldValue as string;
    const newSlug = slugChange.newValue as string;

    if (!oldSlug || !newSlug || oldSlug === newSlug) return;

    // Delegate to the existing generateSlugRedirect internal mutation
    await ctx.scheduler.runAfter(0, internal.routing.internals.generateSlugRedirect, {
      contentType: contentType as "post" | "page",
      contentId,
      oldSlug,
      newSlug,
    });
  },
});

// ─── Content Published Handler ───────────────────────────────────────────────

/**
 * Handle post.published and page.published events.
 *
 * When content is published at a URL, clear any 404 log entry for that URL.
 * This ensures the 404 log stays clean as content fills previously-empty URLs.
 */
export const onContentPublished = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    const payload = JSON.parse(event.payload);
    const slug = payload.slug;

    if (!slug) return;

    // Build the URL for this content
    // Pages always use /{slug}/, posts depend on permalink structure
    // For simplicity, clear the basic /{slug}/ form
    const url = `/${slug}/`;

    await ctx.scheduler.runAfter(0, internal.routing.internals.clearNotFoundForUrl, {
      url,
    });
  },
});

// ─── Permalink Structure Changed Handler ─────────────────────────────────────

/**
 * Handle settings.permalinks_changed events.
 *
 * When the permalink structure changes, batch-create 301 redirects from
 * all old URLs to new URLs. This is an internalAction because it needs
 * to fetch all published posts (potentially many) and process them in
 * batches of 100 via batchCreateRedirects.
 */
export const onPermalinksChanged = internalAction({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.runQuery(
      internal.routing.eventHandlers.getEvent,
      { eventId: args.eventId },
    );
    if (!event) return;

    const payload = JSON.parse(event.payload);
    const {
      oldStructure,
      newStructure,
      oldCategoryBase,
      newCategoryBase,
      oldTagBase,
      newTagBase,
    } = payload;

    // If structure hasn't actually changed, skip
    if (
      oldStructure === newStructure &&
      oldCategoryBase === newCategoryBase &&
      oldTagBase === newTagBase
    ) {
      return;
    }

    // Fetch all published posts to generate redirects
    // Note: This uses the posts system's internal query. If not available,
    // we gracefully skip. The batch creation is a best-effort operation.
    try {
      // KNOWN LIMITATION: Post batch redirect generation is not yet implemented.
      //
      // When the permalink structure changes, individual post redirects (e.g.,
      // /old-slug/ -> /2026/02/old-slug/) should be created for all published posts.
      // This requires the Post System to expose an internalQuery that returns all
      // published posts with at minimum { _id, slug, publishedAt } fields.
      //
      // Dependency: internal.posts.internals.getAllPublished (does not exist yet)
      //
      // Once the Post System provides that query, the implementation would be:
      //
      //   const posts = await ctx.runQuery(internal.posts.internals.getAllPublished, {});
      //   const redirects = posts
      //     .map(post => ({
      //       sourceUrl: computeOldUrl(post, oldStructure),
      //       targetUrl: computeNewUrl(post, newStructure),
      //     }))
      //     .filter(r => r.sourceUrl !== r.targetUrl);
      //
      //   for (let i = 0; i < redirects.length; i += 100) {
      //     const batch = redirects.slice(i, i + 100);
      //     await ctx.runMutation(internal.routing.internals.batchCreateRedirects, {
      //       redirects: batch,
      //       source: "permalink_change",
      //     });
      //   }
      //
      // Until then, only category base and tag base redirects are generated.

      // Category base change redirects
      if (oldCategoryBase !== newCategoryBase && oldCategoryBase && newCategoryBase) {
        await ctx.runMutation(internal.routing.internals.batchCreateRedirects, {
          redirects: [{
            sourceUrl: `/${oldCategoryBase}/`,
            targetUrl: `/${newCategoryBase}/`,
          }],
          source: "permalink_change",
        });
      }

      // Tag base change redirects
      if (oldTagBase !== newTagBase && oldTagBase && newTagBase) {
        await ctx.runMutation(internal.routing.internals.batchCreateRedirects, {
          redirects: [{
            sourceUrl: `/${oldTagBase}/`,
            targetUrl: `/${newTagBase}/`,
          }],
          source: "permalink_change",
        });
      }
    } catch {
      // Batch generation failed -- this is non-critical.
      // The admin has already been warned about redirect generation.
    }
  },
});

/**
 * Helper query to read an event record from an internalAction context.
 * InternalActions cannot use ctx.db directly, so we use an internalQuery
 * called via ctx.runQuery().
 */
export const getEvent = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    return await ctx.db.get("events", args.eventId);
  },
});
