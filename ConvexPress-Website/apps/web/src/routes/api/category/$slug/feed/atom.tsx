/**
 * Category Atom Feed - GET /api/category/:slug/feed/atom
 *
 * Serves an Atom 1.0 feed of published posts in a specific category.
 * Returns 404 if the category slug does not match any term.
 */

import { createFileRoute } from "@tanstack/react-router";
import { buildCategoryFeed } from "@/lib/feeds/buildFeedResponse";

export const Route = createFileRoute("/api/category/$slug/feed/atom")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        return buildCategoryFeed(request, params.slug, "atom");
      },
    },
  },
});
