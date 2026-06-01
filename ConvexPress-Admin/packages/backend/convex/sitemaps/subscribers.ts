/**
 * Sitemap System - Event Subscribers
 *
 * Registers event listeners for content change events that should trigger
 * sitemap regeneration. Each subscriber calls the internal `markStale`
 * mutation with the appropriate sitemap types to invalidate.
 *
 * These subscribers are registered with the Event Dispatcher System.
 * When content changes (posts published, pages updated, taxonomies modified),
 * the appropriate sitemaps are marked stale, and debounced regeneration
 * is scheduled automatically.
 *
 * Event-to-stale-type mapping:
 *   - Post events -> mark posts, categories, tags, authors stale
 *   - Page events -> mark pages stale
 *   - Taxonomy events -> mark categories or tags stale
 *
 * Note: These are internal mutations that are called by the Event Dispatcher
 * System's processEvent pipeline. They are NOT client-callable.
 *
 * The Event Dispatcher System matches event codes to registered listeners
 * in the eventListeners table. These subscribers need to be registered
 * as listener records in that table (via seed data or admin UI).
 *
 * For ConvexPress, event listeners are registered as entries in the
 * eventListeners table. Each listener has:
 *   - eventCode: The event pattern to match (e.g., "post.published")
 *   - handlerRef: Reference to the internal function to call
 *   - system: The owning system slug ("sitemap")
 *
 * Since event listeners are processed through the Event Dispatcher's
 * internal pipeline (processEvent -> execute listener), we provide
 * the handler functions here. The actual registration in the
 * eventListeners table is done via seed data.
 *
 * For this implementation, the approach is to provide internal mutations
 * that can be called directly by the Event Dispatcher when processing events.
 */

import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { isSitemapEnabled } from "./helpers/settings";

async function markCoursesStale(ctx: any) {
  if (!(await isSitemapEnabled(ctx))) return;

  await ctx.scheduler.runAfter(
    0,
    internal.sitemaps.mutations.markStale,
    { types: ["courses"] },
  );
}

// ─── Post Event Subscribers ─────────────────────────────────────────────────

/**
 * Handle post.published event.
 * When a post is published, mark posts, categories, tags, and authors stale
 * since the post may appear in any of those sitemaps.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onPostPublished = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    eventId: v.optional(v.id("events")),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    payload: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isSitemapEnabled(ctx))) return;

    await ctx.scheduler.runAfter(
      0,
      internal.sitemaps.mutations.markStale,
      { types: ["posts", "categories", "tags", "authors"] },
    );
  },
});

/**
 * Handle post.unpublished event.
 * When a post is unpublished, it needs to be removed from all sitemaps.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onPostUnpublished = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    eventId: v.optional(v.id("events")),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    payload: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isSitemapEnabled(ctx))) return;

    await ctx.scheduler.runAfter(
      0,
      internal.sitemaps.mutations.markStale,
      { types: ["posts", "categories", "tags", "authors"] },
    );
  },
});

/**
 * Handle post.updated event.
 * When a published post is updated, mark posts stale (slug/title may have changed).
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onPostUpdated = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    eventId: v.optional(v.id("events")),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    payload: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isSitemapEnabled(ctx))) return;

    await ctx.scheduler.runAfter(
      0,
      internal.sitemaps.mutations.markStale,
      { types: ["posts"] },
    );
  },
});

/**
 * Handle post.trashed event.
 * When a post is trashed, it needs to be removed from all sitemaps.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onPostTrashed = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    eventId: v.optional(v.id("events")),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    payload: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isSitemapEnabled(ctx))) return;

    await ctx.scheduler.runAfter(
      0,
      internal.sitemaps.mutations.markStale,
      { types: ["posts", "categories", "tags", "authors"] },
    );
  },
});

/**
 * Handle post.restored event.
 * When a post is restored from trash, it may need to appear in sitemaps again.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onPostRestored = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    eventId: v.optional(v.id("events")),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    payload: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isSitemapEnabled(ctx))) return;

    await ctx.scheduler.runAfter(
      0,
      internal.sitemaps.mutations.markStale,
      { types: ["posts", "categories", "tags", "authors"] },
    );
  },
});

/**
 * Handle post.deleted event.
 * When a post is permanently deleted, clean up all sitemaps that could be affected
 * (the deleted post may have been the last one in a category/tag/author).
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onPostDeleted = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    eventId: v.optional(v.id("events")),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    payload: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isSitemapEnabled(ctx))) return;

    await ctx.scheduler.runAfter(
      0,
      internal.sitemaps.mutations.markStale,
      { types: ["posts", "categories", "tags", "authors"] },
    );
  },
});

// ─── Page Event Subscribers ─────────────────────────────────────────────────

/**
 * Handle page.published event.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onPagePublished = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    eventId: v.optional(v.id("events")),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    payload: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isSitemapEnabled(ctx))) return;

    await ctx.scheduler.runAfter(
      0,
      internal.sitemaps.mutations.markStale,
      { types: ["pages"] },
    );
  },
});

/**
 * Handle page.unpublished event (page status changed away from publish).
 * Uses the closest available event: page.updated with status check.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onPageUnpublished = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    eventId: v.optional(v.id("events")),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    payload: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isSitemapEnabled(ctx))) return;

    await ctx.scheduler.runAfter(
      0,
      internal.sitemaps.mutations.markStale,
      { types: ["pages"] },
    );
  },
});

/**
 * Handle page.updated event.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onPageUpdated = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    eventId: v.optional(v.id("events")),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    payload: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isSitemapEnabled(ctx))) return;

    await ctx.scheduler.runAfter(
      0,
      internal.sitemaps.mutations.markStale,
      { types: ["pages"] },
    );
  },
});

/**
 * Handle page.trashed event.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onPageTrashed = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    eventId: v.optional(v.id("events")),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    payload: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isSitemapEnabled(ctx))) return;

    await ctx.scheduler.runAfter(
      0,
      internal.sitemaps.mutations.markStale,
      { types: ["pages"] },
    );
  },
});

/**
 * Handle page.deleted event.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onPageDeleted = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    eventId: v.optional(v.id("events")),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    payload: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isSitemapEnabled(ctx))) return;

    await ctx.scheduler.runAfter(
      0,
      internal.sitemaps.mutations.markStale,
      { types: ["pages"] },
    );
  },
});

// ─── LMS Course Event Subscribers ───────────────────────────────────────────

/**
 * Handle LMS course lifecycle/content events that can change public course URLs
 * or remove course landing pages from search-engine discovery.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onLmsCourseChanged = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    eventId: v.optional(v.id("events")),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    payload: v.optional(v.string()),
  },
  handler: markCoursesStale,
});

// ─── Taxonomy Event Subscribers ─────────────────────────────────────────────

/**
 * Handle taxonomy.category_created event.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onTaxonomyCategoryCreated = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    eventId: v.optional(v.id("events")),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    payload: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isSitemapEnabled(ctx))) return;

    await ctx.scheduler.runAfter(
      0,
      internal.sitemaps.mutations.markStale,
      { types: ["categories"] },
    );
  },
});

/**
 * Handle taxonomy.category_deleted event.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onTaxonomyCategoryDeleted = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    eventId: v.optional(v.id("events")),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    payload: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isSitemapEnabled(ctx))) return;

    await ctx.scheduler.runAfter(
      0,
      internal.sitemaps.mutations.markStale,
      { types: ["categories"] },
    );
  },
});

/**
 * Handle taxonomy.tag_created event.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onTaxonomyTagCreated = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    eventId: v.optional(v.id("events")),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    payload: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isSitemapEnabled(ctx))) return;

    await ctx.scheduler.runAfter(
      0,
      internal.sitemaps.mutations.markStale,
      { types: ["tags"] },
    );
  },
});

/**
 * Handle taxonomy.category_updated event.
 * When a category slug changes, the category sitemap URL changes.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onTaxonomyCategoryUpdated = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    eventId: v.optional(v.id("events")),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    payload: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isSitemapEnabled(ctx))) return;

    await ctx.scheduler.runAfter(
      0,
      internal.sitemaps.mutations.markStale,
      { types: ["categories"] },
    );
  },
});

/**
 * Handle taxonomy.tag_updated event.
 * When a tag slug changes, the tag sitemap URL changes.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onTaxonomyTagUpdated = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    eventId: v.optional(v.id("events")),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    payload: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isSitemapEnabled(ctx))) return;

    await ctx.scheduler.runAfter(
      0,
      internal.sitemaps.mutations.markStale,
      { types: ["tags"] },
    );
  },
});

/**
 * Handle taxonomy.tag_deleted event.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const onTaxonomyTagDeleted = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    eventId: v.optional(v.id("events")),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    payload: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isSitemapEnabled(ctx))) return;

    await ctx.scheduler.runAfter(
      0,
      internal.sitemaps.mutations.markStale,
      { types: ["tags"] },
    );
  },
});
