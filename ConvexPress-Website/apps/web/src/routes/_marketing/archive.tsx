import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import type { DateArchiveGroup } from "@/lib/blog/types";
import { siteTitled } from "@/lib/seo/head";
import CoreBlogArchive from "@/templates/packs/core/surfaces/blog.archive";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/_marketing/archive")({
  component: ArchivePage,
  head: () => ({
    meta: [
      { title: siteTitled("Archive") },
      {
        name: "description",
        content: "Browse all posts by date.",
      },
    ],
  }),
});

function ArchivePage() {
  // Fetch date archive groups directly from the dedicated query
  // This is far more efficient than fetching all posts and grouping client-side
  const archiveGroupsRaw = useQuery(api.posts.queries.getDateArchiveGroups, {});

  // Map Convex response to DateArchiveGroup type (field name: count -> postCount)
  const archiveGroups: DateArchiveGroup[] | undefined = archiveGroupsRaw
    ? archiveGroupsRaw.map((g: (typeof archiveGroupsRaw)[number]) => ({
        year: g.year,
        month: g.month,
        postCount: g.count,
      }))
    : undefined;

  return <Surface name="blog.archive" data={{ groups: archiveGroups }} fallback={CoreBlogArchive} />;
}
