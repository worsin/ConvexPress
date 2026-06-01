/**
 * Sitemap System - Core Helper Functions
 *
 * Provides XML generation utilities, URL building, content hashing,
 * W3C datetime formatting, and settings resolution for sitemap generation.
 *
 * All XML output complies with the sitemaps.org protocol:
 *   - UTF-8 encoding
 *   - Namespace: http://www.sitemaps.org/schemas/sitemap/0.9
 *   - Max 50,000 URLs per file
 *   - W3C Datetime format for <lastmod>
 *   - Fully qualified absolute URLs
 *
 * Usage:
 *   import {
 *     buildUrlSetXml,
 *     buildSitemapIndexXml,
 *     toW3CDatetime,
 *     escapeXml,
 *     computeContentHash,
 *   } from "../helpers/sitemap";
 */

import type { SitemapChangefreq } from "../sitemaps/validators";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A single URL entry in a sitemap.
 */
export interface SitemapUrlEntry {
  /** Fully qualified absolute URL */
  loc: string;
  /** W3C Datetime (ISO 8601) for last modification */
  lastmod: string;
  /** Hint to crawlers about change frequency */
  changefreq: SitemapChangefreq;
  /** Relative importance 0.0 - 1.0 */
  priority: number;
}

/**
 * A sub-sitemap reference in the sitemap index.
 */
export interface SitemapIndexEntry {
  /** Full URL to the sub-sitemap XML file */
  loc: string;
  /** W3C Datetime for when the sub-sitemap was last modified */
  lastmod: string;
}

// ─── XML Constants ───────────────────────────────────────────────────────────

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';
const SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9";

/**
 * Optional: XSL stylesheet processing instruction.
 * When included, browsers render the XML as a styled HTML table.
 */
const XSL_PI = '<?xml-stylesheet type="text/xsl" href="/sitemap-style.xsl"?>';

// ─── XML Escaping ────────────────────────────────────────────────────────────

/**
 * Escape special XML characters in a string.
 * Prevents XML injection and ensures valid output.
 *
 * @param str - The raw string to escape
 * @returns XML-safe string
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ─── W3C Datetime ────────────────────────────────────────────────────────────

/**
 * Convert a Unix timestamp (ms) to W3C Datetime format (ISO 8601).
 * Produces YYYY-MM-DDTHH:mm:ssZ format as required by sitemaps.org.
 *
 * @param timestampMs - Unix timestamp in milliseconds
 * @returns W3C Datetime string (e.g., "2025-06-15T14:30:00Z")
 */
export function toW3CDatetime(timestampMs: number): string {
  return new Date(timestampMs).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Convert a Unix timestamp (ms) to a date-only W3C format.
 * Used when time precision is not needed (e.g., for infrequently-changing pages).
 *
 * @param timestampMs - Unix timestamp in milliseconds
 * @returns Date string (e.g., "2025-06-15")
 */
export function toW3CDate(timestampMs: number): string {
  return new Date(timestampMs).toISOString().split("T")[0];
}

// ─── URL Set XML (Sub-Sitemaps) ──────────────────────────────────────────────

/**
 * Build a complete XML sitemap from an array of URL entries.
 * Produces a <urlset> document compliant with sitemaps.org protocol.
 *
 * @param urls - Array of SitemapUrlEntry objects
 * @param includeXsl - Whether to include XSL stylesheet reference (default: true)
 * @returns Complete XML string for a sitemap
 */
export function buildUrlSetXml(urls: SitemapUrlEntry[], includeXsl = true): string {
  const lines: string[] = [XML_DECLARATION];

  if (includeXsl) {
    lines.push(XSL_PI);
  }

  lines.push(`<urlset xmlns="${SITEMAP_NS}">`);

  for (const url of urls) {
    lines.push("  <url>");
    lines.push(`    <loc>${escapeXml(url.loc)}</loc>`);
    lines.push(`    <lastmod>${url.lastmod}</lastmod>`);
    lines.push(`    <changefreq>${url.changefreq}</changefreq>`);
    lines.push(`    <priority>${url.priority.toFixed(1)}</priority>`);
    lines.push("  </url>");
  }

  lines.push("</urlset>");

  return lines.join("\n");
}

// ─── Sitemap Index XML ───────────────────────────────────────────────────────

/**
 * Build a complete XML sitemap index from an array of sub-sitemap references.
 * Produces a <sitemapindex> document compliant with sitemaps.org protocol.
 *
 * @param sitemaps - Array of SitemapIndexEntry objects
 * @param includeXsl - Whether to include XSL stylesheet reference (default: true)
 * @returns Complete XML string for a sitemap index
 */
export function buildSitemapIndexXml(sitemaps: SitemapIndexEntry[], includeXsl = true): string {
  const lines: string[] = [XML_DECLARATION];

  if (includeXsl) {
    lines.push(XSL_PI);
  }

  lines.push(`<sitemapindex xmlns="${SITEMAP_NS}">`);

  for (const sitemap of sitemaps) {
    lines.push("  <sitemap>");
    lines.push(`    <loc>${escapeXml(sitemap.loc)}</loc>`);
    lines.push(`    <lastmod>${sitemap.lastmod}</lastmod>`);
    lines.push("  </sitemap>");
  }

  lines.push("</sitemapindex>");

  return lines.join("\n");
}

// ─── Content Hash ────────────────────────────────────────────────────────────

/**
 * Compute a SHA-256 content hash from an array of string data points.
 * Used for change detection to skip unnecessary regeneration.
 *
 * In the Convex runtime, we use a simple string-based hash since
 * the Web Crypto API may not be available. This produces a deterministic
 * hash suitable for change detection (not cryptographic security).
 *
 * @param data - Array of strings to hash (e.g., sorted "id:updatedAt" pairs)
 * @returns Hex string hash (deterministic for same input)
 */
export function computeContentHash(data: string[]): string {
  // Simple djb2-based hash suitable for change detection in Convex runtime.
  // For true SHA-256, this would need the Web Crypto API (available in Actions).
  // Since this is used for change detection (not security), djb2 is sufficient.
  const combined = data.join("|");
  let hash = 5381;
  for (let i = 0; i < combined.length; i++) {
    hash = ((hash << 5) + hash + combined.charCodeAt(i)) | 0;
  }
  // Convert to unsigned 32-bit and zero-pad to 8 hex chars, then duplicate
  // for a 64-char "hash-like" string for consistency with the schema spec
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return hex.repeat(8); // 64 char string
}

/**
 * Async SHA-256 hash using Web Crypto API.
 * Only available in Convex Actions (not Queries/Mutations).
 * Use this in the generate action for true cryptographic hashing.
 *
 * @param data - Array of strings to hash
 * @returns 64-char hex SHA-256 hash
 */
export async function computeContentHashAsync(data: string[]): Promise<string> {
  const combined = data.join("|");
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(combined);

  try {
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // Fallback to synchronous hash if crypto.subtle not available
    return computeContentHash(data);
  }
}

// ─── URL Building ────────────────────────────────────────────────────────────

/**
 * Build a full sitemap URL for a content type and page.
 *
 * @param siteUrl - The site's base URL (e.g., "https://example.com")
 * @param type - Content type slug
 * @param page - Page number (1-based)
 * @returns Full URL (e.g., "https://example.com/sitemap-posts-1.xml")
 */
export function buildSubSitemapUrl(siteUrl: string, type: string, page: number): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}/sitemap-${type}-${page}.xml`;
}

/**
 * Build the sitemap index URL.
 *
 * @param siteUrl - The site's base URL
 * @returns Full URL (e.g., "https://example.com/sitemap.xml")
 */
export function buildSitemapIndexUrl(siteUrl: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}/sitemap.xml`;
}

/**
 * Build a post/page URL from its slug.
 *
 * @param siteUrl - The site's base URL
 * @param slug - The post/page slug
 * @param type - "post" or "page"
 * @returns Full URL (e.g., "https://example.com/blog/my-post" or "https://example.com/about")
 */
export function buildContentUrl(siteUrl: string, slug: string, type: "post" | "page"): string {
  const base = siteUrl.replace(/\/+$/, "");
  if (type === "post") {
    return `${base}/blog/${slug}`;
  }
  return `${base}/${slug}`;
}

/**
 * Build a public course landing URL from its slug.
 *
 * @param siteUrl - The site's base URL
 * @param slug - The course slug
 * @returns Full URL (e.g., "https://example.com/courses/my-course")
 */
export function buildCourseUrl(siteUrl: string, slug: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}/courses/${slug}`;
}

/**
 * Build a category archive URL.
 *
 * @param siteUrl - The site's base URL
 * @param slug - The category slug
 * @returns Full URL (e.g., "https://example.com/category/technology")
 */
export function buildCategoryUrl(siteUrl: string, slug: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}/category/${slug}`;
}

/**
 * Build a tag archive URL.
 *
 * @param siteUrl - The site's base URL
 * @param slug - The tag slug
 * @returns Full URL (e.g., "https://example.com/tag/javascript")
 */
export function buildTagUrl(siteUrl: string, slug: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}/tag/${slug}`;
}

/**
 * Build an author archive URL.
 *
 * @param siteUrl - The site's base URL
 * @param userSlug - The author's username or slug
 * @returns Full URL (e.g., "https://example.com/author/john-doe")
 */
export function buildAuthorUrl(siteUrl: string, userSlug: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}/author/${userSlug}`;
}

/**
 * Build the homepage URL.
 *
 * @param siteUrl - The site's base URL
 * @returns The homepage URL with trailing slash
 */
export function buildHomepageUrl(siteUrl: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}/`;
}

// ─── Pagination Helper ───────────────────────────────────────────────────────

/**
 * Paginate an array of items into chunks.
 *
 * @param items - Array of items to paginate
 * @param pageSize - Maximum items per page
 * @returns Array of pages, each an array of items
 */
export function paginate<T>(items: T[], pageSize: number): T[][] {
  if (items.length === 0) return [];

  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += pageSize) {
    pages.push(items.slice(i, i + pageSize));
  }
  return pages;
}
