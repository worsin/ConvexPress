/**
 * Routing System - Schema
 *
 * Two tables supporting URL redirect management and 404 tracking:
 *   - `redirects`  - URL redirect rules (manual, slug change, permalink change, import)
 *   - `notFound`   - 404 hit aggregation for admin review and redirect creation
 *
 * ConvexPress diverges from WordPress in key ways:
 *   - Built-in redirect table (WordPress requires plugins like Redirection or Yoast)
 *   - Built-in 404 logging with hit aggregation (no WordPress equivalent)
 *   - Auto-redirect generation on slug changes (WordPress uses _wp_old_slug post meta)
 *   - Auto-redirect generation on permalink structure changes (not native in WordPress)
 *   - Chain flattening: A->B->C automatically becomes A->C and B->C
 *   - Real-time via Convex subscriptions (admin sees new redirects/404s immediately)
 *
 * Key design decisions:
 *   - `sourceUrl` is always a relative path (starts with `/`)
 *   - `targetUrl` can be relative or absolute HTTPS
 *   - `hitCount` is denormalized for fast sorting without scanning
 *   - `notFound` entries are aggregated per URL (not one row per hit)
 *   - `source` tracks how the redirect was created for admin filtering
 *   - `matchType` supports exact, prefix, and regex matching
 *   - `contentType`/`contentId` link auto-generated redirects to their source content
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Shared Validators (used by schema and functions) ───────────────────────

export const redirectStatusCodeValidator = v.union(
  v.literal(301),
  v.literal(302),
  v.literal(307),
  v.literal(308),
);

export const redirectSourceValidator = v.union(
  v.literal("manual"),
  v.literal("slug_change"),
  v.literal("permalink_change"),
  v.literal("import"),
);

export const redirectMatchTypeValidator = v.union(
  v.literal("exact"),
  v.literal("prefix"),
  v.literal("regex"),
);

export const redirectContentTypeValidator = v.union(
  v.literal("post"),
  v.literal("page"),
  v.literal("category"),
  v.literal("tag"),
  v.literal("author"),
);

// ─── Tables ─────────────────────────────────────────────────────────────────

export const routingTables = {
  /**
   * URL redirect rules table.
   *
   * WordPress equivalent: Redirection plugin / Yoast redirects
   *
   * Stores all URL redirects -- both manually created by administrators
   * and automatically generated when permalink structures or slugs change.
   *
   * Indexes support:
   *   - Fast middleware redirect lookup (by_source_url)
   *   - Admin filtering by creation source (by_source)
   *   - Admin filtering by enabled/disabled (by_enabled)
   *   - Finding redirects for specific content (by_content)
   *   - Sorting by popularity (by_hit_count)
   *   - Sorting by creation date (by_created_at)
   */
  redirects: defineTable({
    // ── Source URL ─────────────────────────────────────────────────────────
    sourceUrl: v.string(), // Relative path, e.g., "/old-post-name/"

    // ── Target URL ────────────────────────────────────────────────────────
    targetUrl: v.string(), // Relative path or absolute URL, e.g., "/new-post-name/"

    // ── Redirect Type ─────────────────────────────────────────────────────
    statusCode: redirectStatusCodeValidator, // 301, 302, 307, or 308

    // ── Source Type ───────────────────────────────────────────────────────
    source: redirectSourceValidator, // How this redirect was created

    // ── Match Behavior ────────────────────────────────────────────────────
    matchType: redirectMatchTypeValidator, // exact, prefix, or regex

    // ── Optional Linked Content ───────────────────────────────────────────
    contentType: v.optional(redirectContentTypeValidator),
    contentId: v.optional(v.string()), // Convex ID of linked content

    // ── State ─────────────────────────────────────────────────────────────
    enabled: v.boolean(), // Can be disabled without deletion

    // ── Analytics ─────────────────────────────────────────────────────────
    hitCount: v.number(), // Times this redirect has been triggered
    lastHitAt: v.optional(v.number()), // Timestamp of last redirect hit

    // ── Admin Note ────────────────────────────────────────────────────────
    note: v.optional(v.string()), // Admin note explaining the redirect

    // ── Audit Fields ──────────────────────────────────────────────────────
    createdAt: v.number(),
    createdBy: v.optional(v.id("users")), // null for system-generated
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  })
    .index("by_source_url", ["sourceUrl"]) // Fast exact-match redirect lookup in middleware
    .index("by_target_url", ["targetUrl"]) // Fast chain flattening lookup (find redirects pointing to a URL)
    .index("by_source", ["source"]) // Filter by creation source (manual, slug_change, etc.)
    .index("by_enabled", ["enabled"]) // List enabled/disabled redirects
    .index("by_content", ["contentType", "contentId"]) // Find redirects for specific content
    .index("by_hit_count", ["hitCount"]) // Sort by popularity for admin dashboard
    .index("by_created_at", ["createdAt"]), // Sort by creation date

  /**
   * 404 not-found log table.
   *
   * No WordPress equivalent (plugins like Redirection provide this).
   *
   * Tracks 404 hits for analytics and redirect suggestion.
   * Hits are aggregated per URL (one row per unique URL, not per hit).
   *
   * Indexes support:
   *   - Fast lookup for aggregation (by_url)
   *   - Sorting by frequency (by_hit_count)
   *   - Filtering resolved/unresolved (by_resolved)
   *   - Sorting by recency (by_last_hit)
   */
  notFound: defineTable({
    // ── URL ───────────────────────────────────────────────────────────────
    url: v.string(), // The requested URL that 404'd

    // ── Request Context ───────────────────────────────────────────────────
    referrer: v.optional(v.string()), // HTTP Referer header (last seen)
    userAgent: v.optional(v.string()), // Browser/bot user agent (last seen)

    // ── Aggregation ───────────────────────────────────────────────────────
    hitCount: v.number(), // Aggregated hit count for this URL
    lastHitAt: v.number(), // Last time this 404 was triggered

    // ── Resolution State ──────────────────────────────────────────────────
    resolved: v.boolean(), // Whether an admin has addressed this 404
    resolvedBy: v.optional(v.id("users")),
    resolvedAt: v.optional(v.number()),
    redirectId: v.optional(v.id("redirects")), // If a redirect was created to fix this
  })
    .index("by_url", ["url"]) // Fast lookup for aggregation
    .index("by_hit_count", ["hitCount"]) // Sort by frequency for admin review
    .index("by_resolved", ["resolved"]) // Filter resolved/unresolved
    .index("by_last_hit", ["lastHitAt"]), // Sort by recency
};
