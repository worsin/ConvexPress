/**
 * Post System - Schema
 *
 * Two tables supporting the full post lifecycle:
 *   - `posts` - Primary table for all posts AND pages (shared with Page System)
 *   - `postMeta` - Extensible key-value metadata per post
 *
 * The `posts` table is a SHARED table. Both the Post System and the Page System
 * operate on it, distinguished by the `type` field ("post" vs "page").
 *
 * This mirrors WordPress's `wp_posts` + `wp_postmeta` tables, with the same
 * multi-type architecture WordPress uses (post, page, attachment, etc.).
 *
 * Key design decisions:
 *   - `type` discriminator distinguishes posts from pages in the same table
 *   - Slug uniqueness is scoped per type (a post and page can share a slug)
 *   - `authorId` references the Convex users table (not a string identifier)
 *   - Autosave fields live inline on the post (not in a separate revision)
 *   - Page-specific fields (parentId, menuOrder, pageTemplate, path, depth)
 *     are optional and only used when type === "page"
 *   - `commentCount` is denormalized for fast reads (maintained by Comment System)
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Shared Validators (used by schema and functions) ───────────────────────

export const postStatusValidator = v.union(
  v.literal("auto-draft"),
  v.literal("draft"),
  v.literal("pending"),
  v.literal("publish"),
  v.literal("future"),
  v.literal("private"),
  v.literal("trash"),
);

export const postVisibilityValidator = v.union(
  v.literal("public"),
  v.literal("private"),
  v.literal("password"),
);

export const commentStatusValidator = v.union(
  v.literal("open"),
  v.literal("closed"),
);

export const postTypeValidator = v.union(
  v.literal("post"),
  v.literal("page"),
);

// ─── Tables ─────────────────────────────────────────────────────────────────

export const postTables = {
  /**
   * Primary content table - stores both posts and pages.
   *
   * The `type` field distinguishes content types. All post-specific and
   * page-specific indexes include the type in their prefix for efficient
   * scoped queries.
   *
   * Indexes support:
   *   - Admin "All Posts" list table (filtered by type + status)
   *   - Author's posts view (filtered by author + type + status)
   *   - Website blog index (published posts sorted by publishedAt)
   *   - Scheduled publish cron (future posts by scheduledAt)
   *   - Trash auto-purge cron (trashed posts by trashedAt)
   *   - Page hierarchy (by parentId + menuOrder)
   *   - Single post/page lookup by slug
   *   - Full-text search on title
   */
  posts: defineTable({
    // ── Content Type Discriminator ────────────────────────────────────────
    type: postTypeValidator, // "post" or "page"

    // ── Core Fields ──────────────────────────────────────────────────────
    title: v.string(), // Post/page title
    slug: v.string(), // URL-safe slug (unique per type among non-trashed)
    content: v.optional(v.string()), // Serialized block editor content (JSON)
    excerpt: v.optional(v.string()), // Manual excerpt (plain text, max 1000 chars)

    // ── Status & Visibility ──────────────────────────────────────────────
    status: postStatusValidator, // Current lifecycle status
    visibility: postVisibilityValidator, // public, private, or password-protected
    password: v.optional(v.string()), // Post password (when visibility === "password")

    // ── Authorship ───────────────────────────────────────────────────────
    authorId: v.id("users"), // Post author (Convex users table reference)

    // ── Featured Image ───────────────────────────────────────────────────
    featuredImageId: v.optional(v.id("media")), // Featured image reference

    // ── Discussion ───────────────────────────────────────────────────────
    commentStatus: commentStatusValidator, // Whether comments are allowed
    commentCount: v.optional(v.number()), // Denormalized comment count (maintained by Comment System)

    // ── Post-Specific Fields ─────────────────────────────────────────────
    isSticky: v.optional(v.boolean()), // Pinned to top of blog listings (posts only)

    // ── Publishing ───────────────────────────────────────────────────────
    publishedAt: v.optional(v.number()), // When published (timestamp ms)
    scheduledAt: v.optional(v.number()), // Scheduled publish time (for future status)

    // ── Trash Management ─────────────────────────────────────────────────
    trashedAt: v.optional(v.number()), // When moved to trash (for auto-purge)
    previousStatus: v.optional(v.string()), // Status before trashing (for restore)

    // ── Page-Specific Fields ─────────────────────────────────────────────
    parentId: v.optional(v.id("posts")), // Parent page (pages only)
    menuOrder: v.optional(v.number()), // Manual sort order (pages only)
    pageTemplate: v.optional(v.string()), // Page template key (pages only)
    // Section composer payload for template-driven layouts (pages only).
    // Stored as v.any() because section schemas vary by type (hero, feature-grid,
    // story-split, testimonial-band, cta-band, etc.) and the template-aware
    // editor handles per-section validation. Existing seeded rows already
    // populate this field.
    pageSections: v.optional(v.any()),

    // ── Layout Override Fields ───────────────────────────────────────────
    layoutId: v.optional(v.string()),       // Per-post/page layout override (layout _id)
    hideHeader: v.optional(v.boolean()),     // Hide site header on this page
    hideFooter: v.optional(v.boolean()),     // Hide site footer on this page

    path: v.optional(v.string()), // Full URL path (pages only, e.g., "/services/web-design")
    depth: v.optional(v.number()), // Nesting depth (pages only, 0 = top-level)

    // ── Autosave Fields ──────────────────────────────────────────────────
    autosaveContent: v.optional(v.string()), // Last autosaved content
    autosaveTitle: v.optional(v.string()), // Last autosaved title
    autosavedAt: v.optional(v.number()), // When autosave last ran

    // ── Structured Content Fields ───────────────────────────────────────
    // Provides named content sections for template-driven rendering.
    // All fields are plain strings (not TipTap JSON) for easy AI generation and user editing.

    /** Hero section — banner area at the top of the page/post */
    hero: v.optional(v.object({
      title: v.optional(v.string()),
      subtitle: v.optional(v.string()),
      content: v.optional(v.string()),
      imageId: v.optional(v.id("media")),
      videoUrl: v.optional(v.string()),
      ctaText: v.optional(v.string()),
      ctaUrl: v.optional(v.string()),
    })),

    /** Topics — up to 5 content sections (enforced in mutations, not schema) */
    topics: v.optional(v.array(v.object({
      title: v.optional(v.string()),
      subtitle: v.optional(v.string()),
      content: v.optional(v.string()),
      imageId: v.optional(v.id("media")),
      videoUrl: v.optional(v.string()),
    }))),

    /** Summary section — key takeaways or conclusion */
    summary: v.optional(v.object({
      title: v.optional(v.string()),
      content: v.optional(v.string()),
    })),

    /** Sources — cited references, free-form text (one per line) */
    sources: v.optional(v.string()),

    /** Table of contents — auto-generated or manually curated */
    tableOfContents: v.optional(v.string()),

    /** AI generation prompt — describes what this page/post should be about */
    pagePrompt: v.optional(v.string()),

    // ── Timestamps ───────────────────────────────────────────────────────
    createdAt: v.number(), // Creation timestamp (ms)
    updatedAt: v.number(), // Last modification timestamp (ms)

    // ── WordPress Import Fields ─────────────────────────────────────────
    wpPostId: v.optional(v.number()), // Original WordPress post ID
    wpGuid: v.optional(v.string()), // WordPress GUID for deduplication
    wpSourceSiteId: v.optional(v.id("wordpressSites")), // Source WordPress site
  })
    // ── Core Listing Indexes ─────────────────────────────────────────────
    .index("by_type", ["type"]) // Filter all pages vs all posts
    .index("by_type_status", ["type", "status"]) // All Posts / All Pages by status
    .index("by_author", ["authorId", "type", "status"]) // Author's posts
    .index("by_slug", ["slug", "type"]) // Slug uniqueness per type
    .index("by_type_slug", ["type", "slug"]) // Type-first slug lookup (Page System)
    .index("by_status", ["status"]) // Status filter (cross-type)

    // ── Publishing & Chronological Indexes ───────────────────────────────
    .index("by_type_published", ["type", "publishedAt"]) // Blog index, RSS
    .index("by_type_sticky", ["type", "isSticky"]) // Sticky posts
    .index("by_scheduled", ["scheduledAt"]) // Scheduled publish cron
    .index("by_trashed", ["trashedAt"]) // Trash auto-purge cron
    .index("by_type_created", ["type", "createdAt"]) // Recently created

    // ── Page Hierarchy Indexes ───────────────────────────────────────────
    .index("by_parent", ["parentId", "menuOrder"]) // Page hierarchy
    .index("by_type_parent", ["type", "parentId"]) // Type-scoped parent lookup (Page System)
    .index("by_type_menu_order", ["type", "menuOrder"]) // Page ordering (admin sorted list)

    // ── Page-Specific Indexes ────────────────────────────────────────────
    .index("by_type_template", ["type", "pageTemplate"]) // Template-filtered queries
    .index("by_type_status_published", ["type", "status", "publishedAt"]) // Published pages sorted by date

    // ── Page Path Index ──────────────────────────────────────────────────
    .index("by_path", ["path"]) // Page path lookups

    // ── Full-Text Search ─────────────────────────────────────────────────
    .searchIndex("search_posts", {
      searchField: "title",
      filterFields: ["type", "status", "authorId"],
    }),

  /**
   * Post metadata table - extensible key-value store per post.
   *
   * WordPress equivalent: wp_postmeta
   *
   * Known meta keys:
   *   - `_edit_lock`     - Concurrent edit lock (JSON: { userId, timestamp })
   *   - `_edit_last`     - Last user to edit (user ID)
   *   - `_seo_title`     - Custom SEO title override
   *   - `_seo_description` - Custom meta description
   *   - `_seo_canonical` - Canonical URL override
   *   - `_seo_og_image`  - Open Graph image URL
   *   - `_seo_noindex`   - Exclude from search engines ("true"/"false")
   *   - `_custom_css`    - Per-post custom CSS
   *   - `_scheduled_fn`  - Scheduled function ID (for cancellation)
   */
  postMeta: defineTable({
    postId: v.id("posts"), // Foreign key to posts table
    key: v.string(), // meta_key
    value: v.string(), // meta_value (JSON-encoded for complex values)
  })
    .index("by_post", ["postId"]) // All meta for a post
    .index("by_post_key", ["postId", "key"]) // Specific meta value
    .index("by_key", ["key"]), // All posts with a specific meta key
};
