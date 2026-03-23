import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { PaginationData } from "@/lib/blog/types";

interface PostPaginationProps {
  pagination: PaginationData;
  baseUrl: string;
  className?: string;
}

/**
 * Numbered pagination for post listings.
 * Renders page numbers, prev/next links, and ellipsis for gaps.
 */
export function PostPagination({
  pagination,
  baseUrl,
  className,
}: PostPaginationProps) {
  const { currentPage, totalPages } = pagination;

  if (totalPages <= 1) return null;

  // Build page numbers with ellipsis
  const pages = buildPageNumbers(currentPage, totalPages);

  function getPageUrl(page: number) {
    if (page === 1) return baseUrl;
    const separator = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${separator}page=${page}`;
  }

  return (
    <nav
      data-slot="post-pagination"
      aria-label="Pagination"
      className={cn("flex items-center justify-center gap-1", className)}
    >
      {/* Previous */}
      {pagination.hasPreviousPage ? (
        <Link
          to={getPageUrl(currentPage - 1)}
          className="flex items-center gap-1 rounded-none border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Previous page"
        >
          <ChevronLeft className="size-3" aria-hidden="true" />
          <span className="hidden sm:inline">Previous</span>
        </Link>
      ) : (
        <span className="flex items-center gap-1 rounded-none border border-border px-2.5 py-1.5 text-xs text-muted-foreground opacity-50">
          <ChevronLeft className="size-3" aria-hidden="true" />
          <span className="hidden sm:inline">Previous</span>
        </span>
      )}

      {/* Page Numbers */}
      {pages.map((page, index) => {
        if (page === "ellipsis") {
          return (
            <span
              key={`ellipsis-${index}`}
              className="px-1.5 py-1.5 text-xs text-muted-foreground"
              aria-hidden="true"
            >
              ...
            </span>
          );
        }

        const isActive = page === currentPage;
        return (
          <Link
            key={page}
            to={getPageUrl(page)}
            className={cn(
              "flex size-8 items-center justify-center rounded-none border text-xs transition-colors",
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            aria-label={`Page ${page}`}
            aria-current={isActive ? "page" : undefined}
          >
            {page}
          </Link>
        );
      })}

      {/* Next */}
      {pagination.hasNextPage ? (
        <Link
          to={getPageUrl(currentPage + 1)}
          className="flex items-center gap-1 rounded-none border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="size-3" aria-hidden="true" />
        </Link>
      ) : (
        <span className="flex items-center gap-1 rounded-none border border-border px-2.5 py-1.5 text-xs text-muted-foreground opacity-50">
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="size-3" aria-hidden="true" />
        </span>
      )}
    </nav>
  );
}

/**
 * Build array of page numbers with ellipsis for gaps.
 * Shows: first, last, and 2 pages around the current page.
 */
function buildPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "ellipsis")[] = [];
  const rangeStart = Math.max(2, current - 1);
  const rangeEnd = Math.min(total - 1, current + 1);

  // Always show first page
  pages.push(1);

  // Ellipsis after first page?
  if (rangeStart > 2) {
    pages.push("ellipsis");
  }

  // Pages around current
  for (let i = rangeStart; i <= rangeEnd; i++) {
    pages.push(i);
  }

  // Ellipsis before last page?
  if (rangeEnd < total - 1) {
    pages.push("ellipsis");
  }

  // Always show last page
  pages.push(total);

  return pages;
}
