/**
 * Search System - Shared Helpers
 *
 * Utility functions used by search queries, mutations, and internals.
 * These helpers are specific to Convex context operations (database queries).
 *
 * For pure utility functions (no db access), see lib/search/ instead.
 */

import type { QueryCtx } from "../_generated/server";
import { DEFAULT_STOP_WORDS } from "./validators";

// ─── Query Helpers ──────────────────────────────────────────────────────────

type ReadCtx = Pick<QueryCtx, "db">;

/**
 * Sanitize and normalize a search query string.
 *
 * @param q - Raw query input
 * @param maxLength - Maximum length (default 500)
 * @returns Sanitized query (trimmed, lowercased, collapsed spaces, truncated)
 */
export function sanitizeQuery(q: string, maxLength = 500): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ").substring(0, maxLength);
}

/**
 * Remove stop words from a query string.
 * If ALL words are stop words, returns the original query.
 *
 * @param queryStr - The search query (should be lowercased)
 * @param stopWords - Set of stop words
 * @returns Query with stop words removed
 */
export function removeStopWords(
  queryStr: string,
  stopWords: Set<string> = DEFAULT_STOP_WORDS,
): string {
  const words = queryStr.split(/\s+/).filter(Boolean);
  if (words.length === 0) return queryStr;

  const filtered = words.filter((w) => {
    // Never filter out numbers
    if (/^\d+$/.test(w)) return true;
    return !stopWords.has(w.toLowerCase());
  });

  if (filtered.length === 0) return queryStr;
  return filtered.join(" ");
}

/**
 * Escape regex-special characters for safe regex construction.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Look up synonym expansions for a set of query terms.
 *
 * @param ctx - Convex query/mutation context
 * @param queryTerms - Array of individual search terms
 * @returns Set of all terms (original + expanded synonyms)
 */
export async function expandWithSynonyms(
  ctx: ReadCtx,
  queryTerms: string[],
): Promise<Set<string>> {
  const expandedTerms = new Set(queryTerms);

  // Fetch all active synonyms
  const activeSynonyms = await ctx.db
    .query("searchSynonyms")
    .withIndex("by_active", (q) => q.eq("isActive", true))
    .collect();

  for (const term of queryTerms) {
    for (const syn of activeSynonyms) {
      if (syn.term === term || syn.synonyms.includes(term)) {
        expandedTerms.add(syn.term);
        for (const s of syn.synonyms) {
          expandedTerms.add(s);
        }
      }
    }
  }

  return expandedTerms;
}

/**
 * Strip HTML tags, block editor markup, and normalize whitespace.
 */
export function stripContentForSearch(raw: string): string {
  let text = raw;
  text = text.replace(/<!--\s*\/?wp:[^>]*-->/g, "");
  text = text.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

/**
 * Escape HTML entities to prevent XSS.
 * Applied to excerpt text BEFORE wrapping matches in <mark> tags.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Generate a highlighted excerpt around search terms.
 * Wraps matched terms in <mark> tags within a context window.
 *
 * #60 FIX: Content is HTML-escaped before highlighting to prevent XSS.
 * Only the <mark> tags we inject are unescaped.
 */
export function generateHighlightedExcerpt(
  content: string,
  queryTerms: string[],
  maxLength = 200,
): string {
  if (!content || !queryTerms.length) {
    return escapeHtml(stripContentForSearch(content).substring(0, maxLength));
  }

  const stripped = stripContentForSearch(content);

  // Find the first occurrence of any search term
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

  if (start > 0) excerpt = "..." + excerpt;
  if (start + maxLength < stripped.length) excerpt = excerpt + "...";

  // #60 FIX: Escape HTML in the excerpt text BEFORE inserting <mark> tags
  excerpt = escapeHtml(excerpt);

  // Highlight all search terms (safe because we escaped everything else first)
  for (const term of queryTerms) {
    if (!term.trim()) continue;
    // Escape the term for regex, but also escape HTML in the term
    // so it matches the already-escaped excerpt
    const escapedTerm = escapeRegex(escapeHtml(term));
    const regex = new RegExp(`(${escapedTerm})`, "gi");
    excerpt = excerpt.replace(regex, "<mark>$1</mark>");
  }

  return excerpt;
}
