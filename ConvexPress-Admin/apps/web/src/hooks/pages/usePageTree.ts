/**
 * Page System - Page Tree Query Hook
 *
 * Wraps the Convex pages.getTree query for getting the hierarchical page tree.
 * Used by the parent page dropdown and admin hierarchical list.
 */

import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";

interface UsePageTreeArgs {
  /** "publish" for public use, "all" or undefined for admin use */
  status?: "publish" | "all";
}

/**
 * Hook for querying the hierarchical page tree.
 *
 * Usage:
 * ```tsx
 * const { tree, isLoading } = usePageTree({ status: "all" });
 * ```
 */
export function usePageTree(args: UsePageTreeArgs = {}) {
  const result = useQuery(api.pages.queries.getTree, {
    status: args.status,
  });

  return {
    tree: result ?? [],
    isLoading: result === undefined,
  };
}
