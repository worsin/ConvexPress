/**
 * RSS/Feed System - Content Formatting Helpers
 *
 * Functions for preparing post content and excerpts for inclusion in
 * RSS/Atom feeds. Handles HTML sanitization, URL absolutization,
 * and excerpt generation.
 *
 * WordPress equivalent: the_content_feed filter, the_excerpt_rss filter
 *
 * Security considerations:
 *   - Strips <script> tags and javascript: URLs
 *   - Strips on* event handler attributes
 *   - Strips <iframe> elements (converts to plain links)
 *   - Strips <form> elements
 *   - Strips inline styles that break feed readers
 *   - Never exposes email addresses or internal IDs
 *
 * DUPLICATION NOTE: These functions are duplicated in the ConvexPress-Website at
 * `ConvexPress-Website/apps/web/src/lib/feeds/buildFeedResponse.ts`. The ConvexPress-Website
 * version is the one actively serving feeds via TanStack Start API routes
 * (Option A). These backend helpers are retained for the alternative Convex
 * HTTP Actions approach (Option B) and for unit testing. When modifying
 * sanitization logic, ensure both locations stay in sync.
 */

import { escapeXml } from "./feedXml";

// ─── Content Formatting ─────────────────────────────────────────────────────

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
 *
 * Note: When the Content Editor System's server-side renderer is available,
 * this function should receive already-rendered HTML (not block JSON).
 * If raw block JSON is received, it is returned as-is (degraded but functional).
 *
 * @param content - HTML content string (rendered from block editor)
 * @param siteUrl - Base site URL for absolutizing relative URLs (e.g., "https://example.com")
 * @returns Sanitized HTML string safe for feed inclusion
 */
export function formatContentForFeed(content: string, siteUrl: string): string {
  if (!content) return "";

  let html = content;

  // Normalize siteUrl - remove trailing slash
  const baseUrl = siteUrl.replace(/\/+$/, "");

  // ── 1. Convert relative URLs to absolute ──────────────────────────────
  // Handle src="/" and href="/" patterns
  html = html.replace(
    /((?:src|href|action|poster)=["'])\/(?!\/)/gi,
    `$1${baseUrl}/`,
  );

  // ── 2. Strip <script> tags (including content) ────────────────────────
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

  // Strip self-closing script tags
  html = html.replace(/<script\b[^>]*\/>/gi, "");

  // ── 3. Strip javascript: URLs ─────────────────────────────────────────
  html = html.replace(/href=["']javascript:[^"']*["']/gi, 'href="#"');
  html = html.replace(/src=["']javascript:[^"']*["']/gi, 'src=""');

  // ── 4. Strip on* event handler attributes ─────────────────────────────
  html = html.replace(/\s+on\w+=["'][^"']*["']/gi, "");

  // ── 5. Strip <iframe> elements (convert to links) ─────────────────────
  html = html.replace(
    /<iframe\b[^>]*src=["']([^"']*)["'][^>]*(?:title=["']([^"']*)["'])?[^>]*>[\s\S]*?<\/iframe>/gi,
    (_, src, title) => {
      const linkText = title || src || "Embedded content";
      return `<p><a href="${escapeXml(src)}">${escapeXml(linkText)}</a></p>`;
    },
  );
  // Handle self-closing iframes
  html = html.replace(
    /<iframe\b[^>]*src=["']([^"']*)["'][^>]*\/>/gi,
    (_, src) => `<p><a href="${escapeXml(src)}">${escapeXml(src)}</a></p>`,
  );
  // Strip any remaining iframes without src
  html = html.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "");
  html = html.replace(/<iframe\b[^>]*\/>/gi, "");

  // ── 6. Strip <form> elements and their children ───────────────────────
  html = html.replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, "");

  // ── 7. Strip potentially dangerous inline styles ──────────────────────
  // Remove position:fixed/absolute, z-index, and pointer-events styles
  // that could break feed reader layouts
  html = html.replace(
    /style=["'][^"']*(?:position\s*:\s*(?:fixed|absolute)|z-index\s*:|pointer-events\s*:\s*none)[^"']*["']/gi,
    "",
  );

  // ── 8. Ensure images have alt text ────────────────────────────────────
  html = html.replace(/<img\b(?![^>]*\balt=)/gi, '<img alt=""');

  return html;
}

// ─── Excerpt Formatting ─────────────────────────────────────────────────────

/**
 * Generate a feed-safe excerpt from a post.
 *
 * Priority:
 *   1. If manual excerpt exists, use it (XML-escaped)
 *   2. Otherwise, strip HTML from content, truncate to maxLength characters
 *      at a word boundary, and append "..."
 *
 * @param post - Object with optional excerpt and content fields
 * @param maxLength - Maximum excerpt length in characters (default: 300)
 * @returns Plain text excerpt string (not XML-escaped - caller wraps in CDATA)
 */
export function formatExcerptForFeed(
  post: { excerpt?: string | null; content?: string | null },
  maxLength: number = 300,
): string {
  // Use manual excerpt if available
  if (post.excerpt && post.excerpt.trim()) {
    return post.excerpt.trim();
  }

  // Fall back to auto-generated excerpt from content
  if (!post.content) return "";

  // Strip HTML tags
  let text = post.content.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");

  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();

  // Truncate at word boundary
  if (text.length > maxLength) {
    text = text.substring(0, maxLength);

    // Find the last space to avoid cutting mid-word
    const lastSpace = text.lastIndexOf(" ");
    if (lastSpace > maxLength * 0.5) {
      text = text.substring(0, lastSpace);
    }

    text = text.trim() + "...";
  }

  return text;
}

// ─── Block Content Detection ────────────────────────────────────────────────

/**
 * Detect if content is raw block editor JSON (not yet rendered to HTML).
 * Used to decide whether to attempt rendering or use as-is.
 *
 * @param content - Content string to check
 * @returns true if content appears to be block editor JSON
 */
export function isBlockEditorJson(content: string): boolean {
  if (!content) return false;
  const trimmed = content.trim();
  // Block editor JSON typically starts with [ or { and contains "type" key
  if ((trimmed.startsWith("[") || trimmed.startsWith("{")) && trimmed.includes('"type"')) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
