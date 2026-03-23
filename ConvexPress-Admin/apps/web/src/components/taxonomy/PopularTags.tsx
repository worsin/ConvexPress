/**
 * PopularTags - Tag cloud component
 *
 * Shows top 20 tags by count with font size proportional to count.
 * Clicking a tag scrolls/highlights it in the list table or triggers a callback.
 * Used on the Tags management page.
 */

import { cn } from "@/lib/utils";

interface TagData {
  _id: string;
  name: string;
  slug: string;
  count: number;
}

interface PopularTagsProps {
  tags: TagData[];
  onTagClick?: (tag: TagData) => void;
  className?: string;
}

/**
 * Compute a font size class based on the tag's count relative to the max count.
 * Returns Tailwind text size class.
 */
function getTagSizeClass(count: number, maxCount: number): string {
  if (maxCount === 0) return "text-xs";
  const ratio = count / maxCount;
  if (ratio > 0.8) return "text-base font-semibold";
  if (ratio > 0.6) return "text-sm font-medium";
  if (ratio > 0.4) return "text-sm";
  if (ratio > 0.2) return "text-xs font-medium";
  return "text-xs";
}

export function PopularTags({ tags, onTagClick, className }: PopularTagsProps) {
  if (tags.length === 0) return null;

  const maxCount = Math.max(...tags.map((t) => t.count), 1);

  return (
    <div className={cn("space-y-2", className)}>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Most Used
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <button
            key={tag._id}
            type="button"
            onClick={() => onTagClick?.(tag)}
            className={cn(
              "text-primary hover:underline transition-colors",
              getTagSizeClass(tag.count, maxCount),
            )}
            title={`${tag.name} (${tag.count})`}
          >
            {tag.name}
          </button>
        ))}
      </div>
    </div>
  );
}
