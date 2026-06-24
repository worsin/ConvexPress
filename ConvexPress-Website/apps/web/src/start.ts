import { createMiddleware, createStart } from "@tanstack/react-start";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convexpress-website/backend/generated/api";

import {
  getRobotsTxtResponse,
  getSitemapIndexResponse,
  getSubSitemapResponse,
} from "@/lib/seo/crawlers";
import { getCanonicalUrl, isExcludedPath, isStaticFile } from "@/middleware/canonical";
import {
  buildRedirectResponse,
  processRedirectResult,
} from "@/middleware/redirects";

let convexClient: ConvexHttpClient | null = null;

function getServerConvexClient(): ConvexHttpClient | null {
  const convexUrl = process.env.VITE_CONVEX_URL;
  if (!convexUrl) return null;
  convexClient ??= new ConvexHttpClient(convexUrl);
  return convexClient;
}

function shouldSkipDocumentRedirect(request: Request, pathname: string): boolean {
  const accept = request.headers.get("accept") ?? "";
  const isServerFunctionRequest = request.headers.get("x-tsr-serverfn") === "true";
  if (isServerFunctionRequest || (accept && !accept.includes("text/html"))) {
    return true;
  }
  if (pathname.startsWith("/_serverFn") || pathname.startsWith("/_serverfn")) {
    return true;
  }
  return isStaticFile(pathname) || isExcludedPath(pathname);
}

const crawlerMiddleware = createMiddleware().server(async ({ request, next }) => {
  const pathname = new URL(request.url).pathname;
  if (pathname === "/robots.txt") {
    return getRobotsTxtResponse();
  }
  if (pathname === "/sitemap.xml") {
    return getSitemapIndexResponse(request.url);
  }

  const subSitemapMatch = pathname.match(/^\/sitemap-([a-z]+)-(\d+)\.xml$/);
  if (subSitemapMatch) {
    return getSubSitemapResponse(subSitemapMatch[1]!, subSitemapMatch[2]!);
  }

  return next();
});

/**
 * Canonical URL middleware.
 *
 * Normalizes incoming URLs (lowercasing, trailing slashes, removing doubles)
 * and issues 301 redirects when the requested URL doesn't match its canonical
 * form. Runs BEFORE auth so redirects happen with minimal overhead.
 *
 * Convex-backed redirects are handled by redirectMiddleware after canonical
 * normalization so configured redirect rules see the normalized path.
 */
const canonicalMiddleware = createMiddleware().server(async ({ request, next }) => {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (shouldSkipDocumentRedirect(request, pathname)) {
    return next();
  }

  const result = getCanonicalUrl(pathname + url.search);

  if (result.shouldRedirect && result.canonicalUrl) {
    // Build absolute URL preserving the origin
    const origin = new URL(request.url).origin;
    return new Response(null, {
      status: result.statusCode,
      headers: {
        Location: origin + result.canonicalUrl,
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  return next();
});

const redirectMiddleware = createMiddleware().server(async ({ request, next }) => {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (shouldSkipDocumentRedirect(request, pathname)) {
    return next();
  }

  const client = getServerConvexClient();
  if (!client) {
    return next();
  }

  try {
    const redirectRecord = await client.query(
      (api as any).routing.public.resolveRedirect,
      { url: pathname + url.search },
    );
    const redirect = processRedirectResult(redirectRecord as any);
    if (!redirect) return next();

    if (redirect.redirectId) {
      void client.mutation((api as any).routing.public.recordRedirectHit, {
        redirectId: redirect.redirectId,
      });
    }

    return buildRedirectResponse(redirect);
  } catch (error) {
    console.error(
      "[Routing] Redirect resolution failed:",
      error instanceof Error ? error.message : String(error),
    );
    return next();
  }
});

const documentNotFoundMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next();
  const response = result.response;
  if (response.status !== 404) {
    return result;
  }

  const headers = new Headers(response.headers);
  const contentType = headers.get("Content-Type") ?? "";
  if (!contentType.includes("text/html")) {
    return result;
  }

  headers.set("X-Robots-Tag", "noindex");
  return {
    ...result,
    response: new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
  };
});

export const startInstance = createStart(() => ({
  requestMiddleware: [
    crawlerMiddleware,
    canonicalMiddleware,
    redirectMiddleware,
    documentNotFoundMiddleware,
  ],
}));
