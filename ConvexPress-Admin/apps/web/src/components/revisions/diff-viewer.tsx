/**
 * DiffViewer - Side-by-side diff renderer for revision comparison
 *
 * Renders three sections: Title, Content, Excerpt.
 * Each section shows deletions in red with strikethrough,
 * additions in green, and unchanged text normally.
 * Shows "(no changes)" when a section is identical.
 *
 * Content is first attempted as block-level diff (for structured editor JSON),
 * then falls back to plain text diff.
 */

import { useMemo } from "react";
import { computeDiff, areEqual, type DiffResult } from "@/lib/diff";
import { computeBlockDiff, extractBlockText } from "@/lib/blockDiff";
import { TwoColumnDiffPane } from "./diff-pane";

interface DiffViewerProps {
  /** Left (older) revision data. */
  left: {
    title: string;
    content: string;
    excerpt?: string;
  };
  /** Right (newer) revision data. */
  right: {
    title: string;
    content: string;
    excerpt?: string;
  };
}

export function DiffViewer({ left, right }: DiffViewerProps) {
  // ─── Title diff ──────────────────────────────────────────────────────
  const titleDiff = useMemo<{ diffs: DiffResult[]; isIdentical: boolean }>(() => {
    const identical = areEqual(left.title, right.title);
    if (identical) return { diffs: [], isIdentical: true };
    return { diffs: computeDiff(left.title, right.title), isIdentical: false };
  }, [left.title, right.title]);

  // ─── Content diff ────────────────────────────────────────────────────
  const contentDiff = useMemo<{ diffs: DiffResult[]; isIdentical: boolean }>(() => {
    const identical = areEqual(left.content, right.content);
    if (identical) return { diffs: [], isIdentical: true };

    // Try block-level diff first
    const blockDiffs = computeBlockDiff(left.content, right.content);
    if (blockDiffs) {
      // Convert block diffs into a flat DiffResult array for rendering
      const flatDiffs: DiffResult[] = [];
      for (const blockDiff of blockDiffs) {
        switch (blockDiff.status) {
          case "unchanged":
            if (blockDiff.leftText) {
              flatDiffs.push({ type: "unchanged", text: blockDiff.leftText + "\n" });
            }
            break;
          case "removed":
            if (blockDiff.leftText) {
              flatDiffs.push({ type: "removed", text: blockDiff.leftText + "\n" });
            }
            break;
          case "added":
            if (blockDiff.rightText) {
              flatDiffs.push({ type: "added", text: blockDiff.rightText + "\n" });
            }
            break;
          case "modified":
            if (blockDiff.textDiff) {
              flatDiffs.push(...blockDiff.textDiff);
              flatDiffs.push({ type: "unchanged", text: "\n" });
            }
            break;
        }
      }
      return { diffs: flatDiffs, isIdentical: false };
    }

    // Fall back to plain text diff
    return { diffs: computeDiff(left.content, right.content), isIdentical: false };
  }, [left.content, right.content]);

  // ─── Excerpt diff ────────────────────────────────────────────────────
  const excerptDiff = useMemo<{ diffs: DiffResult[]; isIdentical: boolean }>(() => {
    const leftExcerpt = left.excerpt ?? "";
    const rightExcerpt = right.excerpt ?? "";
    const identical = areEqual(leftExcerpt, rightExcerpt);
    if (identical) return { diffs: [], isIdentical: true };
    return { diffs: computeDiff(leftExcerpt, rightExcerpt), isIdentical: false };
  }, [left.excerpt, right.excerpt]);

  return (
    <div className="border border-border bg-card">
      <TwoColumnDiffPane
        label="Title"
        diffs={titleDiff.diffs}
        isIdentical={titleDiff.isIdentical}
      />
      <TwoColumnDiffPane
        label="Content"
        diffs={contentDiff.diffs}
        isIdentical={contentDiff.isIdentical}
      />
      <TwoColumnDiffPane
        label="Excerpt"
        diffs={excerptDiff.diffs}
        isIdentical={excerptDiff.isIdentical}
      />
    </div>
  );
}
