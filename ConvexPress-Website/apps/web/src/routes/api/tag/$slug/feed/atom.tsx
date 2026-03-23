/**
 * Tag Atom Feed - GET /api/tag/:slug/feed/atom
 *
 * Serves an Atom 1.0 feed of published posts with a specific tag.
 * Returns 404 if the tag slug does not match any term.
 */

import { createFileRoute } from "@tanstack/react-router";
import { buildTagFeed } from "@/lib/feeds/buildFeedResponse";

export const Route = createFileRoute("/api/tag/$slug/feed/atom")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        return buildTagFeed(request, params.slug, "atom");
      },
    },
  },
});
