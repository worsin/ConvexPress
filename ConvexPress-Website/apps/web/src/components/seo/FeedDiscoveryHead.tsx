/**
 * FeedDiscoveryHead - Feed Auto-Discovery Link Tags
 *
 * Renders `<link rel="alternate">` tags in the HTML `<head>` for
 * feed reader auto-detection. These tags allow RSS readers (Feedly,
 * Inoreader, browser built-in readers, etc.) to discover available
 * feeds automatically when a user visits any page.
 *
 * WordPress equivalent: feed_links() and feed_links_extra() in wp_head
 *
 * Integration points:
 *   - Root layout: Always renders main feed + comments feed discovery links
 *   - Category archive pages: Add category-specific feed link
 *   - Tag archive pages: Add tag-specific feed link
 *   - Author archive pages: Add author-specific feed link
 *   - Single post pages: Add per-post comment feed link (if comments open)
 *
 * Usage:
 *   // In root layout (always present):
 *   <FeedDiscoveryHead siteUrl="https://example.com" />
 *
 *   // On a category archive page:
 *   <FeedDiscoveryHead
 *     siteUrl="https://example.com"
 *     feedType="category"
 *     slug="news"
 *     title="News"
 *   />
 *
 *   // On a single blog post:
 *   <FeedDiscoveryHead
 *     siteUrl="https://example.com"
 *     feedType="postComments"
 *     slug="hello-world"
 *     title="Hello World"
 *     commentFeedEnabled={true}
 *   />
 */

import type { FeedType } from "@/lib/feeds/types";

// ─── Props ──────────────────────────────────────────────────────────────────

export interface FeedDiscoveryHeadProps {
  /** Base site URL (e.g., "https://example.com") */
  siteUrl: string;
  /**
   * Context-specific feed type. When omitted, only the global
   * main feed + comments feed links are rendered.
   */
  feedType?: FeedType;
  /** Slug for context-specific feeds (category, tag, author, or post slug) */
  slug?: string;
  /** Human-readable title for the context-specific feed (category name, tag name, etc.) */
  title?: string;
  /** Whether to include the per-post comment feed link (for postComments type) */
  commentFeedEnabled?: boolean;
}

// ─── URL Builder (lightweight, no backend dependency) ───────────────────────

function buildFeedUrl(
  siteUrl: string,
  type: FeedType,
  slug?: string,
  format?: "rss2" | "atom",
): string {
  const base = siteUrl.replace(/\/+$/, "");
  const formatSuffix = format === "atom" ? "/atom" : "";

  switch (type) {
    case "main":
      return `${base}/api/feed${formatSuffix}`;
    case "category":
      return `${base}/api/category/${slug}/feed${formatSuffix}`;
    case "tag":
      return `${base}/api/tag/${slug}/feed${formatSuffix}`;
    case "author":
      return `${base}/api/author/${slug}/feed${formatSuffix}`;
    case "comments":
      return `${base}/api/comments/feed${formatSuffix}`;
    case "postComments":
      return `${base}/api/blog/${slug}/feed${formatSuffix}`;
    default:
      return `${base}/api/feed${formatSuffix}`;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function FeedDiscoveryHead({
  siteUrl,
  feedType,
  slug,
  title,
  commentFeedEnabled,
}: FeedDiscoveryHeadProps) {
  return (
    <>
      {/* ── Global feed links (always present) ──────────────────────────── */}
      <link
        rel="alternate"
        type="application/rss+xml"
        title="RSS Feed"
        href={buildFeedUrl(siteUrl, "main")}
      />
      <link
        rel="alternate"
        type="application/atom+xml"
        title="Atom Feed"
        href={buildFeedUrl(siteUrl, "main", undefined, "atom")}
      />
      <link
        rel="alternate"
        type="application/rss+xml"
        title="Comments RSS Feed"
        href={buildFeedUrl(siteUrl, "comments")}
      />

      {/* ── Category feed link ──────────────────────────────────────────── */}
      {feedType === "category" && slug && (
        <>
          <link
            rel="alternate"
            type="application/rss+xml"
            title={`${title || "Category"} RSS Feed`}
            href={buildFeedUrl(siteUrl, "category", slug)}
          />
          <link
            rel="alternate"
            type="application/atom+xml"
            title={`${title || "Category"} Atom Feed`}
            href={buildFeedUrl(siteUrl, "category", slug, "atom")}
          />
        </>
      )}

      {/* ── Tag feed link ───────────────────────────────────────────────── */}
      {feedType === "tag" && slug && (
        <>
          <link
            rel="alternate"
            type="application/rss+xml"
            title={`${title || "Tag"} RSS Feed`}
            href={buildFeedUrl(siteUrl, "tag", slug)}
          />
          <link
            rel="alternate"
            type="application/atom+xml"
            title={`${title || "Tag"} Atom Feed`}
            href={buildFeedUrl(siteUrl, "tag", slug, "atom")}
          />
        </>
      )}

      {/* ── Author feed link ────────────────────────────────────────────── */}
      {feedType === "author" && slug && (
        <>
          <link
            rel="alternate"
            type="application/rss+xml"
            title={`Posts by ${title || "Author"} RSS Feed`}
            href={buildFeedUrl(siteUrl, "author", slug)}
          />
          <link
            rel="alternate"
            type="application/atom+xml"
            title={`Posts by ${title || "Author"} Atom Feed`}
            href={buildFeedUrl(siteUrl, "author", slug, "atom")}
          />
        </>
      )}

      {/* ── Per-post comment feed link ──────────────────────────────────── */}
      {feedType === "postComments" && slug && commentFeedEnabled && (
        <>
          <link
            rel="alternate"
            type="application/rss+xml"
            title={`Comments on "${title || "Post"}" RSS Feed`}
            href={buildFeedUrl(siteUrl, "postComments", slug)}
          />
          <link
            rel="alternate"
            type="application/atom+xml"
            title={`Comments on "${title || "Post"}" Atom Feed`}
            href={buildFeedUrl(siteUrl, "postComments", slug, "atom")}
          />
        </>
      )}
    </>
  );
}
