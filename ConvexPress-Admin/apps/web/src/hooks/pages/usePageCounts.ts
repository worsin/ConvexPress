/**
 * Page System - Page Counts Query Hook
 *
 * Wraps the Convex pages.counts query for status tab badges.
 */

import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";

/**
 * Hook for querying page counts by status.
 *
 * Usage:
 * ```tsx
 * const { counts, isLoading } = usePageCounts();
 * ```
 */
export function usePageCounts() {
  const result = useQuery(api.pages.queries.counts);

  return {
    counts: result ?? {
      all: 0,
      publish: 0,
      draft: 0,
      pending: 0,
      private: 0,
      trash: 0,
      future: 0,
    },
    isLoading: result === undefined,
  };
}
