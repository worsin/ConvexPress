/**
 * PageBreadcrumbs - Hierarchical breadcrumb navigation for pages
 *
 * Renders the ancestor chain for the current page, starting from Home.
 * Uses the pre-computed breadcrumbs array from the page query or
 * fetches via the getBreadcrumbs query.
 *
 * Example:
 *   Home > Services > Web Design > Current Page
 */

import { Link } from "@tanstack/react-router";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

interface BreadcrumbItem {
  _id: string;
  title: string;
  slug: string;
  path: string;
}

interface PageBreadcrumbsProps {
  breadcrumbs: BreadcrumbItem[];
  /** The current page (last item, rendered without link) */
  currentTitle: string;
  className?: string;
}

export function PageBreadcrumbs({
  breadcrumbs,
  currentTitle,
  className,
}: PageBreadcrumbsProps) {
  // Don't render breadcrumbs for top-level pages with no ancestors
  if (breadcrumbs.length <= 1) {
    return null;
  }

  // Ancestors are all breadcrumbs except the last (which is the current page)
  const ancestors = breadcrumbs.slice(0, -1);

  return (
    <nav
      data-slot="page-breadcrumbs"
      aria-label="Breadcrumb"
      className={cn("flex items-center gap-1 text-xs text-muted-foreground", className)}
    >
      {/* Home link */}
      <Link
        to="/"
        className="flex items-center gap-1 transition-colors hover:text-foreground"
      >
        <Home className="size-3" aria-hidden="true" />
        <span className="sr-only">Home</span>
      </Link>

      {/* Ancestor links */}
      {ancestors.map((ancestor) => (
        <span key={ancestor._id} className="flex items-center gap-1">
          <ChevronRight className="size-3 text-muted-foreground/50" aria-hidden="true" />
	          <Link
	            to={`/page${ancestor.path}`}
	            className="transition-colors hover:text-foreground"
          >
            {ancestor.title}
          </Link>
        </span>
      ))}

      {/* Current page (no link) */}
      <span className="flex items-center gap-1">
        <ChevronRight className="size-3 text-muted-foreground/50" aria-hidden="true" />
        <span className="text-foreground" aria-current="page">
          {currentTitle}
        </span>
      </span>
    </nav>
  );
}
