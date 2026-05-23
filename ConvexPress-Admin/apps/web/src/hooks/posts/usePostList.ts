/**
 * Post System - List Query Hook
 *
 * Wraps useQuery(api.posts.queries.list) with filter/sort/pagination
 * state derived from route URL search params.
 */

import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { useAuth } from "@/lib/auth-context";
import { SORT_FIELD_MAP } from "@/lib/posts/constants";
import type { PostListResult, PostWithAuthor } from "@/lib/posts/types";
import type { PaginatedResult } from "@/types/list-table";

interface UsePostListParams {
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
 * Hook for fetching the admin post list with all filters applied.
 *
 * Maps URL search params to Convex query args and returns
 * the data in the PaginatedResult shape expected by useListTable.
 */
export function usePostList(params: UsePostListParams) {
  const { user } = useAuth();

  // Map the UI sort column key to the Convex orderBy field
  const convexOrderBy = params.orderBy
    ? SORT_FIELD_MAP[params.orderBy] ?? "createdAt"
    : "createdAt";

  const queryArgs: Record<string, unknown> = {
    type: "post" as const,
    page: params.page ?? 1,
    perPage: params.perPage ?? 20,
    orderBy: convexOrderBy,
    orderDir: params.orderDir ?? "desc",
  };

  // Only add optional filters if they have values
  if (params.status && params.status !== "all" && params.status !== "mine") {
    queryArgs.status = params.status;
  }
  if (params.search) {
    queryArgs.search = params.search;
  }
  if (params.authorId) {
    queryArgs.authorId = params.authorId;
  }
  if (params.categoryId) {
    queryArgs.categoryId = params.categoryId as Id<"terms">;
  }
  if (params.dateRange) {
    const range = monthRangeToTimestamps(params.dateRange);
    if (range) {
      queryArgs.dateFrom = range.dateFrom;
      queryArgs.dateTo = range.dateTo;
    }
  }

  // Handle "mine" filter by passing current user's ID as authorId (H10 fix)
  if (params.status === "mine" && user?._id) {
    queryArgs.authorId = user._id;
  }

  const result = useQuery(api.posts.queries.list, queryArgs) as
    | PostListResult
    | undefined;

  // Transform to PaginatedResult shape for useListTable
  const paginatedResult: PaginatedResult<PostWithAuthor> | undefined = result
    ? {
        items: result.posts,
        total: result.total,
        page: result.page,
        perPage: result.perPage,
        totalPages: result.totalPages,
      }
    : undefined;

  return {
    data: paginatedResult,
    isLoading: result === undefined,
    raw: result,
  };
}

function monthRangeToTimestamps(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isFinite(year) || monthIndex < 0 || monthIndex > 11) return null;
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 1);
  return {
    dateFrom: start.getTime(),
    dateTo: end.getTime() - 1,
  };
}
