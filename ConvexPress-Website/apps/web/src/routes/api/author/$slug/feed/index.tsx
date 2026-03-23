/**
 * Author RSS Feed - GET /api/author/:slug/feed
 *
 * Serves an RSS 2.0 feed of published posts by a specific author.
 * Returns 404 if the author slug does not match any user.
 * Returns a valid feed with zero items if the author exists but has no posts.
 *
 * Response:
 *   - Content-Type: application/rss+xml; charset=UTF-8
 *   - Cache-Control: public, max-age=3600
 *   - X-Robots-Tag: noindex
 */

import { createFileRoute } from "@tanstack/react-router";
import { buildAuthorFeed } from "@/lib/feeds/buildFeedResponse";

export const Route = createFileRoute("/api/author/$slug/feed/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        return buildAuthorFeed(request, params.slug, "rss2");
      },
    },
  },
});
