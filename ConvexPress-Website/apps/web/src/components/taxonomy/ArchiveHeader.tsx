/**
 * ArchiveHeader - Archive page header for taxonomy pages
 *
 * H1 with term name, description paragraph (if exists), post count.
 * Shared by category and tag archive pages.
 *
 * Note: This is an alias/wrapper. The blog/ArchiveHeader component already
 * handles this. This taxonomy-specific version adds the taxonomy type label
 * and is specifically typed for taxonomy term data.
 */

import { cn } from "@/lib/utils";

interface ArchiveHeaderProps {
  /** The term name. */
  name: string;
  /** The taxonomy type. */
  type: "category" | "tag";
  /** Optional description. */
  description?: string;
  /** Number of published posts. */
  postCount: number;
  /** Optional className override. */
  className?: string;
}

export function ArchiveHeader({
  name,
  type,
  description,
  postCount,
  className,
}: ArchiveHeaderProps) {
  const typeLabel = type === "category" ? "Category" : "Tag";

  return (
    <div
      data-slot="taxonomy-archive-header"
      className={cn(
        "flex flex-col gap-2 border-b border-border pb-6",
        className,
      )}
    >
      {/* Type Label */}
      <span className="text-xs uppercase tracking-wider text-muted-foreground">
        {typeLabel}
      </span>

      {/* Title + Count */}
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-bold">{name}</h1>
        <span className="text-xs text-muted-foreground">
          {postCount} {postCount === 1 ? "post" : "posts"}
        </span>
      </div>

      {/* Description */}
      {description && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}
