/**
 * Search System - Content Stripping Utilities
 *
 * STATUS: ORPHANED - These utilities are well-written but currently unused.
 * The Convex backend functions use the equivalent implementations in
 * `convex/search/helpers.ts` instead. These standalone versions exist as
 * a reference implementation with more complete HTML entity decoding
 * (including numeric entities and a broader named entity map).
 *
 * FUTURE: Consider refactoring `convex/search/helpers.ts` to import from
 * this module, or using these utilities in client-side code that needs
 * content stripping outside of Convex functions.
 *
 * Pipeline for converting HTML/block markup content into searchable plain text.
 * Also generates highlighted excerpts with <mark> tags around matched terms.
 *
 * Content Processing Pipeline:
 *   Raw Content (HTML / Block Markup)
 *     -> Strip block editor delimiters (<!-- wp:paragraph --> etc.)
 *     -> Strip HTML tags (preserving text content)
 *     -> Decode HTML entities (&amp; -> &, etc.)
 *     -> Normalize whitespace (collapse multiple spaces/newlines)
 *     -> Trim
 *     -> Searchable plain text
 */

import { escapeRegex } from "./escapeRegex";

// ─── HTML Entity Map ────────────────────────────────────────────────────────

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#039;": "'",
  "&#x27;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&ndash;": "\u2013",
  "&mdash;": "\u2014",
  "&lsquo;": "\u2018",
  "&rsquo;": "\u2019",
  "&ldquo;": "\u201C",
  "&rdquo;": "\u201D",
  "&hellip;": "\u2026",
  "&copy;": "\u00A9",
  "&reg;": "\u00AE",
  "&trade;": "\u2122",
};

/**
 * Decode common HTML entities to their character equivalents.
 *
 * Handles named entities and numeric references (decimal + hex).
 *
 * @param text - Text potentially containing HTML entities
 * @returns Text with entities decoded
 */
export function decodeHtmlEntities(text: string): string {
  // Named entities
  let decoded = text;
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    decoded = decoded.split(entity).join(char);
  }

  // Numeric decimal entities: &#123;
  decoded = decoded.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(Number.parseInt(code, 10)),
  );

  // Numeric hex entities: &#x1F4A9;
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );

  return decoded;
}

/**
 * Strip HTML tags, block editor markup, and normalize whitespace for indexing.
 *
 * This is the primary content stripping function. All content stored in the
 * `searchIndex.content` field MUST pass through this function.
 *
 * @param raw - Raw content (may contain HTML, block editor markup)
 * @returns Plain text suitable for full-text indexing
 */
export function stripContentForSearch(raw: string): string {
  let text = raw;

  // Block editor comments: <!-- wp:paragraph --> etc.
  text = text.replace(/<!--\s*\/?wp:[^>]*-->/g, "");

  // Script and style tags with content
  text = text.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ");

  // HTML tags -> space (preserving the text content between tags)
  text = text.replace(/<[^>]+>/g, " ");

  // Decode HTML entities
  text = decodeHtmlEntities(text);

  // Normalize whitespace (collapse multiple spaces, newlines, tabs)
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

/**
 * Truncate a string to a maximum length, preserving word boundaries.
 *
 * @param str - String to truncate
 * @param maxLength - Maximum character length
 * @returns Truncated string
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  const truncated = str.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > maxLength * 0.8
    ? truncated.substring(0, lastSpace)
    : truncated;
}

/**
 * Generate a plain excerpt from content (first N chars, word-boundary safe).
 *
 * @param content - Plain text content (already stripped)
 * @param maxLength - Maximum excerpt length (default 200)
 * @returns Excerpt string
 */
export function generateExcerpt(content: string, maxLength = 200): string {
  return truncate(content, maxLength);
}

/**
 * Generate a highlighted excerpt around search terms.
 *
 * Finds the first occurrence of any search term in the content, extracts a
 * context window around it, and wraps all occurrences of search terms in
 * <mark> tags (or a custom tag).
 *
 * @param content - Content to excerpt from (will be stripped if containing HTML)
 * @param queryTerms - Array of search terms to highlight
 * @param maxLength - Maximum excerpt length in characters (default 200)
 * @param highlightTag - HTML tag to wrap matches in (default "mark")
 * @returns Excerpt string with highlighted terms
 */
export function generateHighlightedExcerpt(
  content: string,
  queryTerms: string[],
  maxLength = 200,
  highlightTag = "mark",
): string {
  if (!content) return "";

  if (!queryTerms.length || queryTerms.every((t) => !t.trim())) {
    return truncate(stripContentForSearch(content), maxLength);
  }

  const stripped = stripContentForSearch(content);
  if (!stripped) return "";

  // Find the first occurrence of any search term for context window positioning
  const lowerContent = stripped.toLowerCase();
  let firstMatchIndex = -1;

  for (const term of queryTerms) {
    if (!term.trim()) continue;
    const idx = lowerContent.indexOf(term.toLowerCase());
    if (idx !== -1 && (firstMatchIndex === -1 || idx < firstMatchIndex)) {
      firstMatchIndex = idx;
    }
  }

  // Extract a window around the first match
  let start = 0;
  if (firstMatchIndex > maxLength / 4) {
    start = Math.max(0, firstMatchIndex - Math.floor(maxLength / 4));
  }
  let excerpt = stripped.substring(start, start + maxLength);

  // Add ellipsis if truncated
  if (start > 0) excerpt = "..." + excerpt;
  if (start + maxLength < stripped.length) excerpt = excerpt + "...";

  // Highlight all search terms in the excerpt
  for (const term of queryTerms) {
    if (!term.trim()) continue;
    const escaped = escapeRegex(term);
    const regex = new RegExp(`(${escaped})`, "gi");
    excerpt = excerpt.replace(
      regex,
      `<${highlightTag}>$1</${highlightTag}>`,
    );
  }

  return excerpt;
}
