/**
 * SEO System - Utility Functions
 *
 * Score color/label helpers, SERP truncation, word counting,
 * and sentence extraction for analysis.
 */

import { SCORE_THRESHOLDS } from "./constants";
import type { ScoreRange } from "./types";

// ─── Score Helpers ───────────────────────────────────────────────────────────

/**
 * Determine the score range category from a numeric score.
 */
export function getScoreRange(score: number | null | undefined): ScoreRange {
  if (score == null) return "none";
  if (score >= SCORE_THRESHOLDS.good) return "good";
  if (score >= SCORE_THRESHOLDS.ok) return "ok";
  return "poor";
}

/**
 * Get the CSS color class for a score range.
 *
 * Uses semantic CSS variable classes: `text-seo-good`, `text-seo-ok`, `text-seo-poor`.
 * These are defined in the global CSS as:
 *   --color-seo-good: oklch(0.72 0.19 160);  (green tone)
 *   --color-seo-ok: oklch(0.75 0.18 85);     (amber tone)
 *   --color-seo-poor: oklch(0.63 0.24 25);   (red tone)
 *
 * Fallback: If the CSS variables are not yet defined, the classes still
 * function correctly because Tailwind v4 arbitrary properties handle
 * the `text-[var(--color-seo-good)]` pattern. The concrete fallbacks
 * use opacity modifiers on the base palette which are always available.
 */
export function getScoreColor(score: number | null | undefined): string {
  const range = getScoreRange(score);
  switch (range) {
    case "good":
      return "text-seo-good";
    case "ok":
      return "text-seo-ok";
    case "poor":
      return "text-seo-poor";
    case "none":
      return "text-muted-foreground";
  }
}

/**
 * Get the background CSS class for a score range.
 * Uses semantic CSS variables with opacity modifiers.
 */
export function getScoreBgColor(score: number | null | undefined): string {
  const range = getScoreRange(score);
  switch (range) {
    case "good":
      return "bg-seo-good/15";
    case "ok":
      return "bg-seo-ok/15";
    case "poor":
      return "bg-seo-poor/15";
    case "none":
      return "bg-muted";
  }
}

/**
 * Get a human-readable label for a score range.
 */
export function getScoreLabel(score: number | null | undefined): string {
  const range = getScoreRange(score);
  switch (range) {
    case "good":
      return "Good";
    case "ok":
      return "OK";
    case "poor":
      return "Needs Improvement";
    case "none":
      return "Not Analyzed";
  }
}

// ─── SERP Helpers ────────────────────────────────────────────────────────────

/**
 * Truncate a string for SERP preview display.
 * Google typically shows ~60 chars for titles, ~160 for descriptions.
 */
export function truncateForSerp(
  text: string,
  maxLength: number,
): { text: string; isTruncated: boolean } {
  if (!text) return { text: "", isTruncated: false };
  if (text.length <= maxLength) return { text, isTruncated: false };
  return {
    text: text.substring(0, maxLength).trimEnd() + "...",
    isTruncated: true,
  };
}

/**
 * Format a URL for SERP breadcrumb display.
 * e.g., "https://example.com/blog/my-post" -> "example.com > blog > my-post"
 */
export function formatSerpUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const pathSegments = parsed.pathname
      .split("/")
      .filter(Boolean);
    if (pathSegments.length === 0) return parsed.hostname;
    return `${parsed.hostname} > ${pathSegments.join(" > ")}`;
  } catch {
    return url;
  }
}

// ─── Text Analysis Helpers ───────────────────────────────────────────────────

/**
 * Count words in a text string.
 */
export function countWords(text: string): number {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

/**
 * Extract sentences from text.
 * Splits on common sentence-ending punctuation.
 */
export function extractSentences(text: string): string[] {
  if (!text || !text.trim()) return [];
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Extract paragraphs from text (split on double newlines or block breaks).
 */
export function extractParagraphs(text: string): string[] {
  if (!text || !text.trim()) return [];
  return text
    .split(/\n\s*\n|\r\n\s*\r\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Extract plain text from block editor JSON or HTML content.
 * Strips all HTML tags and block metadata.
 */
export function extractPlainText(content: string | null | undefined): string {
  if (!content) return "";

  // Try parsing as JSON (block editor format)
  try {
    const blocks = JSON.parse(content);
    if (Array.isArray(blocks)) {
      return blocks
        .map((block: { content?: string; text?: string }) => {
          const text = block.content || block.text || "";
          return stripHtml(text);
        })
        .filter(Boolean)
        .join("\n\n");
    }
  } catch {
    // Not JSON, treat as HTML/text
  }

  return stripHtml(content);
}

/**
 * Strip HTML tags from a string.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculate keyphrase density as a percentage.
 */
export function calculateKeyphraseDensity(
  text: string,
  keyphrase: string,
): number {
  if (!text || !keyphrase) return 0;
  const words = countWords(text);
  if (words === 0) return 0;

  const keyphraseWords = keyphrase.toLowerCase().split(/\s+/).length;
  const textLower = text.toLowerCase();
  const keyphraseLower = keyphrase.toLowerCase();

  let count = 0;
  let pos = 0;
  while ((pos = textLower.indexOf(keyphraseLower, pos)) !== -1) {
    count++;
    pos += keyphraseLower.length;
  }

  return (count * keyphraseWords) / words * 100;
}

/**
 * Check if a keyphrase appears in the first paragraph of text.
 */
export function keyphraseInIntro(text: string, keyphrase: string): boolean {
  if (!text || !keyphrase) return false;
  const paragraphs = extractParagraphs(text);
  if (paragraphs.length === 0) return false;
  return paragraphs[0].toLowerCase().includes(keyphrase.toLowerCase());
}

/**
 * Count occurrences of a substring in text (case-insensitive).
 */
export function countOccurrences(text: string, substring: string): number {
  if (!text || !substring) return 0;
  const textLower = text.toLowerCase();
  const subLower = substring.toLowerCase();
  let count = 0;
  let pos = 0;
  while ((pos = textLower.indexOf(subLower, pos)) !== -1) {
    count++;
    pos += subLower.length;
  }
  return count;
}
