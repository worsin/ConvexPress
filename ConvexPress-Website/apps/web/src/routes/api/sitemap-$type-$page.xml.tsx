/**
 * Sub-Sitemap API Route
 *
 * Serves cached sub-sitemap XML at /api/sitemap-{type}-{page}.xml.
 * The web server should rewrite /sitemap-posts-1.xml -> /api/sitemap-posts-1.xml.
 *
 * URL patterns:
 *   /api/sitemap-posts-1.xml
 *   /api/sitemap-pages-1.xml
 *   /api/sitemap-courses-1.xml
 *   /api/sitemap-categories-1.xml
 *   /api/sitemap-tags-1.xml
 *   /api/sitemap-authors-1.xml
 *
 * Validates:
 *   - type must be one of: posts, pages, courses, categories, tags, authors
 *   - page must be >= 1
 *
 * Headers:
 *   - Content-Type: application/xml; charset=utf-8
 *   - Cache-Control: public, max-age=3600, s-maxage=3600
 *   - X-Robots-Tag: noindex
 *
 * Returns 404 if type is invalid, page is out of range, content type
 * is disabled, or no cached data exists.
 */

import { createFileRoute } from "@tanstack/react-router";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convexpress-website/backend/generated/api";

/** Valid sitemap content types */
type SitemapType = "posts" | "pages" | "courses" | "categories" | "tags" | "authors";

const CONVEX_URL = process.env.VITE_CONVEX_URL || "";

const VALID_TYPES = new Set(["posts", "pages", "courses", "categories", "tags", "authors"]);

export const Route = createFileRoute("/api/sitemap-$type-$page/xml")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { type: string; page: string } }) => {
        const { type, page: pageStr } = params;

        // Validate type
        if (!VALID_TYPES.has(type)) {
          return new Response("Invalid sitemap type", {
            status: 404,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }

        // Validate page number
        const page = parseInt(pageStr, 10);
        if (isNaN(page) || page < 1) {
          return new Response("Invalid page number", {
            status: 404,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }

        try {
          const client = new ConvexHttpClient(CONVEX_URL);
          const result = await client.query(
            api.sitemaps.queries.getSubSitemap,
            { type: type as SitemapType, page },
          );

          if (!result) {
            return new Response("Sitemap not found", {
              status: 404,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
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
          console.error("Failed to fetch sub-sitemap from Convex:", error);
          return new Response("Internal Server Error", {
            status: 500,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      },
    },
  },
});
