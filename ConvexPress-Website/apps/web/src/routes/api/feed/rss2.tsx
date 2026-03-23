/**
 * Explicit RSS 2.0 Feed - GET /api/feed/rss2
 *
 * Serves the primary RSS 2.0 feed explicitly.
 * Same behavior as /api/feed (the default format is RSS 2.0).
 */

import { createFileRoute } from "@tanstack/react-router";
import { buildMainRssFeed } from "@/lib/feeds/buildFeedResponse";

export const Route = createFileRoute("/api/feed/rss2")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return buildMainRssFeed(request);
      },
    },
  },
});
