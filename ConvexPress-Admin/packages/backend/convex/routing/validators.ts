/**
 * Routing System - Shared Argument Validators
 *
 * Reusable Convex argument validators for routing mutations and queries.
 * Centralizes validation logic so mutations and queries stay clean.
 *
 * Convention: each exported object is an args shape (Record<string, Validator>)
 * ready to spread into a Convex function's `args` field.
 */

import { v } from "convex/values";
import {
  redirectStatusCodeValidator,
  redirectSourceValidator,
  redirectMatchTypeValidator,
  redirectContentTypeValidator,
} from "../schema/routing";

// ─── Re-exports for convenience ──────────────────────────────────────────────

export {
  redirectStatusCodeValidator,
  redirectSourceValidator,
  redirectMatchTypeValidator,
  redirectContentTypeValidator,
};

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum URL length in characters. */
export const MAX_URL_LENGTH = 2000;

/** Maximum redirect note length in characters. */
export const MAX_NOTE_LENGTH = 500;

/** Maximum regex pattern length in characters. */
export const MAX_REGEX_LENGTH = 500;

/** Maximum number of regex redirects allowed per site. */
export const MAX_REGEX_REDIRECTS = 50;

/** Default items per page for admin redirect listings. */
export const DEFAULT_PER_PAGE = 20;

/** Maximum items per page. */
export const MAX_PER_PAGE = 100;

/** Maximum batch size for bulk redirect creation. */
export const MAX_BATCH_SIZE = 100;

/** Maximum number of notFound records before pruning. */
export const MAX_NOT_FOUND_RECORDS = 10000;

/** Days before resolved 404 entries are cleaned up. */
export const RESOLVED_CLEANUP_DAYS = 90;

/** Days before unresolved low-hit 404 entries are cleaned up. */
export const UNRESOLVED_LOW_HIT_CLEANUP_DAYS = 30;

/** Minimum hit count to keep unresolved 404 entries during cleanup. */
export const UNRESOLVED_MIN_HITS = 3;

/**
 * Reserved path prefixes that cannot be used as redirect sources.
 * Redirecting these would break core application functionality.
 */
export const RESERVED_PATHS = [
  "/admin",
  "/api",
  "/login",
  "/register",
  "/logout",
  "/auth",
  "/_convex",
] as const;

// ─── Permalink Structures ───────────────────────────────────────────────────

/**
 * The 6 supported permalink structures, matching WordPress options.
 */
export const PERMALINK_STRUCTURES = {
  PLAIN: "plain",
  DAY_AND_NAME: "day_and_name",
  MONTH_AND_NAME: "month_and_name",
  NUMERIC: "numeric",
  POST_NAME: "post_name",
  CUSTOM: "custom",
} as const;

export type PermalinkStructure =
  (typeof PERMALINK_STRUCTURES)[keyof typeof PERMALINK_STRUCTURES];

/**
 * Available permalink tags for custom permalink structures.
 */
export const PERMALINK_TAGS = [
  "%postname%",
  "%year%",
  "%monthnum%",
  "%day%",
  "%post_id%",
  "%category%",
  "%author%",
  "%hour%",
  "%minute%",
  "%second%",
] as const;

// ─── Mutation Args ──────────────────────────────────────────────────────────

/**
 * Arguments for creating a new redirect.
 */
export const createRedirectArgs = {
  sourceUrl: v.string(),
  targetUrl: v.string(),
  statusCode: redirectStatusCodeValidator,
  matchType: redirectMatchTypeValidator,
  note: v.optional(v.string()),
};

/**
 * Arguments for updating an existing redirect.
 */
export const updateRedirectArgs = {
  redirectId: v.id("redirects"),
  sourceUrl: v.optional(v.string()),
  targetUrl: v.optional(v.string()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  statusCode: v.optional(redirectStatusCodeValidator),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  matchType: v.optional(redirectMatchTypeValidator),
  enabled: v.optional(v.boolean()),
  note: v.optional(v.string()),
};

/**
 * Arguments for deleting a redirect.
 */
export const deleteRedirectArgs = {
  redirectId: v.id("redirects"),
};

/**
 * Arguments for resolving a 404 entry (marking as addressed).
 */
export const resolve404Args = {
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  notFoundId: v.id("notFound"),
  redirectId: v.optional(v.id("redirects")),
};

/**
 * Arguments for dismissing (resolving without redirect) a 404 entry.
 */
export const dismiss404Args = {
  notFoundId: v.id("notFound"),
};

/**
 * Arguments for bulk dismissing 404 entries.
 */
export const bulkDismiss404Args = {
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  notFoundIds: v.array(v.id("notFound")),
};

// ─── Query Args ─────────────────────────────────────────────────────────────

/**
 * Arguments for admin redirect list with filters and pagination.
 */
export const getRedirectsArgs = {
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  source: v.optional(redirectSourceValidator),
  enabled: v.optional(v.boolean()),
  search: v.optional(v.string()),
  sortBy: v.optional(
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    v.union(
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("sourceUrl"),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("hitCount"),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("createdAt"),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("lastHitAt"),
    ),
  ),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  page: v.optional(v.number()),
  perPage: v.optional(v.number()),
};

/**
 * Arguments for getting a single redirect.
 */
export const getRedirectByIdArgs = {
  redirectId: v.id("redirects"),
};

/**
 * Arguments for 404 log listing.
 */
export const get404LogArgs = {
  resolved: v.optional(v.boolean()),
  minHits: v.optional(v.number()),
  sortBy: v.optional(
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    v.union(
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("hitCount"),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("lastHitAt"),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("url"),
    ),
  ),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  page: v.optional(v.number()),
  perPage: v.optional(v.number()),
};

// ─── Internal Function Args ─────────────────────────────────────────────────

/**
 * Arguments for resolving a redirect by URL (middleware).
 */
export const resolveRedirectArgs = {
  url: v.string(),
};

/**
 * Arguments for generating a slug-change redirect.
 */
export const generateSlugRedirectArgs = {
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  contentType: v.union(v.literal("post"), v.literal("page")),
  contentId: v.string(),
  oldSlug: v.string(),
  newSlug: v.string(),
};

/**
 * Arguments for batch creating redirects.
 */
export const batchCreateRedirectsArgs = {
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  redirects: v.array(
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    v.object({
      sourceUrl: v.string(),
      targetUrl: v.string(),
    }),
  ),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  source: v.union(v.literal("slug_change"), v.literal("permalink_change")),
};

/**
 * Arguments for recording a redirect hit.
 */
export const recordRedirectHitArgs = {
  redirectId: v.id("redirects"),
};

/**
 * Arguments for logging a 404 hit.
 */
export const log404Args = {
  url: v.string(),
  referrer: v.optional(v.string()),
  userAgent: v.optional(v.string()),
};
