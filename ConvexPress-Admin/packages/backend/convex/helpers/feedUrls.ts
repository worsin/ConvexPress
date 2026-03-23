/**
 * RSS/Feed System - URL Generation Helper
 *
 * Generates correct feed URLs for all feed types and format combinations.
 * Used by both the backend (XML self-referencing links) and the website
 * frontend (FeedDiscoveryHead component).
 *
 * WordPress equivalent: get_feed_link(), get_post_comments_feed_link(),
 *                       get_category_feed_link(), get_tag_feed_link(),
 *                       get_author_feed_link()
 *
 * DUPLICATION NOTE: The ConvexPress-Website has its own `getFeedUrl()` in
 * `ConvexPress-Website/apps/web/src/lib/feeds/buildFeedResponse.ts`. Both generate
 * URLs with the `/api/` prefix matching the TanStack Start API routes.
 * These backend helpers are retained for the alternative Convex HTTP
 * Actions approach (Option B) and for unit testing.
 *
 * URL patterns (served via TanStack Start API routes with /api/ prefix):
 *   /api/feed              - Main RSS 2.0 feed
 *   /api/feed/rss2         - Explicit RSS 2.0 feed
 *   /api/feed/atom         - Main Atom 1.0 feed
 *   /api/category/{slug}/feed       - Category RSS feed
 *   /api/category/{slug}/feed/atom  - Category Atom feed
 *   /api/tag/{slug}/feed            - Tag RSS feed
 *   /api/tag/{slug}/feed/atom       - Tag Atom feed
 *   /api/author/{slug}/feed         - Author RSS feed
 *   /api/author/{slug}/feed/atom    - Author Atom feed
 *   /api/comments/feed              - Global comment RSS feed
 *   /api/comments/feed/atom         - Global comment Atom feed
 *   /api/blog/{slug}/feed           - Per-post comment RSS feed
 *   /api/blog/{slug}/feed/atom      - Per-post comment Atom feed
 *
 * Note: The /api/ prefix is required because feeds are served as TanStack Start
 * API routes (the chosen implementation approach), not Convex HTTP actions.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type FeedType =
  | "main"
  | "category"
  | "tag"
  | "author"
  | "comments"
  | "postComments";

export type FeedFormat = "rss2" | "atom";

// ─── URL Generator ──────────────────────────────────────────────────────────

/**
 * Generate the correct feed URL for any feed type and format combination.
 *
 * @param siteUrl - Base site URL (e.g., "https://example.com")
 * @param type - Feed type: "main", "category", "tag", "author", "comments", "postComments"
 * @param slug - Slug for type-specific feeds (category slug, tag slug, author slug, post slug)
 * @param format - Feed format: "rss2" (default) or "atom"
 * @returns Fully qualified feed URL
 *
 * @example
 *   getFeedUrl("https://example.com", "main")
 *   // => "https://example.com/api/feed"
 *
 *   getFeedUrl("https://example.com", "main", undefined, "atom")
 *   // => "https://example.com/api/feed/atom"
 *
 *   getFeedUrl("https://example.com", "category", "news")
 *   // => "https://example.com/api/category/news/feed"
 *
 *   getFeedUrl("https://example.com", "tag", "react", "atom")
 *   // => "https://example.com/api/tag/react/feed/atom"
 *
 *   getFeedUrl("https://example.com", "author", "john")
 *   // => "https://example.com/api/author/john/feed"
 *
 *   getFeedUrl("https://example.com", "comments")
 *   // => "https://example.com/api/comments/feed"
 *
 *   getFeedUrl("https://example.com", "postComments", "hello-world")
 *   // => "https://example.com/api/blog/hello-world/feed"
 */
export function getFeedUrl(
  siteUrl: string,
  type: FeedType,
  slug?: string,
  format?: FeedFormat,
): string {
  // Normalize siteUrl - remove trailing slash
  const base = siteUrl.replace(/\/+$/, "");

  // Build the format suffix
  const formatSuffix = format === "atom" ? "/atom" : "";

  switch (type) {
    case "main":
      return `${base}/api/feed${formatSuffix}`;

    case "category":
      if (!slug) throw new Error("Category feed requires a slug");
      return `${base}/api/category/${slug}/feed${formatSuffix}`;

    case "tag":
      if (!slug) throw new Error("Tag feed requires a slug");
      return `${base}/api/tag/${slug}/feed${formatSuffix}`;

    case "author":
      if (!slug) throw new Error("Author feed requires a slug");
      return `${base}/api/author/${slug}/feed${formatSuffix}`;

    case "comments":
      return `${base}/api/comments/feed${formatSuffix}`;

    case "postComments":
      if (!slug) throw new Error("Post comment feed requires a slug");
      return `${base}/api/blog/${slug}/feed${formatSuffix}`;

    default:
      throw new Error(`Unknown feed type: ${type}`);
  }
}

/**
 * Get the content type header value for a given feed format.
 *
 * NOTE: Currently unused -- the ConvexPress-Website has its own `getFeedContentType()`
 * in `lib/feeds/constants.ts`. This is retained for use if/when Convex HTTP
 * actions are used for feed serving (Option B in the knowledge doc).
 *
 * @param format - Feed format: "rss2" or "atom"
 * @returns Content-Type header value
 */
export function getFeedContentType(format: FeedFormat): string {
  switch (format) {
    case "atom":
      return "application/atom+xml; charset=UTF-8";
    case "rss2":
    default:
      return "application/rss+xml; charset=UTF-8";
  }
}
