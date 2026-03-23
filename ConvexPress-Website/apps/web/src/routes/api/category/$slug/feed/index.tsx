/**
 * Category RSS Feed - GET /api/category/:slug/feed
 *
 * Serves an RSS 2.0 feed of published posts in a specific category.
 * Returns 404 if the category slug does not match any term.
 * Returns a valid feed with zero items if the category exists but has no posts.
 *
 * Response:
 *   - Content-Type: application/rss+xml; charset=UTF-8
 *   - Cache-Control: public, max-age=3600
 *   - X-Robots-Tag: noindex
 */

import { createFileRoute } from "@tanstack/react-router";
import { buildCategoryFeed } from "@/lib/feeds/buildFeedResponse";

export const Route = createFileRoute("/api/category/$slug/feed/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        return buildCategoryFeed(request, params.slug, "rss2");
      },
    },
  },
});
