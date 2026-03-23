/**
 * DiffPane - Renders a single pane of diff output
 *
 * Takes an array of DiffResult segments and renders them with appropriate
 * styling: red background + strikethrough for removals, green background
 * for additions, normal text for unchanged.
 *
 * Uses CSS variables and opacity modifiers only -- no hardcoded colors.
 */

import type { DiffResult } from "@/lib/diff";
import { cn } from "@/lib/utils";

/**
 * TwoColumnDiffPane - Side-by-side diff with left (old) and right (new) labels.
 *
 * Used when showing the full comparison view with both panes visible.
 */
interface TwoColumnDiffPaneProps {
  /** Section label (e.g., "Title", "Content", "Excerpt"). */
  label: string;
  /** Diff segments for the content. */
  diffs: DiffResult[];
  /** Whether both sides are identical. */
  isIdentical: boolean;
}

export function TwoColumnDiffPane({
  label,
  diffs,
  isIdentical,
}: TwoColumnDiffPaneProps) {
  if (isIdentical) {
    return (
      <div className="border-b border-border last:border-b-0">
        <div className="p-3">
          <h4 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
            {label}
          </h4>
          <p className="text-xs text-muted-foreground/60 italic">(no changes)</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="p-3">
        <h4 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
          {label}
        </h4>
        <div className="text-xs leading-relaxed whitespace-pre-wrap break-words font-mono">
          {diffs.map((segment, i) => (
            <span
              key={i}
              className={cn(
                segment.type === "removed" &&
                  "bg-destructive/15 text-destructive line-through",
                segment.type === "added" &&
                  "bg-success/15 text-success",
                segment.type === "unchanged" && "text-foreground",
              )}
            >
              {segment.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
