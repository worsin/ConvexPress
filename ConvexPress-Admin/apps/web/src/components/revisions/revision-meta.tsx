/**
 * RevisionMeta - Metadata display for a single revision
 *
 * Shows author name, avatar, date/time, revision number, and type badge.
 * Rendered as a column header above each side of the diff comparison.
 */

import { User } from "lucide-react";
import { cn } from "@/lib/utils";

interface RevisionMetaProps {
  /** Sequential revision number (e.g., 1, 2, 3...). */
  revisionNumber: number;
  /** Author display name. */
  authorName: string;
  /** Author avatar URL (optional). */
  authorAvatar?: string;
  /** When this revision was created (ms timestamp). */
  createdAt: number;
  /** Revision type: manual or autosave. */
  type: "manual" | "autosave";
  /** Which fields changed in this revision. */
  changedFields?: string[];
  /** Whether this represents the "current" version of the post. */
  isCurrent?: boolean;
  /** Position in the layout (left or right). */
  side: "left" | "right";
}

export function RevisionMeta({
  revisionNumber,
  authorName,
  authorAvatar,
  createdAt,
  type,
  changedFields,
  isCurrent = false,
  side,
}: RevisionMetaProps) {
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(createdAt));

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 border border-border bg-muted/30",
        side === "left" && "border-r-0",
      )}
    >
      {/* Avatar */}
      <div className="shrink-0">
        {authorAvatar ? (
          <img
            src={authorAvatar}
            alt={authorName}
            className="size-8 rounded-full object-cover"
          />
        ) : (
          <div className="size-8 flex items-center justify-center bg-muted rounded-full">
            <User className="size-4 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-foreground">
            {isCurrent ? "Current version" : `Revision #${revisionNumber}`}
          </span>
          {type === "autosave" && (
            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground border border-border">
              Autosave
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {authorName} &middot; {formattedDate}
        </p>
        {changedFields && changedFields.length > 0 && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Changed: {changedFields.join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}
