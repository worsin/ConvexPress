/**
 * Search Pagination
 *
 * Search-specific pagination component that wraps PostPagination with
 * proper URL construction for search results. Preserves current query,
 * content type filter, and sort parameters when navigating between pages.
 *
 * Usage:
 *   <SearchPagination
 *     query="react hooks"
 *     page={1}
 *     totalPages={5}
 *     total={47}
 *     perPage={10}
 *     type="post"
 *     sort="relevance"
 *   />
 */

import { cn } from "@/lib/utils";
import { PostPagination } from "@/components/blog/PostPagination";
import type { PaginationData } from "@/lib/blog/types";

interface SearchPaginationProps {
  query: string;
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
  type?: string;
  sort?: string;
  className?: string;
}

/**
 * Build the base URL for search pagination, preserving filter params.
 */
function buildSearchBaseUrl(
  query: string,
  type?: string,
  sort?: string,
): string {
  const params = new URLSearchParams();
  params.set("q", query);
  if (type) params.set("type", type);
  if (sort && sort !== "relevance") params.set("sort", sort);
  return `/search?${params.toString()}`;
}

export function SearchPagination({
  query,
  page,
  totalPages,
  total,
  perPage,
  type,
  sort,
  className,
}: SearchPaginationProps) {
  if (totalPages <= 1) return null;

  const pagination: PaginationData = {
    currentPage: page,
    totalPages,
    totalItems: total,
    perPage,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };

  const baseUrl = buildSearchBaseUrl(query, type, sort);

  return (
    <SearchPaginationWrapper className={className}>
      <PostPagination pagination={pagination} baseUrl={baseUrl} />
    </SearchPaginationWrapper>
  );
}

/**
 * Wrapper div with search-specific data attribute for styling hooks.
 */
function SearchPaginationWrapper({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div data-slot="search-pagination" className={cn("pt-4", className)}>
      {children}
    </div>
  );
}
