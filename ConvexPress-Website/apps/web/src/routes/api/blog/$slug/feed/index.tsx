/**
 * Per-Post Comment RSS Feed - GET /api/blog/:slug/feed
 *
 * Serves an RSS 2.0 feed of approved comments on a specific published post.
 * Returns 404 if:
 *   - The post slug does not match any published post
 *   - The post's commentStatus is "closed" AND there are zero comments
 *
 * Response:
 *   - Content-Type: application/rss+xml; charset=UTF-8
 *   - Cache-Control: public, max-age=1800 (30 minutes)
 *   - X-Robots-Tag: noindex
 */

import { createFileRoute } from "@tanstack/react-router";
import { buildPostCommentsFeed } from "@/lib/feeds/buildFeedResponse";

export const Route = createFileRoute("/api/blog/$slug/feed/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        return buildPostCommentsFeed(request, params.slug, "rss2");
      },
    },
  },
});
