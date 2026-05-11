/**
 * Tag RSS Feed - GET /api/tag/:slug/feed
 *
 * Serves an RSS 2.0 feed of published posts with a specific tag.
 * Returns 404 if the tag slug does not match any term.
 * Returns a valid feed with zero items if the tag exists but has no posts.
 *
 * Response:
 *   - Content-Type: application/rss+xml; charset=UTF-8
 *   - Cache-Control: public, max-age=3600
 *   - X-Robots-Tag: noindex
 */

import { createFileRoute } from "@tanstack/react-router";
import { buildTagFeed } from "@/lib/feeds/buildFeedResponse";

export const Route = createFileRoute("/api/tag/$slug/feed/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        return buildTagFeed(request, params.slug, "rss2");
      },
    },
  },
});
