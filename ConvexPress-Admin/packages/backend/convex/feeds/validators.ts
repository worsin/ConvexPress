/**
 * RSS/Feed System - Shared Argument Validators
 *
 * Reusable Convex argument validators for feed queries and actions.
 * Centralizes validation logic so queries and actions stay clean.
 *
 * Convention: each exported object is an args shape (Record<string, Validator>)
 * ready to spread into a Convex function's `args` field.
 */

import { v } from "convex/values";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default number of items per feed (matches WordPress default). */
export const DEFAULT_FEED_ITEM_COUNT = 10;

/** Maximum number of items per feed to prevent abuse. */
export const MAX_FEED_ITEM_COUNT = 100;

/** Default excerpt length in characters for feed summaries. */
export const DEFAULT_EXCERPT_LENGTH = 300;

/** Maximum items returned by fetchExternal. */
export const DEFAULT_EXTERNAL_MAX_ITEMS = 20;

/** Maximum items allowed from fetchExternal. */
export const MAX_EXTERNAL_MAX_ITEMS = 100;

/** Cache max-age for post feeds (1 hour in seconds). */
export const POST_FEED_MAX_AGE = 3600;

/** Cache max-age for comment feeds (30 minutes in seconds). */
export const COMMENT_FEED_MAX_AGE = 1800;

// ─── Feed Settings Defaults ─────────────────────────────────────────────────
// Used when the Settings System has no overrides for feed configuration.

export const FEED_SETTINGS_DEFAULTS = {
  siteTitle: "My Site",
  siteDescription: "Just another SmithHarper site",
  siteUrl: "",
  language: "en-US",
  feedItemCount: 10,
  feedContentDisplay: "full" as const,
};

// ─── Internal Query Args ────────────────────────────────────────────────────

/**
 * Arguments for fetching published posts for the main feed.
 */
export const getPublishedPostsArgs = {
  limit: v.number(),
};

/**
 * Arguments for fetching posts by category slug.
 */
export const getPostsByCategoryArgs = {
  categorySlug: v.string(),
  limit: v.number(),
};

/**
 * Arguments for fetching posts by tag slug.
 */
export const getPostsByTagArgs = {
  tagSlug: v.string(),
  limit: v.number(),
};

/**
 * Arguments for fetching posts by author slug.
 */
export const getPostsByAuthorArgs = {
  authorSlug: v.string(),
  limit: v.number(),
};

/**
 * Arguments for fetching recent approved comments.
 */
export const getRecentCommentsArgs = {
  limit: v.number(),
};

/**
 * Arguments for fetching approved comments on a specific post.
 */
export const getPostCommentsArgs = {
  postSlug: v.string(),
  limit: v.number(),
};

// ─── Action Args ────────────────────────────────────────────────────────────

/**
 * Arguments for the fetchExternal action (admin-only external feed parser).
 */
export const fetchExternalArgs = {
  url: v.string(),
  maxItems: v.optional(v.number()),
};
