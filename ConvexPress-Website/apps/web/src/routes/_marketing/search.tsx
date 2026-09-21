import type { Id } from "@convexpress-website/backend/generated/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect, useRef, useCallback } from "react";

import { api } from "@convexpress-website/backend/generated/api";
import { useSetting } from "@/contexts/SettingsContext";
import type { PaginationData, SearchResult } from "@/lib/blog/types";
import { buildSeoHead, siteTitled } from "@/lib/seo/head";
import CoreSearch from "@/templates/packs/core/surfaces/search";
import { Surface } from "@/templates/sdk/Surface";

/** Content type filter for search API */
type SearchContentType = "post" | "page" | "media" | "course" | "product" | "comment";
function isSearchContentType(value: unknown): value is SearchContentType {
 return typeof value === "string" && ["post", "page", "media", "course", "product", "comment"].includes(value);
}
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
          contentType: isSearchContentType(type) ? type : undefined,
          orderBy: (sort as SearchOrderBy) ?? "relevance",
        }),
      );
    }
  },
  head: (ctx) => {
    const search = (ctx as { search?: SearchPageParams }).search;
    const query = typeof search?.q === "string" ? search.q : "";
    return buildSeoHead({
      title: query ? siteTitled(`Search: ${query}`) : siteTitled("Search"),
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
  // Same cache the loader filled, so SSR and the hydrating client render the same tree.
  const { data: searchData } = useTanStackQuery(
    convexQuery(api.search.queries.search, hasQuery
      ? {
          q: query!.trim(),
          page: page ?? 1,
          perPage: postsPerPage,
          contentType: isSearchContentType(type) ? type : undefined,
          orderBy: (sort as SearchOrderBy) ?? "relevance",
        }
      : "skip",) as any,
  ) as { data: any };

  // ── Analytics: Log search query after results return (#23) ──────────
  const logSearch = useMutation(api.search.mutations.logSearch);
  const logClick = useMutation(api.search.mutations.logClick);
  const searchQueryIdRef = useRef<Id<"searchQueries"> | null>(null);
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
      contentTypeFilter: isSearchContentType(type) ? type : undefined,
    })
      .then((id) => {
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
      if (!sqId || !isSearchContentType(contentType)) return;
      logClick({
        searchQueryId: sqId,
        contentType,
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
    <Surface
      name="search"
      data={{
        query,
        hasQuery,
        type,
        sort,
        results,
        total,
        pagination,
        onResultClick: handleResultClick,
      }}
      fallback={CoreSearch}
    />
  );
}
