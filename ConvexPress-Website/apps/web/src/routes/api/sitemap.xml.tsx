/**
 * Sitemap Index API Route
 *
 * Serves the cached sitemap index XML at /api/sitemap.xml.
 * The web server should be configured to rewrite /sitemap.xml -> /api/sitemap.xml.
 *
 * Headers:
 *   - Content-Type: application/xml; charset=utf-8
 *   - Cache-Control: public, max-age=3600, s-maxage=3600 (1 hour)
 *   - X-Robots-Tag: noindex (sitemaps themselves should not be indexed)
 *
 * Returns 404 if sitemaps are disabled or no cached index exists.
 *
 * Performance: O(1) - single Convex query returning pre-generated XML.
 */

import { createFileRoute } from "@tanstack/react-router";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convexpress-website/backend/generated/api";

const CONVEX_URL = process.env.VITE_CONVEX_URL || "";

export const Route = createFileRoute("/api/sitemap/xml")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const client = new ConvexHttpClient(CONVEX_URL);
          const result = await client.query(api.sitemaps.queries.getIndex, {});

          if (!result) {
            return new Response("Sitemap not found", {
              status: 404,
              headers: {
                "Content-Type": "text/plain; charset=utf-8",
              },
            });
          }

          return new Response(result.xml, {
            status: 200,
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              "Cache-Control": "public, max-age=3600, s-maxage=3600",
              "X-Robots-Tag": "noindex",
            },
          });
        } catch (error: unknown) {
          console.error("Failed to fetch sitemap index from Convex:", error);
          return new Response("Internal Server Error", {
            status: 500,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
            },
          });
        }
      },
    },
  },
});
