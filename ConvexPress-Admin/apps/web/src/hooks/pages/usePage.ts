/**
 * Page System - Single Page Query Hook
 *
 * Wraps the Convex pages.get query for loading a single page by ID, slug, or path.
 * Returns the enriched page document with parent info and children list.
 */

import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";

interface UsePageArgs {
  pageId?: Id<"posts">;
  slug?: string;
  path?: string;
}

/**
 * Hook for querying a single page by ID, slug, or path.
 *
 * Usage:
 * ```tsx
 * const { page, isLoading } = usePage({ pageId: "xxx" });
 * ```
 */
export function usePage(args: UsePageArgs) {
  const result = useQuery(
    api.pages.queries.get,
    args.pageId || args.slug || args.path
      ? {
          pageId: args.pageId,
          slug: args.slug,
          path: args.path,
        }
      : "skip",
  );

  return {
    page: result ?? null,
    isLoading: result === undefined,
    notFound: result === null,
  };
}
