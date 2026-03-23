/**
 * SEO System - Schema
 *
 * One table for global SEO configuration:
 *   - `seoSettings` - Key-value store for site-wide SEO settings
 *
 * Per-post/page SEO metadata is stored in the shared `postMeta` table
 * (owned by the Post System) using `_seo_*` key prefixes. This mirrors
 * WordPress's pattern where Yoast SEO stores `_yoast_wpseo_*` keys in
 * the `wp_postmeta` table.
 *
 * Known `seoSettings` keys:
 *   - "titles"        - Title templates, separators, noindex defaults
 *   - "social"        - Social profiles, OG defaults, Twitter card type
 *   - "robots"        - Robots.txt config, site noindex, AI bot blocking
 *   - "schema"        - Schema.org structured data configuration
 *   - "breadcrumbs"   - Breadcrumb trail settings
 *   - "verification"  - Search engine verification codes
 *   - "advanced"      - Advanced permalink and link behavior settings
 *
 * Key design decisions:
 *   - Global settings use a key-value pattern with JSON-encoded values
 *     to allow flexible schema evolution without table migrations
 *   - Per-post SEO data lives in `postMeta` (not a new table) to match
 *     WordPress architecture and avoid cross-table joins
 *   - The `by_key` index ensures unique lookup per settings key
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Tables ─────────────────────────────────────────────────────────────────

export const seoTables = {
  /**
   * Global SEO settings table.
   *
   * Stores site-wide SEO configuration as JSON-encoded key-value pairs.
   * Each row represents one settings section (e.g., "titles", "social").
   *
   * WordPress equivalent: SEO-related entries in `wp_options` table
   * (e.g., `wpseo_titles`, `wpseo_social`, `wpseo`).
   */
  seoSettings: defineTable({
    // ── Setting Identification ─────────────────────────────────────────────
    key: v.string(), // Setting key: "titles" | "social" | "robots" | "schema" | "breadcrumbs" | "verification" | "advanced"

    // ── Setting Value ──────────────────────────────────────────────────────
    value: v.string(), // JSON-encoded setting value (shape varies by key)

    // ── Audit Trail ────────────────────────────────────────────────────────
    updatedAt: v.number(), // Last modification timestamp (ms since epoch)
    updatedBy: v.string(), // WorkOS user ID of last updater
  })
    // ── Indexes ──────────────────────────────────────────────────────────
    .index("by_key", ["key"]), // Unique lookup by key name
};
