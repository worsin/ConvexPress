/**
 * Search System - Stop Words Utility
 *
 * STATUS: ORPHANED - This utility is currently unused by Convex functions.
 * The equivalent implementation lives in `convex/search/helpers.ts` and
 * `convex/search/validators.ts` (for DEFAULT_STOP_WORDS). This standalone
 * version includes the extra `parseStopWordsString()` utility for parsing
 * settings values, which may be useful when the Settings System integration
 * is implemented.
 *
 * Stop words are common words stripped from search queries before indexing
 * and searching. They add noise without improving relevance.
 *
 * Key behaviors:
 *   - If ALL words in a query are stop words, the original query is preserved
 *     (never produce an empty search query)
 *   - Custom stop words can be provided (from Settings System)
 *   - Number-only tokens are never treated as stop words
 */

/**
 * Default English stop words.
 * Configurable via Settings System (search_stop_words setting).
 */
export const DEFAULT_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "if",
  "in",
  "into",
  "is",
  "it",
  "no",
  "not",
  "of",
  "on",
  "or",
  "such",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "they",
  "this",
  "to",
  "was",
  "will",
  "with",
]);

/**
 * Remove stop words from a query string.
 *
 * If ALL words are stop words, returns the original query unchanged.
 * Numbers are never treated as stop words.
 *
 * @param queryStr - The search query string (should be lowercased)
 * @param stopWords - Set of stop words to filter (defaults to DEFAULT_STOP_WORDS)
 * @returns The query with stop words removed, or the original if all were stop words
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

  // If all words were stop words, keep the original
  if (filtered.length === 0) return queryStr;

  return filtered.join(" ");
}

/**
 * Parse a newline-separated stop words string (from Settings) into a Set.
 *
 * @param raw - Newline-separated stop words string
 * @returns Set of lowercase stop words
 */
export function parseStopWordsString(raw: string): Set<string> {
  return new Set(
    raw
      .split(/\r?\n/)
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean),
  );
}
