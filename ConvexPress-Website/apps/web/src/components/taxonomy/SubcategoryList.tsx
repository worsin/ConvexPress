/**
 * SubcategoryList - Child category listing on category archive pages
 *
 * Renders child categories as links when viewing a parent category archive.
 * Shows name and post count for each child.
 * Only shown if category has children.
 */

import { Link } from "@tanstack/react-router";
import { FolderOpen } from "lucide-react";

import { cn } from "@/lib/utils";

interface Subcategory {
  _id: string;
  name: string;
  slug: string;
  count: number;
}

interface SubcategoryListProps {
  /** Child categories to display. */
  subcategories: Subcategory[];
  /** Optional className. */
  className?: string;
}

export function SubcategoryList({
  subcategories,
  className,
}: SubcategoryListProps) {
  if (subcategories.length === 0) return null;

  return (
    <div
      data-slot="subcategory-list"
      className={cn("border border-border p-4", className)}
    >
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground mb-3">
        <FolderOpen className="size-4 text-muted-foreground" />
        Subcategories
      </h2>
      <ul className="flex flex-wrap gap-2">
        {subcategories.map((sub) => (
          <li key={sub._id}>
            <Link
              to="/category/$slug"
              params={{ slug: sub.slug }}
              className="inline-flex items-center gap-1 border border-border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              {sub.name}
              <span className="text-[10px] opacity-70">({sub.count})</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
