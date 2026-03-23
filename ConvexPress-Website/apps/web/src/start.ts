import { createMiddleware, createStart } from "@tanstack/react-start";

import { getCanonicalUrl, isExcludedPath, isStaticFile } from "@/middleware/canonical";

/**
 * Canonical URL middleware.
 *
 * Normalizes incoming URLs (lowercasing, trailing slashes, removing doubles)
 * and issues 301 redirects when the requested URL doesn't match its canonical
 * form. Runs BEFORE auth so redirects happen with minimal overhead.
 *
 * NOTE: Redirect middleware (Convex-backed redirect rules) is not yet wired
 * here because TanStack Start request middleware does not have access to the
 * Convex client. To add Convex-backed redirects, either:
 *   1. Initialize a standalone ConvexHttpClient in the middleware, OR
 *   2. Move redirect resolution into the root route's beforeLoad/loader
 *      where the Convex query client is available via route context.
 * See `@/middleware/redirects.ts` for the utility functions that are ready
 * to be called once a Convex client is available in this context.
 */
const canonicalMiddleware = createMiddleware().server(async ({ request, next }) => {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const accept = request.headers.get("accept") ?? "";
  const isServerFunctionRequest = request.headers.get("x-tsr-serverfn") === "true";

  // Canonical redirects should only apply to HTML document requests.
  // Server functions and data requests are not URL-canonicalized.
  if (isServerFunctionRequest || (accept && !accept.includes("text/html"))) {
    return next();
  }

  // Critical: TanStack server function URLs are case-sensitive and must not be
  // rewritten (lowercasing/trailing slash would break RPC requests).
  if (pathname.startsWith("/_serverFn") || pathname.startsWith("/_serverfn")) {
    return next();
  }

  // Skip normalization for static files and excluded paths (API, auth, etc.)
  if (isStaticFile(pathname) || isExcludedPath(pathname)) {
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

export const startInstance = createStart(() => ({
  requestMiddleware: [canonicalMiddleware],
}));
