/**
 * useUserComments - Fetches and manages the current user's comments
 * for the dashboard "My Comments" page.
 *
 * Extracts the inline Convex query + filter/pagination logic from
 * UserCommentList into a reusable hook.
 *
 * Uses the same api import pattern as all other ConvexPress-Website hooks
 * (ConvexPress-Website is a Convex consumer via @convexpress-website/backend).
 */

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import type { UserComment } from "@/lib/dashboard/types";

type CommentFilter = "all" | "approved" | "pending";

interface UseUserCommentsOptions {
  /** The Convex user _id to fetch comments for */
  userId: string;
  /** Number of comments per page (default: 20) */
  perPage?: number;
}

interface UseUserCommentsResult {
  /** Mapped comment items ready for display */
  comments: UserComment[] | undefined;
  /** Whether the initial query is loading */
  isLoading: boolean;
  /** Whether the result set is empty (loaded but no comments) */
  isEmpty: boolean;
  /** The active filter tab */
  activeFilter: CommentFilter;
  /** Change the active filter (resets to page 1) */
  setFilter: (filter: CommentFilter) => void;
  /** Current page number (1-based) */
  page: number;
  /** Navigate to a specific page */
  setPage: (page: number) => void;
  /** Go to the previous page */
  prevPage: () => void;
  /** Go to the next page */
  nextPage: () => void;
  /** Total number of pages (from backend) */
  totalPages: number;
  /** Total number of comments matching the filter */
  total: number;
  /** Whether there is a previous page */
  hasPrevPage: boolean;
  /** Whether there is a next page */
  hasNextPage: boolean;
}

export function useUserComments({
  userId,
  perPage = 20,
}: UseUserCommentsOptions): UseUserCommentsResult {
  const [activeFilter, setActiveFilter] = useState<CommentFilter>("all");
  const [page, setPage] = useState(1);

  // Fetch from Convex with filter + pagination args
  const listResult = useQuery(api.comments.queries.list, {
    authorId: userId,
    status:
      activeFilter === "all"
        ? undefined
        : (activeFilter as "approved" | "pending"),
    page,
    perPage,
    orderBy: "createdAt",
    orderDir: "desc",
  });

  const isLoading = listResult === undefined;

  // Map backend response to UserComment shape
  const comments = useMemo(() => {
    if (!listResult) return undefined;
    return listResult.comments.map((c: (typeof listResult.comments)[number]) => ({
      _id: c._id,
      content: c.content,
      excerpt:
        c.content.length > 100 ? c.content.substring(0, 100) + "..." : c.content,
      postId: c.postId,
      postTitle: c.postTitle ?? "[Deleted Post]",
      postSlug: c.postSlug ?? "",
      status: c.status as "approved" | "pending" | "spam" | "trash",
      parentId: c.parentId ?? null,
      likeCount: c.likeCount ?? 0,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      isEditable: c.authorId === userId && c.status !== "trash",
    }));
  }, [listResult, userId]);

  const totalPages = listResult?.totalPages ?? 0;
  const total = listResult?.total ?? 0;

  const setFilter = useCallback((filter: CommentFilter) => {
    setActiveFilter(filter);
    setPage(1);
  }, []);

  const prevPage = useCallback(() => {
    setPage((p) => Math.max(1, p - 1));
  }, []);

  const nextPage = useCallback(() => {
    setPage((p) => Math.min(totalPages, p + 1));
  }, [totalPages]);

  return {
    comments,
    isLoading,
    isEmpty: comments !== undefined && comments.length === 0,
    activeFilter,
    setFilter,
    page,
    setPage,
    prevPage,
    nextPage,
    totalPages,
    total,
    hasPrevPage: page > 1,
    hasNextPage: page < totalPages,
  };
}
