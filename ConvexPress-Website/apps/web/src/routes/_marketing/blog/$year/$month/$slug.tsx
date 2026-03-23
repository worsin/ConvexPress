/**
 * Month-and-Name Permalink Route - /_marketing/blog/$year/$month/$slug
 *
 * Handles URLs like: /blog/2026/02/hello-world/
 * Active when permalink structure is "month_and_name".
 *
 * Behavior:
 *   1. Fetch the post by slug
 *   2. Validate that the URL year/month match the post's publishedAt date
 *   3. If dates don't match, the post exists at a different URL -- show 404
 *      (the correct URL will be served by the matching date route)
 *   4. If post not found, show 404
 *
 * This route validates the date parameters but delegates post rendering
 * to shared components from the blog system.
 */

import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_marketing/blog/$year/$month/$slug")({
  component: MonthAndNamePost,
  head: ({ params }) => ({
    meta: [
      {
        title: `${params.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} - SmithHarper`,
      },
    ],
  }),
});

function MonthAndNamePost() {
  const { year, month, slug } = Route.useParams();

  // Fetch post by slug
  const rawPost = useQuery(api.posts.queries.getPublished, { slug });

  // Loading
  if (rawPost === undefined) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-3 w-48" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    );
  }

  // Not found
  if (rawPost === null) {
    return <NotFoundPage />;
  }

  // Validate date params against the post's publishedAt
  if (rawPost.publishedAt) {
    const pubDate = new Date(rawPost.publishedAt);
    const pubYear = String(pubDate.getFullYear());
    const pubMonth = String(pubDate.getMonth() + 1).padStart(2, "0");

    if (year !== pubYear || month !== pubMonth) {
      // Date mismatch: the post exists but the URL dates are wrong.
      // Redirect to the correct month_and_name URL.
      return (
        <Navigate
          to="/blog/$year/$month/$slug"
          params={{ year: pubYear, month: pubMonth, slug }}
          replace
        />
      );
    }
  }

  // Date params are valid -- redirect to the canonical blog/$slug route
  // which has the full single-post rendering logic.
  // This avoids duplicating the entire post rendering pipeline.
  return <Navigate to="/blog/$slug" params={{ slug }} replace />;
}
