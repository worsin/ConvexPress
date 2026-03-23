/**
 * Global Comment RSS Feed - GET /api/comments/feed
 *
 * Serves an RSS 2.0 feed of all recent approved comments
 * across all published posts.
 *
 * Response:
 *   - Content-Type: application/rss+xml; charset=UTF-8
 *   - Cache-Control: public, max-age=1800 (30 minutes)
 *   - X-Robots-Tag: noindex
 */

import { createFileRoute } from "@tanstack/react-router";
import { buildCommentsFeed } from "@/lib/feeds/buildFeedResponse";

export const Route = createFileRoute("/api/comments/feed/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return buildCommentsFeed(request, "rss2");
      },
    },
  },
});
