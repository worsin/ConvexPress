/**
 * Post System - Filter State Hook
 *
 * Reads and writes filter state from/to URL search params.
 * Used by the PostListTable to keep filters in sync with the URL.
 */

import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";

interface PostFilters {
  status?: string;
  search?: string;
  orderBy?: string;
  orderDir?: "asc" | "desc";
  page?: number;
  perPage?: number;
  authorId?: string;
  categoryId?: string;
  dateRange?: string;
}

/** Shape of the validated search params from the posts route. */
interface PostSearchParams {
  status?: string;
  search?: string;
  orderBy?: string;
  orderDir?: "asc" | "desc";
  page?: number;
  perPage?: number;
  authorId?: string;
  categoryId?: string;
  dateRange?: string;
}

/**
 * Hook for managing post list filter state via URL search params.
 *
 * Reads from the current route's validated search params and provides
 * functions to update individual filters while preserving others.
 */
export function usePostFilters() {
  const search = useSearch({ from: "/_authenticated/_admin/posts/" }) as PostSearchParams;
  const navigate = useNavigate();

  const filters: PostFilters = {
    status: search.status,
    search: search.search,
    orderBy: search.orderBy,
    orderDir: search.orderDir,
    page: search.page,
    perPage: search.perPage,
    authorId: search.authorId,
    categoryId: search.categoryId,
    dateRange: search.dateRange,
  };

  const setFilters = useCallback(
    (updates: Partial<PostFilters>) => {
      navigate({
        to: "/posts",
        search: (prev: Record<string, unknown>) => {
          const next: Record<string, unknown> = { ...prev, ...updates };
          // Reset page to 1 when changing filters (but not when changing page itself)
          if (!("page" in updates)) {
            next.page = undefined;
          }
          // Remove undefined values
          for (const key of Object.keys(next)) {
            if (next[key] === undefined || next[key] === "" || next[key] === "all") {
              delete next[key];
            }
          }
          return next;
        },
      });
    },
    [navigate],
  );

  const setStatus = useCallback(
    (status: string) => setFilters({ status: status === "all" ? undefined : status }),
    [setFilters],
  );

  const setSearch = useCallback(
    (searchStr: string) => setFilters({ search: searchStr || undefined }),
    [setFilters],
  );

  const setPage = useCallback(
    (page: number) => setFilters({ page }),
    [setFilters],
  );

  const setPerPage = useCallback(
    (perPage: number) => setFilters({ perPage, page: undefined }),
    [setFilters],
  );

  const setSort = useCallback(
    (orderBy: string, orderDir: "asc" | "desc") =>
      setFilters({ orderBy, orderDir }),
    [setFilters],
  );

  const setDateRange = useCallback(
    (dateRange: string | undefined) => setFilters({ dateRange }),
    [setFilters],
  );

  const setCategoryId = useCallback(
    (categoryId: string | undefined) => setFilters({ categoryId }),
    [setFilters],
  );

  return {
    filters,
    setFilters,
    setStatus,
    setSearch,
    setPage,
    setPerPage,
    setSort,
    setDateRange,
    setCategoryId,
  };
}
