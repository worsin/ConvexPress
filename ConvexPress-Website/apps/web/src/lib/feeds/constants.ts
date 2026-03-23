/**
 * RSS/Feed System - Constants
 *
 * Feed format constants, XML namespace URIs, cache TTLs,
 * and Content-Type mappings used by the website frontend's
 * feed-serving API routes.
 */

// ─── Cache TTLs (seconds) ───────────────────────────────────────────────────

/** Cache max-age for post feeds (main, category, tag, author) - 1 hour */
export const POST_FEED_MAX_AGE = 3600;

/** Cache max-age for comment feeds (global, per-post) - 30 minutes */
export const COMMENT_FEED_MAX_AGE = 1800;

// ─── Content Types ──────────────────────────────────────────────────────────

/** Content-Type header for RSS 2.0 feeds */
export const RSS_CONTENT_TYPE = "application/rss+xml; charset=UTF-8";

/** Content-Type header for Atom 1.0 feeds */
export const ATOM_CONTENT_TYPE = "application/atom+xml; charset=UTF-8";

// ─── Default Feed Item Count ────────────────────────────────────────────────

export const DEFAULT_FEED_ITEM_COUNT = 10;

// ─── XML Namespace URIs ─────────────────────────────────────────────────────

export const XML_NAMESPACES = {
  /** RSS 2.0 content:encoded namespace */
  content: "http://purl.org/rss/1.0/modules/content/",
  /** Dublin Core (dc:creator) namespace */
  dc: "http://purl.org/dc/elements/1.1/",
  /** Atom namespace (atom:link for self-reference in RSS) */
  atom: "http://www.w3.org/2005/Atom",
  /** Syndication namespace (sy:updatePeriod) */
  sy: "http://purl.org/rss/1.0/modules/syndication/",
  /** Slash namespace (slash:comments) */
  slash: "http://purl.org/rss/1.0/modules/slash/",
  /** Media RSS namespace (media:content) */
  media: "http://search.yahoo.com/mrss/",
} as const;

// ─── Feed Format Constants ──────────────────────────────────────────────────

/** Map feed format to Content-Type header */
export function getFeedContentType(format: "rss2" | "atom"): string {
  return format === "atom" ? ATOM_CONTENT_TYPE : RSS_CONTENT_TYPE;
}
