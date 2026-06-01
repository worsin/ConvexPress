/**
 * Sitemap System - Schema
 *
 * Three tables supporting XML sitemap generation and caching:
 *   - `sitemapCache` - Pre-generated XML sitemaps stored for instant serving
 *   - `sitemapGenerationLog` - Audit trail for sitemap generation events
 *   - `sitemapPingLog` - Tracks search engine ping requests and outcomes
 *
 * Unlike WordPress's dynamic per-request sitemap rendering, ConvexPress
 * pre-generates XML and caches it in Convex for instant O(1) serving.
 * The system automatically marks sitemaps as stale when content changes
 * and debounces regeneration to handle bulk operations efficiently.
 *
 * Key design decisions:
 *   - Sitemaps are stored as full XML strings in `sitemapCache` for O(1) reads
 *   - Content hash (SHA-256) prevents unnecessary regeneration
 *   - Sub-sitemaps paginate at a configurable max URLs per file (default 1000)
 *   - Debounced regeneration (default 30s) handles rapid content changes
 *   - Separate log tables for generation and pings support monitoring
 *   - Settings are stored in the SEO System's `seoSettings` table, not here
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Shared Validators ───────────────────────────────────────────────────────

/**
 * Valid sitemap content types.
 * "index" is the master sitemap index; others are content-type sub-sitemaps.
 */
export const sitemapTypeValidator = v.union(
  v.literal("index"),
  v.literal("posts"),
  v.literal("pages"),
  v.literal("courses"),
  v.literal("categories"),
  v.literal("tags"),
  v.literal("authors"),
);

/**
 * Valid generation trigger sources.
 */
export const sitemapTriggerValidator = v.union(
  v.literal("content_change"),
  v.literal("manual"),
  v.literal("scheduled"),
  v.literal("settings_change"),
);

/**
 * Valid search engine identifiers for pinging.
 */
export const searchEngineValidator = v.union(
  v.literal("google"),
  v.literal("bing"),
);

/**
 * Valid generation/ping outcome statuses.
 */
export const outcomeStatusValidator = v.union(
  v.literal("success"),
  v.literal("error"),
);

// ─── Tables ──────────────────────────────────────────────────────────────────

export const sitemapTables = {
  /**
   * Pre-generated sitemap XML cache.
   *
   * Stores complete XML documents for instant serving without regeneration
   * on each request. Each row represents one sub-sitemap page or the
   * sitemap index itself.
   *
   * WordPress equivalent: No direct equivalent (WP generates on-the-fly).
   * Closest analogy: Yoast SEO's transient-based sitemap cache.
   */
  sitemapCache: defineTable({
    // ── Identity ──────────────────────────────────────────────────────────
    type: sitemapTypeValidator,       // Which sub-sitemap this is
    page: v.number(),                 // Page number (1-based for sub-sitemaps, 0 for index)

    // ── Content ───────────────────────────────────────────────────────────
    xml: v.string(),                  // Full XML content (typically 50-100KB per page)
    urlCount: v.number(),             // Number of URLs in this sitemap page

    // ── Metadata ──────────────────────────────────────────────────────────
    generatedAt: v.number(),          // When last generated (timestamp ms)
    generationDurationMs: v.number(), // How long generation took (monitoring)
    contentHash: v.string(),          // SHA-256 hash of source data (change detection)

    // ── Status ────────────────────────────────────────────────────────────
    isStale: v.boolean(),             // True when content has changed and regeneration needed
  })
    .index("by_type_page", ["type", "page"])   // Lookup specific sub-sitemap
    .index("by_stale", ["isStale"])            // Find sitemaps needing regeneration
    .index("by_type", ["type"]),               // All pages for a given type

  /**
   * Audit trail for sitemap generation events.
   *
   * Records every generation attempt (successful or failed) with timing,
   * trigger information, and result statistics. Used for the admin
   * generation log table and debugging.
   */
  sitemapGenerationLog: defineTable({
    // ── Trigger Info ──────────────────────────────────────────────────────
    triggeredBy: sitemapTriggerValidator,              // What caused the generation
    triggeredByUserId: v.optional(v.string()),         // User identifier (manual triggers)
    triggeredByEvent: v.optional(v.string()),          // Event code (e.g., "post.published")
    triggeredByContentId: v.optional(v.string()),      // ID of content that changed

    // ── Results ───────────────────────────────────────────────────────────
    status: outcomeStatusValidator,                    // success or error
    sitemapsGenerated: v.number(),                     // Count of sub-sitemaps (re)generated
    totalUrls: v.number(),                             // Total URLs across all sitemaps
    durationMs: v.number(),                            // Total generation time (ms)
    errorMessage: v.optional(v.string()),              // Error details if failed

    // ── Timestamp ─────────────────────────────────────────────────────────
    createdAt: v.number(),                             // When this log entry was created
  })
    .index("by_created", ["createdAt"])                // Chronological log
    .index("by_status", ["status"]),                   // Filter for errors

  /**
   * Search engine ping request log.
   *
   * Tracks HTTP ping requests to Google and Bing when sitemaps are
   * regenerated. Pings notify search engines of sitemap updates.
   */
  sitemapPingLog: defineTable({
    engine: searchEngineValidator,                     // google or bing
    url: v.string(),                                   // The ping URL that was called
    status: outcomeStatusValidator,                    // success or error
    httpStatus: v.optional(v.number()),                // HTTP response code
    errorMessage: v.optional(v.string()),              // Error details if failed
    createdAt: v.number(),                             // When this ping was executed
  })
    .index("by_engine", ["engine", "createdAt"])       // Per-engine ping history
    .index("by_created", ["createdAt"]),               // Chronological ping log
};
