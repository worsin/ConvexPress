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
 * Falls back to a minimal valid sitemap when Convex or the cached index is
 * unavailable, keeping the public SEO endpoint crawlable during setup.
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
      GET: async ({ request }) => {
        const fallback = () => sitemapFallbackResponse(request.url);

        if (!CONVEX_URL) {
          return fallback();
        }

        try {
          const client = new ConvexHttpClient(CONVEX_URL);
          const result = await client.query(api.sitemaps.queries.getIndex, {});

          if (!result) {
            return fallback();
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
          return fallback();
        }
      },
    },
  },
});

function sitemapFallbackResponse(requestUrl: string): Response {
  const origin = new URL(requestUrl).origin;
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "  <url>",
    `    <loc>${origin}/</loc>`,
    "    <changefreq>daily</changefreq>",
    "    <priority>1.0</priority>",
    "  </url>",
    "</urlset>",
  ].join("\n");

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
