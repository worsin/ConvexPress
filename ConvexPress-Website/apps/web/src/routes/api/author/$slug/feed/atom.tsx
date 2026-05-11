/**
 * Author Atom Feed - GET /api/author/:slug/feed/atom
 *
 * Serves an Atom 1.0 feed of published posts by a specific author.
 * Returns 404 if the author slug does not match any user.
 */

import { createFileRoute } from "@tanstack/react-router";
import { buildAuthorFeed } from "@/lib/feeds/buildFeedResponse";

export const Route = createFileRoute("/api/author/$slug/feed/atom")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        return buildAuthorFeed(request, params.slug, "atom");
      },
    },
  },
});
