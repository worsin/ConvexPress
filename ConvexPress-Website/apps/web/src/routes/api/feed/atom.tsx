/**
 * Main Atom 1.0 Feed - GET /api/feed/atom
 *
 * Serves the primary Atom 1.0 feed of all published posts.
 *
 * Response:
 *   - Content-Type: application/atom+xml; charset=UTF-8
 *   - Cache-Control: public, max-age=3600
 *   - ETag + If-None-Match for 304 support
 *   - X-Robots-Tag: noindex
 */

import { createFileRoute } from "@tanstack/react-router";
import { buildMainAtomFeed } from "@/lib/feeds/buildFeedResponse";

export const Route = createFileRoute("/api/feed/atom")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return buildMainAtomFeed(request);
      },
    },
  },
});
