/**
 * Global Comment Atom Feed - GET /api/comments/feed/atom
 *
 * Serves an Atom 1.0 feed of all recent approved comments
 * across all published posts.
 *
 * Response:
 *   - Content-Type: application/atom+xml; charset=UTF-8
 *   - Cache-Control: public, max-age=1800 (30 minutes)
 *   - X-Robots-Tag: noindex
 */

import { createFileRoute } from "@tanstack/react-router";
import { buildCommentsFeed } from "@/lib/feeds/buildFeedResponse";

export const Route = createFileRoute("/api/comments/feed/atom")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return buildCommentsFeed(request, "atom");
      },
    },
  },
});
