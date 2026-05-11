/**
 * RevisionSlider - Horizontal timeline for navigating revisions
 *
 * Renders a horizontal track with revision dots. Supports:
 *   - Single handle mode (default): select one revision, compare with previous
 *   - Dual handle mode (compare any two): select left and right handles independently
 *   - Keyboard navigation: Left/Right arrows step through revisions
 *   - Hover tooltips showing revision number, date, author
 *   - "Current" marker at rightmost position
 *
 * Does NOT use any Radix UI components. Pure HTML/CSS/React.
 */

import { useCallback, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RevisionItem {
  _id: string;
  revisionNumber: number;
  authorName: string;
  authorAvatar?: string;
  createdAt: number;
  type: "manual" | "autosave";
}

interface RevisionSliderProps {
  /** All revisions, sorted by revisionNumber ascending. */
  revisions: RevisionItem[];
  /** Index of the selected revision in the revisions array. */
  selectedIndex: number;
  /** Callback when the selected index changes. */
  onSelectIndex: (index: number) => void;
  /** Whether compare mode is enabled (dual handles). */
  compareMode?: boolean;
  /** Index of the left (from) revision in compare mode. */
  leftIndex?: number;
  /** Callback when the left index changes in compare mode. */
  onSelectLeftIndex?: (index: number) => void;
}

export function RevisionSlider({
  revisions,
  selectedIndex,
  onSelectIndex,
  compareMode = false,
  leftIndex,
  onSelectLeftIndex,
}: RevisionSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const count = revisions.length;
  const canGoPrev = selectedIndex > 0;
  const canGoNext = selectedIndex < count - 1;

  // ─── Navigation ────────────────────────────────────────────────────────
  const goToPrev = useCallback(() => {
    if (canGoPrev) onSelectIndex(selectedIndex - 1);
  }, [canGoPrev, selectedIndex, onSelectIndex]);

  const goToNext = useCallback(() => {
    if (canGoNext) onSelectIndex(selectedIndex + 1);
  }, [canGoNext, selectedIndex, onSelectIndex]);

  // ─── Keyboard ──────────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goToNext();
      }
    },
    [goToPrev, goToNext],
  );

  if (count === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {/* Previous button */}
      <Button
        variant="outline"
        size="icon-sm"
        onClick={goToPrev}
        disabled={!canGoPrev}
        aria-label="Previous revision"
      >
        <ChevronLeft className="size-3.5" />
      </Button>

      {/* Slider track */}
      <div
        ref={trackRef}
        className="flex-1 relative flex items-center py-4 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="listbox"
        aria-label="Revision timeline"
        aria-orientation="horizontal"
        aria-activedescendant={revisions[selectedIndex] ? `revision-dot-${revisions[selectedIndex]._id}` : undefined}
      >
        {/* Track line */}
        <div className="absolute left-0 right-0 h-0.5 bg-border" />

        {/* Active range fill */}
        {count > 1 && (
          <div
            className="absolute h-0.5 bg-primary"
            style={{
              left: compareMode && leftIndex !== undefined
                ? `${(leftIndex / (count - 1)) * 100}%`
                : "0%",
              width: compareMode && leftIndex !== undefined
                ? `${((selectedIndex - leftIndex) / (count - 1)) * 100}%`
                : `${(selectedIndex / (count - 1)) * 100}%`,
            }}
          />
        )}

        {/* Revision dots */}
        {revisions.map((rev, idx) => {
          const isSelected = idx === selectedIndex;
          const isLeftSelected = compareMode && idx === leftIndex;
          const position = count > 1 ? (idx / (count - 1)) * 100 : 50;

          return (
            <button
              key={rev._id}
              id={`revision-dot-${rev._id}`}
              type="button"
              role="option"
              aria-selected={isSelected || isLeftSelected}
              className={cn(
                "absolute -translate-x-1/2 flex items-center justify-center transition-all",
                "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded-full",
                isSelected
                  ? "size-4 bg-primary border-2 border-primary z-10"
                  : isLeftSelected
                    ? "size-4 bg-primary/60 border-2 border-primary/60 z-10"
                    : "size-2.5 bg-border hover:bg-primary/50 hover:scale-150 z-0",
              )}
              style={{ left: `${position}%` }}
              onClick={(e) => {
                if (compareMode && onSelectLeftIndex) {
                  // In compare mode: shift+click or clicking below current right handle sets left
                  if (e.shiftKey || idx < selectedIndex) {
                    onSelectLeftIndex(idx);
                  } else {
                    onSelectIndex(idx);
                  }
                } else {
                  onSelectIndex(idx);
                }
              }}
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
              aria-label={`Revision ${rev.revisionNumber} by ${rev.authorName}${isSelected ? " (selected)" : isLeftSelected ? " (compare from)" : ""}`}
            />
          );
        })}

        {/* Hover tooltip */}
        {hoveredIndex !== null && revisions[hoveredIndex] && (
          <RevisionTooltip
            revision={revisions[hoveredIndex]}
            position={
              count > 1
                ? (hoveredIndex / (count - 1)) * 100
                : 50
            }
            isLast={hoveredIndex === count - 1}
          />
        )}
      </div>

      {/* Next button */}
      <Button
        variant="outline"
        size="icon-sm"
        onClick={goToNext}
        disabled={!canGoNext}
        aria-label="Next revision"
      >
        <ChevronRight className="size-3.5" />
      </Button>
    </div>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function RevisionTooltip({
  revision,
  position,
  isLast,
}: {
  revision: RevisionItem;
  position: number;
  isLast: boolean;
}) {
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(revision.createdAt));

  return (
    <div
      className="absolute bottom-full mb-3 -translate-x-1/2 pointer-events-none z-20"
      style={{ left: `${position}%` }}
    >
      <div className="bg-popover border border-border shadow-md px-2.5 py-1.5 text-[10px] whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          {revision.authorAvatar ? (
            <img
              src={revision.authorAvatar}
              alt=""
              className="size-3.5 rounded-full"
            />
          ) : (
            <User className="size-3 text-muted-foreground" />
          )}
          <span className="font-medium text-foreground">
            #{revision.revisionNumber}
          </span>
          {revision.type === "autosave" && (
            <span className="text-muted-foreground">(autosave)</span>
          )}
        </div>
        <p className="text-muted-foreground mt-0.5">
          {revision.authorName} &middot; {formattedDate}
        </p>
      </div>
      {/* Arrow */}
      <div className="flex justify-center">
        <div className="size-1.5 rotate-45 bg-popover border-r border-b border-border -mt-[3px]" />
      </div>
    </div>
  );
}
