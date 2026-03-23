import { cn } from "@/lib/utils";
import type { ArchiveData } from "@/lib/blog/types";

interface ArchiveHeaderProps {
  archive: ArchiveData;
  className?: string;
}

/**
 * Shared header for category/tag/author archive pages.
 * Displays the archive title, description, and post count.
 */
export function ArchiveHeader({ archive, className }: ArchiveHeaderProps) {
  const typeLabels: Record<ArchiveData["type"], string> = {
    category: "Category",
    tag: "Tag",
    author: "Author",
    date: "Archive",
  };

  return (
    <div
      data-slot="archive-header"
      className={cn(
        "flex flex-col gap-2 border-b border-border pb-6",
        className,
      )}
    >
      {/* Type Label */}
      <span className="text-xs uppercase tracking-wider text-muted-foreground">
        {typeLabels[archive.type]}
      </span>

      {/* Title + Image Row */}
      <div className="flex items-center gap-4">
        {archive.imageUrl && (
          <img
            src={archive.imageUrl}
            alt={archive.title}
            className="size-12 rounded-none object-cover"
          />
        )}
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-bold">{archive.title}</h1>
          <span className="text-xs text-muted-foreground">
            {archive.postCount} {archive.postCount === 1 ? "post" : "posts"}
          </span>
        </div>
      </div>

      {/* Description */}
      {archive.description && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {archive.description}
        </p>
      )}
    </div>
  );
}
