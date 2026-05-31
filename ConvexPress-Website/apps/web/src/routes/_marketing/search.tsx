import { convexQuery } from "@convex-dev/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { useEffect, useRef, useCallback } from "react";

import { api } from "@convexpress-website/backend/generated/api";
import { useSetting } from "@/contexts/SettingsContext";
import type { PaginationData, SearchResult } from "@/lib/blog/types";
import { PostPagination } from "@/components/blog/PostPagination";
import { SearchForm } from "@/components/blog/SearchForm";
import { SearchResultCard } from "@/components/blog/SearchResultCard";
import { SearchFilters } from "@/components/search/SearchFilters";
import { EmptySearchResults } from "@/components/search/EmptySearchResults";
import { Skeleton } from "@/components/ui/skeleton";
import { buildSeoHead } from "@/lib/seo/head";

/** Content type filter for search API */
type SearchContentType = "post" | "page" | "media" | "course" | undefined;
/** Sort order for search API */
type SearchOrderBy = "relevance" | "date" | "title";

interface SearchPageParams {
  q?: string;
  page?: number;
  type?: string;
  sort?: string;
}

export const Route = createFileRoute("/_marketing/search")({
  component: SearchPage,
  validateSearch: (search: Record<string, unknown>): SearchPageParams => ({
    q: typeof search.q === "string" ? search.q : undefined,
    page: Number(search.page) || 1,
    type: typeof search.type === "string" ? search.type : undefined,
    sort: typeof search.sort === "string" ? search.sort : undefined,
  }),
  loaderDeps: ({ search: { q, page, type, sort } }) => ({ q, page, type, sort }),
  loader: async ({ context: { queryClient }, deps: { q, page, type, sort } }) => {
    const hasQuery = Boolean(q && q.trim());
    if (hasQuery) {
      await queryClient.ensureQueryData(
        convexQuery(api.search.queries.search, {
          q: q!.trim(),
          page: page ?? 1,
          perPage: 10,
          contentType: type as SearchContentType,
          orderBy: (sort as SearchOrderBy) ?? "relevance",
        }),
      );
    }
  },
  head: (ctx) => {
    const search = (ctx as { search?: SearchPageParams }).search;
    const query = typeof search?.q === "string" ? search.q : "";
    return buildSeoHead({
      title: query ? `Search: ${query} - ConvexPress` : "Search - ConvexPress",
      robots: "noindex, follow",
    });
  },
});

function SearchPage() {
  const { q: query, page, type, sort } = Route.useSearch();
  const postsPerPage = useSetting("postsPerPage") ?? 10;

  const hasQuery = Boolean(query && query.trim());

  // Connect to Convex search query
  // API uses `orderBy` (not `sort`) and returns `total` (not `totalCount`)
  const searchData = useQuery(
    api.search.queries.search,
    hasQuery
      ? {
          q: query!.trim(),
          page: page ?? 1,
          perPage: postsPerPage,
          contentType: type as SearchContentType,
          orderBy: (sort as SearchOrderBy) ?? "relevance",
        }
      : "skip",
  );

  // ── Analytics: Log search query after results return (#23) ──────────
  const logSearch = useMutation(api.search.mutations.logSearch);
  const logClick = useMutation(api.search.mutations.logClick);
  const searchQueryIdRef = useRef<string | null>(null);
  const lastLoggedRef = useRef<string>("");

  useEffect(() => {
    if (!searchData || !hasQuery) return;
    // Build a fingerprint to avoid double-logging the same search
    const fingerprint = `${query}|${page}|${type}|${sort}|${searchData.total}`;
    if (fingerprint === lastLoggedRef.current) return;
    lastLoggedRef.current = fingerprint;

    // Build normalizedQuery by removing common stop words (lightweight client-side)
    const normalizedQuery = (query ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

    logSearch({
      query: normalizedQuery,
      normalizedQuery,
      resultCount: searchData.total,
      source: "website",
      contentTypeFilter: type as SearchContentType,
    })
      .then((id: string) => {
        searchQueryIdRef.current = id;
      })
      .catch(() => {
        // Analytics logging is non-blocking; silently ignore failures
      });
  }, [searchData, hasQuery, query, page, type, sort, logSearch]);

  // ── Click tracking: log result clicks with searchQueryId (#55) ──────
  const handleResultClick = useCallback(
    (contentType: string, contentId: string, position: number) => {
      const sqId = searchQueryIdRef.current;
      if (!sqId) return;
      logClick({
        searchQueryId: sqId,
        contentType: contentType as SearchContentType,
        contentId,
        position,
      }).catch(() => {
        // Non-blocking
      });
    },
    [logClick],
  );

  // Map Convex search results to SearchResult type expected by components
  const results: SearchResult[] | undefined = searchData?.results?.map(
    (r: NonNullable<NonNullable<typeof searchData>['results']>[number], index: number) => ({
      _id: r.contentId,
      title: r.title,
      slug: r.url?.split("/").pop() ?? r.contentId,
      excerpt: "",
      highlightedExcerpt: r.excerpt,
      contentType: r.contentType,
      publishedAt: r.publishedAt
        ? new Date(r.publishedAt).toISOString()
        : undefined,
      author: r.authorName
        ? { displayName: r.authorName, slug: "" }
        : undefined,
      url: r.url,
      categoryNames: r.categoryNames,
      tagNames: r.tagNames,
      mimeType: r.mimeType,
      _position: index + 1, // 1-based position for click tracking
    }),
  );

  const total = searchData?.total ?? 0;
  const totalPages = searchData?.totalPages ?? 0;

  const pagination: PaginationData | undefined =
    results && totalPages > 1
      ? {
          currentPage: searchData.page,
          totalPages,
          totalItems: total,
          perPage: searchData.perPage,
          hasNextPage: searchData.page < totalPages,
          hasPreviousPage: searchData.page > 1,
        }
      : undefined;

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
                      handleResultClick(
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
