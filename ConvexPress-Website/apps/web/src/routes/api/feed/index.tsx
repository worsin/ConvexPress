/**
 * Main RSS 2.0 Feed - GET /api/feed
 *
 * Serves the primary RSS 2.0 feed of all published posts.
 * This is the default feed format (same as /api/feed/rss2).
 *
 * Response:
 *   - Content-Type: application/rss+xml; charset=UTF-8
 *   - Cache-Control: public, max-age=3600
 *   - ETag + If-None-Match for 304 support
 *   - X-Robots-Tag: noindex
 */

import { createFileRoute } from "@tanstack/react-router";
import { buildMainRssFeed } from "@/lib/feeds/buildFeedResponse";

export const Route = createFileRoute("/api/feed/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return buildMainRssFeed(request);
      },
    },
  },
});
