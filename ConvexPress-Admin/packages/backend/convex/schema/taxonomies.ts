/**
 * Taxonomy System - Schema
 *
 * Two tables implementing WordPress's taxonomy model:
 *   - terms: Categories (hierarchical) and tags (flat) in a single table
 *   - termRelationships: Junction table linking posts to terms
 *
 * WordPress equivalent: wp_terms + wp_term_taxonomy merged into `terms`,
 * and wp_term_relationships as `termRelationships`.
 *
 * Key design decisions:
 *   - Taxonomy type is a field on `terms` (not a separate table)
 *   - Slug uniqueness is per-taxonomy (a category and tag can share a slug)
 *   - Term count is denormalized on the term for fast reads
 *   - The default "Uncategorized" category is protected via `isDefault` flag
 *   - Max hierarchy depth: 5 levels for categories
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

export const taxonomyTables = {
  terms: defineTable({
    // --- Identity ---
    name: v.string(), // Term display name: "Technology", "react"
    slug: v.string(), // URL-safe slug: "technology", "react"
    taxonomy: v.union(
      v.literal("category"),
      v.literal("post_tag"),
    ), // Taxonomy type

    // --- Hierarchy (categories only) ---
    parentId: v.optional(v.id("terms")), // Parent term ID (undefined for root / tags)

    // --- Metadata ---
    description: v.optional(v.string()), // Optional description (shown on archive pages)

    // --- Cached Counts ---
    count: v.number(), // Distinct published posts; editorial total includes restricted visibility.
    countReady: v.optional(v.boolean()),
    countState: v.optional(v.object({
      phase: v.union(v.literal("pending"), v.literal("scanning"), v.literal("ready")),
      revision: v.number(), generation: v.string(), scanRevision: v.number(),
      cursor: v.union(v.string(), v.null()), subtotal: v.number(),
      lastPostId: v.union(v.id("posts"), v.null()), updatedAt: v.number(),
    })),

    // --- System Flags ---
    isDefault: v.boolean(), // True for the default category ("Uncategorized")

    // --- Timestamps ---
    createdAt: v.number(), // Creation timestamp (ms)
    updatedAt: v.number(), // Last modification timestamp (ms)
    createdBy: v.optional(v.string()), // User identifier of creator

    // --- WordPress Import Fields ---
    wpTermId: v.optional(v.number()), // Original WordPress term ID
    wpSourceSiteId: v.optional(v.id("wordpressSites")), // Source WordPress site
  })
    .index("by_count_ready", ["countReady"])
    .index("by_count_phase_updated", ["countState.phase", "countState.updatedAt"])
    .index("by_taxonomy", ["taxonomy"]) // All categories / all tags
    .index("by_slug_taxonomy", ["slug", "taxonomy"]) // Unique slug per taxonomy
    .index("by_parent_name", ["parentId", "name"])
    .index("by_parent", ["parentId"]) // Children of a category
    .index("by_taxonomy_count", ["taxonomy", "count"]) // Most-used terms
    .index("by_taxonomy_name", ["taxonomy", "name"]) // Alphabetical listing
    .index("by_isDefault", ["isDefault"]), // Find the default category

  /**
   * Junction table linking posts to terms.
   * WordPress equivalent: wp_term_relationships.
   *
   * The combination of postId + termId must be unique.
   * Check with by_post_term index before inserting.
   */
  termRelationships: defineTable({
    postId: v.id("posts"), // The post being classified
    termId: v.id("terms"), // The term being assigned
    order: v.optional(v.number()), // Display order (term_order in WP)
    // Site-local discovery coordinates. Source permissions are still checked on read.
    discoveryReady: v.optional(v.boolean()),
    discoveryEligible: v.optional(v.boolean()),
    discoveryPublishedAt: v.optional(v.number()),
    discoveryAuthorId: v.optional(v.id("users")),
  })
    .index("by_post", ["postId"]) // All terms for a post
    .index("by_term", ["termId"]) // All posts with a term
    .index("by_term_post", ["termId", "postId"])
    .index("by_post_term", ["postId", "termId"]) // Unique pair (prevent duplicates)
    .index("by_discovery_ready", ["discoveryReady"])
    .index("by_term_discovery_ready", ["termId", "discoveryReady"])
    .index("by_term_discovery_published", ["termId", "discoveryEligible", "discoveryPublishedAt"])
    .index("by_term_author_discovery_published", ["termId", "discoveryAuthorId", "discoveryEligible", "discoveryPublishedAt"]),
};
