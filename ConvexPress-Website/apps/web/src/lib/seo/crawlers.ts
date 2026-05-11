import { ConvexHttpClient } from "convex/browser";
import { api } from "@convexpress-website/backend/generated/api";
import { env } from "@convexpress-website/env/web";

const CONVEX_URL = env.VITE_CONVEX_URL;

export const VALID_SITEMAP_TYPES = new Set([
  "posts",
  "pages",
  "categories",
  "tags",
  "authors",
]);

export type SitemapType = "posts" | "pages" | "categories" | "tags" | "authors";

function getClient() {
  return new ConvexHttpClient(CONVEX_URL);
}

export async function getRobotsTxtResponse() {
  try {
    const robotsTxt = await getClient().query(api.sitemaps.queries.getRobotsContent, {});

    return new Response(robotsTxt || defaultRobotsTxt(), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (error: unknown) {
    console.error("Failed to fetch robots.txt from Convex:", error);

    return new Response(defaultRobotsTxt(), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  }
}

export async function getSitemapIndexResponse() {
  try {
    const result = await getClient().query(api.sitemaps.queries.getIndex, {});

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
    console.error("Failed to fetch sitemap index from Convex:", error);

    return new Response("Internal Server Error", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

export async function getSubSitemapResponse(type: string, pageParam: string) {
  if (!VALID_SITEMAP_TYPES.has(type)) {
    return new Response("Invalid sitemap type", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const page = Number.parseInt(pageParam, 10);
  if (!Number.isFinite(page) || page < 1) {
    return new Response("Invalid page number", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  try {
    const result = await getClient().query(api.sitemaps.queries.getSubSitemap, {
      type: type as SitemapType,
      page,
    });

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
}

function defaultRobotsTxt(): string {
  return [
    "User-agent: *",
    "Disallow: /admin/",
    "Allow: /",
    "",
    "Sitemap: /api/sitemap/xml",
  ].join("\n");
}
