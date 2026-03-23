/**
 * TagChip - Tag link chip for post cards
 *
 * Small chip/pill linking to /tag/$slug.
 * Used on post cards and single post pages.
 */

import { Link } from "@tanstack/react-router";
import { Tag } from "lucide-react";

import { cn } from "@/lib/utils";

interface TagChipProps {
  name: string;
  slug: string;
  className?: string;
  /** Whether to show the tag icon. Default: false. */
  showIcon?: boolean;
}

export function TagChip({
  name,
  slug,
  className,
  showIcon = false,
}: TagChipProps) {
  return (
    <Link
      data-slot="tag-chip"
      to="/tag/$slug"
      params={{ slug }}
      className={cn(
        "inline-flex items-center gap-1 rounded-none bg-muted px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground",
        className,
      )}
    >
      {showIcon && <Tag className="size-3" />}
      {name}
    </Link>
  );
}
