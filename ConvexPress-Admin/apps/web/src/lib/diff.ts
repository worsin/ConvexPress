/**
 * Diff Utility - Text Diffing with diff-match-patch
 *
 * Client-side wrapper around Google's diff-match-patch library.
 * Used by the revision comparison page to compute and render diffs
 * between two revision snapshots.
 *
 * SmithHarper computes diffs on the client, not the server:
 *   - Convex is not ideal for CPU-intensive text processing
 *   - Client-side diff libraries are mature and fast
 *   - The compare query returns raw content; client computes diff locally
 */

import { diff_match_patch, DIFF_DELETE, DIFF_INSERT } from "diff-match-patch";

const dmp = new diff_match_patch();

// ─── Types ───────────────────────────────────────────────────────────────────

export type DiffType = "removed" | "added" | "unchanged";

export interface DiffResult {
  /** The type of change. */
  type: DiffType;
  /** The text content of this segment. */
  text: string;
}

// ─── Core Diff ───────────────────────────────────────────────────────────────

/**
 * Compute a semantic diff between two text strings.
 *
 * Uses diff-match-patch with semantic cleanup for human-readable results.
 * Returns an array of segments, each tagged as "removed", "added", or "unchanged".
 *
 * @param oldText - The original text (left/older revision)
 * @param newText - The new text (right/newer revision)
 * @returns Array of diff segments
 */
export function computeDiff(oldText: string, newText: string): DiffResult[] {
  if (oldText === newText) {
    return oldText ? [{ type: "unchanged", text: oldText }] : [];
  }

  const diffs = dmp.diff_main(oldText, newText);
  dmp.diff_cleanupSemantic(diffs);

  return diffs.map(([op, text]) => ({
    type: op === DIFF_DELETE ? "removed" : op === DIFF_INSERT ? "added" : "unchanged",
    text,
  }));
}

/**
 * Check whether two strings are identical (no diff needed).
 */
export function areEqual(a: string | undefined, b: string | undefined): boolean {
  return (a ?? "") === (b ?? "");
}

