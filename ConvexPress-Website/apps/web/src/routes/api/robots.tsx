/**
 * Dynamic robots.txt API route.
 *
 * Serves the robots.txt content generated from the Sitemap System's
 * getRobotsContent query, which reads SEO settings AND ensures the
 * Sitemap: directive is correctly in sync with sitemap enabled/disabled state.
 *
 * Route: /api/robots
 *
 * Note: This serves at /api/robots. For the actual /robots.txt URL,
 * a rewrite/redirect rule should be configured in the web server or
 * middleware to map /robots.txt -> /api/robots.
 *
 * The getRobotsContent query is a public query (no auth required) that
 * builds the robots.txt content from seoSettings and ensures the Sitemap
 * directive reflects current sitemap configuration.
 *
 * Why getRobotsContent instead of seo.getRobotsTxt:
 *   The sitemap system's getRobotsContent query reads BOTH the SEO robots
 *   settings AND the sitemap enabled/disabled state. This ensures the
 *   Sitemap: directive is always correct. Using the SEO query alone could
 *   produce a robots.txt with a stale or missing Sitemap: directive.
 */

import { createFileRoute } from "@tanstack/react-router";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convexpress-website/backend/generated/api";

const CONVEX_URL = process.env.VITE_CONVEX_URL || "";

export const Route = createFileRoute("/api/robots")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const client = new ConvexHttpClient(CONVEX_URL);
          // Use sitemap system's getRobotsContent which ensures the Sitemap:
          // directive is in sync with sitemap enabled/disabled state
          const robotsTxt = await client.query(
            api.sitemaps.queries.getRobotsContent,
            {},
          );

          return new Response(robotsTxt || defaultRobotsTxt(), {
            status: 200,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "public, max-age=86400, s-maxage=86400",
            },
          });
        } catch (error: unknown) {
          // If Convex is unavailable, serve a sensible default
          console.error("Failed to fetch robots.txt from Convex:", error);
          return new Response(defaultRobotsTxt(), {
            status: 200,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "public, max-age=300",
            },
          });
        }
      },
    },
  },
});

/**
 * Fallback robots.txt content when Convex is unavailable.
 */
function defaultRobotsTxt(): string {
  return [
    "User-agent: *",
    "Disallow: /admin/",
    "Allow: /",
    "",
    "Sitemap: /sitemap.xml",
  ].join("\n");
}
