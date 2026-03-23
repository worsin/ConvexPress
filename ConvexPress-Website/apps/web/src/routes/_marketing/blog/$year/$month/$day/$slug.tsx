/**
 * Day-and-Name Permalink Route - /_marketing/blog/$year/$month/$day/$slug
 *
 * Handles URLs like: /blog/2026/02/08/hello-world/
 * Active when permalink structure is "day_and_name".
 *
 * Behavior:
 *   1. Fetch the post by slug
 *   2. Validate that the URL year/month/day match the post's publishedAt date
 *   3. If dates don't match, redirect to the correct date URL
 *   4. If post not found, show 404
 */

import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute(
  "/_marketing/blog/$year/$month/$day/$slug",
)({
  component: DayAndNamePost,
  head: ({ params }) => ({
    meta: [
      {
        title: `${params.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} - SmithHarper`,
      },
    ],
  }),
});

function DayAndNamePost() {
  const { year, month, day, slug } = Route.useParams();

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
    const pubDay = String(pubDate.getDate()).padStart(2, "0");

    if (year !== pubYear || month !== pubMonth || day !== pubDay) {
      // Date mismatch: the post exists but the URL dates are wrong.
      // Redirect to the correct day_and_name URL.
      return (
        <Navigate
          to="/blog/$year/$month/$day/$slug"
          params={{ year: pubYear, month: pubMonth, day: pubDay, slug }}
          replace
        />
      );
    }
  }

  // Date params are valid -- redirect to the canonical blog/$slug route
  // which has the full single-post rendering logic.
  return <Navigate to="/blog/$slug" params={{ slug }} replace />;
}
