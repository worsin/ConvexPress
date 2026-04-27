/**
 * Page System - List Pages Query Hook
 *
 * Wraps the Convex pages.list query with reactive subscriptions.
 * Returns paginated pages, status counts, and loading state.
 */

import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";

interface UsePagesArgs {
  status?: "auto-draft" | "draft" | "pending" | "publish" | "private" | "trash" | "future";
  parentId?: Id<"posts">;
  search?: string;
  pageTemplate?: string;
  authorId?: string;
  page?: number;
  perPage?: number;
  orderBy?: "title" | "date" | "menuOrder" | "author";
  orderDir?: "asc" | "desc";
}

/**
 * Hook for querying the paginated page list with filters.
 *
 * Usage:
 * ```tsx
 * const { pages, pagination, counts, isLoading } = usePages({ status: "publish" });
 * ```
 */
export function usePages(args: UsePagesArgs = {}) {
  const result = useQuery(api.pages.queries.list, {
    status: args.status,
    parentId: args.parentId,
    search: args.search,
    pageTemplate: args.pageTemplate,
    authorId: args.authorId,
    page: args.page,
    perPage: args.perPage,
    orderBy: args.orderBy,
    orderDir: args.orderDir,
  });

  return {
    pages: result?.pages ?? [],
    pagination: result?.pagination ?? { page: 1, perPage: 20, total: 0, totalPages: 0 },
    counts: result?.counts ?? { all: 0, publish: 0, draft: 0, pending: 0, private: 0, trash: 0, future: 0 },
    isLoading: result === undefined,
  };
}
