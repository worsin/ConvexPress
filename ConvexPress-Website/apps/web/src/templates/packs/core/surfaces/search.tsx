/** Core · search — site-wide search: form, filters, result list, pagination. */
import { PostPagination } from "@/components/blog/PostPagination";
import { SearchForm } from "@/components/blog/SearchForm";
import { SearchResultCard } from "@/components/blog/SearchResultCard";
import { EmptySearchResults } from "@/components/search/EmptySearchResults";
import { SearchFilters } from "@/components/search/SearchFilters";
import { Skeleton } from "@/components/ui/skeleton";
import type { PaginationData, SearchResult } from "@/lib/blog/types";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface SearchSurfaceData {
  /** Raw query from the URL (may be empty). */
  query: string | undefined;
  /** True when the query is non-blank and results are being shown. */
  hasQuery: boolean;
  /** Content-type filter from the URL. */
  type: string | undefined;
  /** Sort order from the URL. */
  sort: string | undefined;
  /** `undefined` while results are loading (or when there is no query). */
  results: SearchResult[] | undefined;
  total: number;
  pagination: PaginationData | undefined;
  /** Click tracking for search analytics; position is 1-based. */
  onResultClick: (contentType: string, contentId: string, position: number) => void;
}

export default function CoreSearch({ data }: SurfaceProps<SearchSurfaceData>) {
  const { query, hasQuery, type, sort, results, total, pagination, onResultClick } = data;
  return (
    <div data-slot="search-page" className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-bold">Search</h1>
        <SearchForm initialQuery={query ?? ""} autoFocus={!hasQuery} />
      </div>

      {/* Results */}
      {hasQuery && (
        <div className="flex flex-col gap-4">
          {/* Filters */}
          <SearchFilters
            currentQuery={query!}
            currentType={type}
            currentSort={sort}
          />

          {/* Result Count */}
          {results !== undefined && total > 0 && (
            <p className="text-xs text-muted-foreground">
              {total} {total === 1 ? "result" : "results"} for{" "}
              <span className="font-medium text-foreground">
                &ldquo;{query}&rdquo;
              </span>
            </p>
          )}

          {/* Loading */}
          {results === undefined ? (
            <div className="flex flex-col gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3 border-b border-border py-4">
                  <Skeleton className="size-8" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-48" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : results.length === 0 ? (
            /* Empty State */
            <EmptySearchResults query={query!} />
          ) : (
            /* Results List */
            <>
              <div className="flex flex-col">
                {results.map((result, index) => (
                  <SearchResultCard
                    key={result._id}
                    result={result}
                    onClick={() =>
                      onResultClick(
                        result.contentType,
                        result._id,
                        index + 1,
                      )
                    }
                  />
                ))}
              </div>

              {pagination && (
                <PostPagination
                  pagination={pagination}
                  baseUrl={`/search?q=${encodeURIComponent(query ?? "")}${type ? `&type=${type}` : ""}${sort ? `&sort=${sort}` : ""}`}
                  className="pt-4"
                />
              )}
            </>
          )}
        </div>
      )}

      {/* No Query State */}
      {!hasQuery && (
        <div className="flex flex-col gap-2 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Enter a search term to find posts, pages, and more.
          </p>
        </div>
      )}
    </div>
  );
}
