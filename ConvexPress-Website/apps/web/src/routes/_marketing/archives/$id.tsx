/**
 * Numeric Permalink Route - /_marketing/archives/$id
 *
 * Handles URLs like: /archives/123
 * Active when permalink structure is "numeric".
 *
 * Behavior:
 *   1. Parse the numeric ID from the URL
 *   2. Look up the post by numeric ID
 *   3. If found, redirect to the canonical slug-based URL (/blog/$slug)
 *   4. If not found, show 404
 *
 * Note: SmithHarper stores posts with slug-based URLs as canonical.
 * The numeric permalink route resolves the ID and redirects to the
 * actual content URL. This mirrors WordPress's /archives/123 behavior.
 */

import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_marketing/archives/$id")({
  component: NumericPermalink,
  head: ({ params }) => ({
    meta: [{ title: `Post #${params.id} - SmithHarper` }],
  }),
});

function NumericPermalink() {
  const { id } = Route.useParams();

  // Validate that the ID is numeric
  const numericId = /^\d+$/.test(id) ? parseInt(id, 10) : null;

  // Fetch post by numeric ID (if valid)
  // Note: This requires a `getByNumericId` query or similar in the Post System.
  // If that query doesn't exist yet, we fall back to showing 404.
  // TODO: Wire to posts.queries.getByNumericId when available.
  const rawPost = useQuery(
    api.posts.queries.getPublished,
    // Use slug lookup as a placeholder. The numeric permalink system
    // requires a dedicated query that resolves numeric IDs to posts.
    // Until that exists, numeric permalinks will 404.
    numericId !== null ? { slug: `__numeric_id_${id}__` } : "skip",
  );

  // Invalid numeric ID
  if (numericId === null) {
    return <NotFoundPage />;
  }

  // Loading
  if (rawPost === undefined) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4">
        <Skeleton className="h-8 w-3/4" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    );
  }

  // Not found (or numeric ID query not yet available)
  if (rawPost === null) {
    return <NotFoundPage />;
  }

  // Post found -- redirect to canonical slug URL
  return <Navigate to="/blog/$slug" params={{ slug: rawPost.slug }} replace />;
}
