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
 * For SmithHarper, event listeners are registered as entries in the
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

// ─── Post Event Subscribers ─────────────────────────────────────────────────

/**
 * Handle post.published event.
 * When a post is published, mark posts, categories, tags, and authors stale
 * since the post may appear in any of those sitemaps.
 */
export const onPostPublished = internalMutation({
  args: {
    eventId: v.optional(v.id("events")),
    payload: v.optional(v.string()),
  },
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
export const onPostUnpublished = internalMutation({
  args: {
    eventId: v.optional(v.id("events")),
    payload: v.optional(v.string()),
  },
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
export const onPostUpdated = internalMutation({
  args: {
    eventId: v.optional(v.id("events")),
    payload: v.optional(v.string()),
  },
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
export const onPostTrashed = internalMutation({
  args: {
    eventId: v.optional(v.id("events")),
    payload: v.optional(v.string()),
  },
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
export const onPostRestored = internalMutation({
  args: {
    eventId: v.optional(v.id("events")),
    payload: v.optional(v.string()),
  },
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
export const onPostDeleted = internalMutation({
  args: {
    eventId: v.optional(v.id("events")),
    payload: v.optional(v.string()),
  },
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
export const onPagePublished = internalMutation({
  args: {
    eventId: v.optional(v.id("events")),
    payload: v.optional(v.string()),
  },
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
export const onPageUnpublished = internalMutation({
  args: {
    eventId: v.optional(v.id("events")),
    payload: v.optional(v.string()),
  },
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
export const onPageUpdated = internalMutation({
  args: {
    eventId: v.optional(v.id("events")),
    payload: v.optional(v.string()),
  },
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
export const onPageTrashed = internalMutation({
  args: {
    eventId: v.optional(v.id("events")),
    payload: v.optional(v.string()),
  },
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
export const onPageDeleted = internalMutation({
  args: {
    eventId: v.optional(v.id("events")),
    payload: v.optional(v.string()),
  },
  handler: async (ctx) => {
    if (!(await isSitemapEnabled(ctx))) return;

    await ctx.scheduler.runAfter(
      0,
      internal.sitemaps.mutations.markStale,
      { types: ["pages"] },
    );
  },
});

// ─── Taxonomy Event Subscribers ─────────────────────────────────────────────

/**
 * Handle taxonomy.category_created event.
 */
export const onTaxonomyCategoryCreated = internalMutation({
  args: {
    eventId: v.optional(v.id("events")),
    payload: v.optional(v.string()),
  },
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
export const onTaxonomyCategoryDeleted = internalMutation({
  args: {
    eventId: v.optional(v.id("events")),
    payload: v.optional(v.string()),
  },
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
export const onTaxonomyTagCreated = internalMutation({
  args: {
    eventId: v.optional(v.id("events")),
    payload: v.optional(v.string()),
  },
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
export const onTaxonomyCategoryUpdated = internalMutation({
  args: {
    eventId: v.optional(v.id("events")),
    payload: v.optional(v.string()),
  },
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
export const onTaxonomyTagUpdated = internalMutation({
  args: {
    eventId: v.optional(v.id("events")),
    payload: v.optional(v.string()),
  },
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
export const onTaxonomyTagDeleted = internalMutation({
  args: {
    eventId: v.optional(v.id("events")),
    payload: v.optional(v.string()),
  },
  handler: async (ctx) => {
    if (!(await isSitemapEnabled(ctx))) return;

    await ctx.scheduler.runAfter(
      0,
      internal.sitemaps.mutations.markStale,
      { types: ["tags"] },
    );
  },
});
