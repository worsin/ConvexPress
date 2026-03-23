/**
 * RSS/Feed System - Shared Feed Utility Functions
 *
 * Extracted from buildFeedResponse.ts to eliminate in-file duplication
 * and provide a single internal source of truth for feed utilities
 * within the ConvexPress-Website.
 *
 * NOTE: The ConvexPress-Admin backend has parallel copies of these functions in:
 *   - convex/helpers/feedXml.ts (escapeXml, escapeCdata, toRfc2822, toIso8601, generateETag)
 *   - convex/helpers/feedContent.ts (formatContentForFeed, formatExcerptForFeed)
 *   - convex/helpers/feedUrls.ts (getFeedUrl)
 *
 * The backend copies are retained for the alternative Convex HTTP Actions
 * approach (Option B) and for unit testing. This file is the canonical source
 * for the active TanStack Start API routes (Option A).
 *
 * If shared code between monorepos is needed in the future, extract to a
 * shared package (e.g., packages/feed-utils/).
 */

// ─── XML Escaping ───────────────────────────────────────────────────────────

/**
 * Escape special XML characters to prevent injection.
 * Handles the five predefined XML entities: & < > " '
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Escape content for safe inclusion inside a CDATA section.
 * The `]]>` sequence breaks CDATA; split it using the standard technique.
 */
export function escapeCdata(str: string): string {
  return str.replace(/\]\]>/g, "]]]]><![CDATA[>");
}

// ─── Date Formatting ────────────────────────────────────────────────────────

const RFC2822_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const RFC2822_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Format a Unix timestamp (ms) as an RFC 2822 date string.
 * Used for RSS `<pubDate>` and `<lastBuildDate>` elements.
 */
export function toRfc2822(timestamp: number): string {
  const d = new Date(timestamp);
  const day = RFC2822_DAYS[d.getUTCDay()];
  const date = String(d.getUTCDate()).padStart(2, "0");
  const month = RFC2822_MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const hours = String(d.getUTCHours()).padStart(2, "0");
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  const seconds = String(d.getUTCSeconds()).padStart(2, "0");
  return `${day}, ${date} ${month} ${year} ${hours}:${minutes}:${seconds} +0000`;
}

/**
 * Format a Unix timestamp (ms) as an ISO 8601 date string (UTC).
 * Used for Atom `<published>` and `<updated>` elements.
 */
export function toIso8601(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

// ─── Content Sanitization ───────────────────────────────────────────────────

/**
 * Sanitize and prepare HTML content for feed inclusion.
 *
 * Processing steps:
 *   1. Convert relative URLs to absolute URLs using siteUrl
 *   2. Strip <script> tags and javascript: URLs
 *   3. Strip on* event handler attributes
 *   4. Strip <iframe> elements (convert to plain-text links)
 *   5. Strip <form> elements and their children
 *   6. Strip potentially dangerous inline styles
 *   7. Ensure image alt text presence
 */
export function formatContentForFeed(content: string, siteUrl: string): string {
  if (!content) return "";
  let html = content;
  const baseUrl = siteUrl.replace(/\/+$/, "");

  // Convert relative URLs to absolute
  html = html.replace(
    /((?:src|href|action|poster)=["'])\/(?!\/)/gi,
    `$1${baseUrl}/`,
  );

  // Strip <script> tags
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  html = html.replace(/<script\b[^>]*\/>/gi, "");

  // Strip javascript: URLs
  html = html.replace(/href=["']javascript:[^"']*["']/gi, 'href="#"');
  html = html.replace(/src=["']javascript:[^"']*["']/gi, 'src=""');

  // Strip on* event handlers
  html = html.replace(/\s+on\w+=["'][^"']*["']/gi, "");

  // Strip <iframe> elements (convert to links)
  html = html.replace(
    /<iframe\b[^>]*src=["']([^"']*)["'][^>]*(?:title=["']([^"']*)["'])?[^>]*>[\s\S]*?<\/iframe>/gi,
    (_, src, title) => {
      const linkText = title || src || "Embedded content";
      return `<p><a href="${escapeXml(src)}">${escapeXml(linkText)}</a></p>`;
    },
  );
  html = html.replace(
    /<iframe\b[^>]*src=["']([^"']*)["'][^>]*\/>/gi,
    (_, src) => `<p><a href="${escapeXml(src)}">${escapeXml(src)}</a></p>`,
  );
  html = html.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "");
  html = html.replace(/<iframe\b[^>]*\/>/gi, "");

  // Strip <form> elements
  html = html.replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, "");

  // Strip dangerous inline styles
  html = html.replace(
    /style=["'][^"']*(?:position\s*:\s*(?:fixed|absolute)|z-index\s*:|pointer-events\s*:\s*none)[^"']*["']/gi,
    "",
  );

  // Ensure images have alt text
  html = html.replace(/<img\b(?![^>]*\balt=)/gi, '<img alt=""');

  return html;
}

/**
 * Generate a feed-safe excerpt from a post.
 *
 * Priority:
 *   1. If manual excerpt exists, use it
 *   2. Otherwise, strip HTML from content, truncate to maxLength at word boundary
 */
export function formatExcerptForFeed(
  post: { excerpt?: string | null; content?: string | null },
  maxLength: number = 300,
): string {
  if (post.excerpt && post.excerpt.trim()) {
    return post.excerpt.trim();
  }
  if (!post.content) return "";

  let text = post.content.replace(/<[^>]+>/g, "");
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
  text = text.replace(/\s+/g, " ").trim();

  if (text.length > maxLength) {
    text = text.substring(0, maxLength);
    const lastSpace = text.lastIndexOf(" ");
    if (lastSpace > maxLength * 0.5) {
      text = text.substring(0, lastSpace);
    }
    text = text.trim() + "...";
  }
  return text;
}

// ─── Feed URL Generator ────────────────────────────────────────────────────

type FeedUrlType = "main" | "category" | "tag" | "author" | "comments" | "postComments";

/**
 * Generate the correct feed URL for any feed type and format combination.
 */
export function getFeedUrl(
  siteUrl: string,
  type: FeedUrlType,
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

// ─── ETag Generation ────────────────────────────────────────────────────────

/**
 * Generate a simple ETag string from the last updated timestamp and item count.
 */
export function generateETag(lastUpdatedAt: number, itemCount: number): string {
  return `"${lastUpdatedAt}-${itemCount}"`;
}
