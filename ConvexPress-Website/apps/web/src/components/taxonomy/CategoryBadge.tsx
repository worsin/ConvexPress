/**
 * CategoryBadge - Category badge for post cards
 *
 * Small badge/label linking to /category/$slug.
 * Used on post cards throughout the website.
 *
 * This is the taxonomy-namespaced version. The blog/CategoryBadge
 * component already exists with identical behavior. This provides
 * a taxonomy-system entry point for consistency.
 */

import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

interface CategoryBadgeProps {
  name: string;
  slug: string;
  className?: string;
}

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
