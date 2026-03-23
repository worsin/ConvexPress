/**
 * Search System - Regex Escape Utility
 *
 * STATUS: ORPHANED - This utility is currently unused by Convex functions.
 * The equivalent implementation lives in `convex/search/helpers.ts`.
 * This standalone version is imported by `lib/search/stripContent.ts`
 * (which is also orphaned). Both exist as reference implementations.
 *
 * Escapes regex-special characters in user input for safe regex construction.
 * Used when building regex patterns from search terms (e.g., highlighted excerpts).
 *
 * Characters escaped: . * + ? ^ $ { } ( ) | [ ] \
 */

/**
 * Escape all regex-special characters in a string.
 *
 * @param str - The raw string to escape
 * @returns The escaped string safe for use in `new RegExp()`
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
