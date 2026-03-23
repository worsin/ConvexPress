/**
 * Per-Post Comment Atom Feed - GET /api/blog/:slug/feed/atom
 *
 * Serves an Atom 1.0 feed of approved comments on a specific published post.
 * Returns 404 if post not found or not published.
 */

import { createFileRoute } from "@tanstack/react-router";
import { buildPostCommentsFeed } from "@/lib/feeds/buildFeedResponse";

export const Route = createFileRoute("/api/blog/$slug/feed/atom")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        return buildPostCommentsFeed(request, params.slug, "atom");
      },
    },
  },
});
