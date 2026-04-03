/**
 * Search System - Schema
 *
 * Three tables supporting the full-text search and discovery system:
 *   - `searchIndex`    - Denormalized unified search index across all content types
 *   - `searchQueries`  - Search analytics (query logging, click-through tracking)
 *   - `searchSynonyms` - Admin-managed synonym groups for query expansion
 *
 * The `searchIndex` table aggregates content from posts, pages, media, and
 * comments into a single flat table with Convex search indexes. This enables
 * cross-content-type full-text search with relevance scoring.
 *
 * This mirrors WordPress's WP_Query search combined with the advanced
 * capabilities of SearchWP/Relevanssi plugins.
 *
 * Key design decisions:
 *   - `contentId` is a string (not `v.id()`) for cross-table compatibility
 *   - Dual search indexes (title + content) for weighted relevance merging
 *   - `searchQueries` table for analytics, not the Event Dispatcher
 *   - Synonyms are admin-managed, not auto-generated
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Shared Validators (used by schema and functions) ───────────────────────

export const searchableContentTypeValidator = v.union(
  v.literal("post"),
  v.literal("page"),
  v.literal("media"),
  v.literal("comment"),
);

export const searchSourceValidator = v.union(
  v.literal("website"),
  v.literal("admin"),
  v.literal("api"),
);

// ─── Tables ─────────────────────────────────────────────────────────────────

export const searchTables = {
  /**
   * Unified search index - denormalized content from all searchable content types.
   *
   * Each record represents one piece of content (post, page, media item, or comment)
   * with its text content stripped of HTML/markup for full-text searching.
   *
   * Two Convex search indexes enable the dual-search strategy:
   *   - `search_all`: Full-text search on content body
   *   - `search_title`: Full-text search on title (gets 2x relevance weight)
   *
   * Standard indexes support:
   *   - Upsert/delete by source content reference (by_content)
   *   - Filtered listings by type and status (by_content_type_status)
   *   - Author-filtered queries (by_author)
   *   - Reindex progress tracking (by_indexed)
   */
  searchIndex: defineTable({
    // ── Identity ──────────────────────────────────────────────────────────
    contentType: searchableContentTypeValidator, // "post" | "page" | "media" | "comment"
    contentId: v.string(), // The _id of the referenced record (string for cross-table)

    // ── Searchable Fields (denormalized) ──────────────────────────────────
    title: v.string(), // Post/page/media title, or "" for comments. Max 500 chars.
    content: v.string(), // Full text, HTML stripped. Max 100,000 chars.
    excerpt: v.string(), // Short excerpt or first 200 chars of stripped content.

    // ── Metadata for Filtering ────────────────────────────────────────────
    authorId: v.string(), // User identifier of content creator
    authorName: v.string(), // Denormalized author display name
    status: v.string(), // "publish", "draft", "pending", "private", "trash", etc.

    // ── Taxonomy Terms (denormalized, posts only) ─────────────────────────
    categoryNames: v.optional(v.array(v.string())),
    tagNames: v.optional(v.array(v.string())),

    // ── Custom Field Values (denormalized) ────────────────────────────────
    customFieldValues: v.optional(v.array(v.string())),

    // ── Media-Specific ────────────────────────────────────────────────────
    altText: v.optional(v.string()),
    caption: v.optional(v.string()),
    mimeType: v.optional(v.string()),

    // ── URL for Results ───────────────────────────────────────────────────
    url: v.string(), // Canonical URL path (e.g., "/blog/my-post")

    // ── Boost/Weight ──────────────────────────────────────────────────────
    boostScore: v.optional(v.number()), // Sticky: +10, Featured: +5, Regular: 0

    // ── Timestamps ────────────────────────────────────────────────────────
    publishedAt: v.optional(v.number()), // When content was published (ms)
    indexedAt: v.number(), // When this index entry was last updated
    createdAt: v.number(), // When source content was created
    updatedAt: v.number(), // When source content was last updated
  })
    // ── Convex Search Indexes ───────────────────────────────────────────
    .searchIndex("search_all", {
      searchField: "content",
      filterFields: ["contentType", "status", "authorId"],
    })
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["contentType", "status"],
    })
    // ── Standard Indexes ────────────────────────────────────────────────
    .index("by_content", ["contentType", "contentId"])
    .index("by_content_type_status", ["contentType", "status", "publishedAt"])
    .index("by_author", ["authorId", "contentType"])
    .index("by_indexed", ["indexedAt"]),

  /**
   * Search analytics table - logs every search query executed.
   *
   * Supports click-through tracking, zero-result detection, popular query
   * aggregation, and volume-over-time analysis. This is the WordPress
   * equivalent of SearchWP Metrics.
   *
   * Indexes support:
   *   - Popular query aggregation (by_query)
   *   - Recent search listing (by_date)
   *   - Per-user search history (by_user)
   *   - Source breakdown analytics (by_source)
   *   - Zero-result query detection (by_zero_results)
   */
  searchQueries: defineTable({
    // ── Query Data ────────────────────────────────────────────────────────
    query: v.string(), // Original query (trimmed, lowercased). Max 500 chars.
    normalizedQuery: v.string(), // Stop words removed, trimmed. Max 500 chars.
    resultCount: v.number(), // Number of results returned. Non-negative.

    // ── Context ───────────────────────────────────────────────────────────
    userId: v.optional(v.string()), // User identifier (undefined for public)
    source: searchSourceValidator, // "website" | "admin" | "api"

    // ── Filters Applied ───────────────────────────────────────────────────
    contentTypeFilter: v.optional(searchableContentTypeValidator),
    categoryFilter: v.optional(v.string()),
    tagFilter: v.optional(v.string()),

    // ── Engagement ────────────────────────────────────────────────────────
    clickedResults: v.optional(
      v.array(
        v.object({
          contentType: searchableContentTypeValidator,
          contentId: v.string(),
          position: v.number(), // 1-based position in result list
          clickedAt: v.number(),
        }),
      ),
    ),

    // ── Timestamps ────────────────────────────────────────────────────────
    createdAt: v.number(), // When the search was performed. Immutable.
  })
    .index("by_query", ["normalizedQuery", "createdAt"])
    .index("by_date", ["createdAt"])
    .index("by_user", ["userId", "createdAt"])
    .index("by_source", ["source", "createdAt"])
    .index("by_zero_results", ["resultCount", "createdAt"]),

  /**
   * Admin-managed synonym groups for query expansion.
   *
   * Each record maps a primary term to an array of equivalent terms.
   * When a user searches for any term in a group, the search system
   * expands the query to include all synonyms (OR logic).
   *
   * Example: { term: "photo", synonyms: ["picture", "image", "photograph"] }
   */
  searchSynonyms: defineTable({
    term: v.string(), // Primary term. Max 100 chars, lowercased.
    synonyms: v.array(v.string()), // Equivalent terms. Each max 100 chars. Min 1, max 20.
    isActive: v.boolean(), // Whether this synonym group is active. Default true.
    createdBy: v.string(), // User identifier of admin who created
    createdAt: v.number(), // Immutable.
    updatedAt: v.number(), // Updated on every mutation.
  })
    .index("by_term", ["term", "isActive"])
    .index("by_active", ["isActive"]),
};
