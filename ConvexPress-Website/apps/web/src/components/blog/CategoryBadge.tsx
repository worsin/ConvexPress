import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

interface CategoryBadgeProps {
  name: string;
  slug: string;
  className?: string;
}

/**
 * Category label/link badge displayed on post cards and single post pages.
 */
export function CategoryBadge({ name, slug, className }: CategoryBadgeProps) {
  return (
    <Link
      data-slot="category-badge"
      to="/category/$slug"
      params={{ slug }}
      className={cn(
        "inline-block rounded-none border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground",
        className,
      )}
    >
      {name}
    </Link>
  );
}
