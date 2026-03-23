/**
 * Post System - Counts Query Hook
 *
 * Wraps useQuery(api.posts.queries.counts) for the status tab badges
 * on the All Posts list table.
 */

import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { PostCounts } from "@/lib/posts/types";

/**
 * Hook for fetching post status counts.
 *
 * Returns counts for each status tab plus "all" and "mine".
 */
export function usePostCounts() {
  const counts = useQuery(api.posts.queries.counts, { type: "post" }) as
    | PostCounts
    | undefined;

  // Transform to Record<string, number> for useListTable
  const countsMap: Record<string, number> | undefined = counts
    ? {
        all: counts.all,
        publish: counts.publish,
        draft: counts.draft,
        pending: counts.pending,
        future: counts.future,
        private: counts.private,
        trash: counts.trash,
        mine: counts.mine,
      }
    : undefined;

  return {
    counts: countsMap,
    isLoading: counts === undefined,
    raw: counts,
  };
}
