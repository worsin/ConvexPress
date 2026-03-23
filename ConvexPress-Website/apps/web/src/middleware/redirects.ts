/**
 * Redirect Middleware
 *
 * Looks up incoming URLs against the redirect rules stored in Convex.
 * Uses the 3-tier resolution strategy (exact -> prefix -> regex) via
 * the routing.internals.resolveRedirect internal query.
 *
 * This middleware runs AFTER the canonical middleware, so the URL has
 * already been normalized before redirect lookup.
 *
 * Flow:
 *   1. Call resolveRedirect internal query with the current URL
 *   2. If a match is found, respond with the appropriate HTTP status code
 *   3. Fire-and-forget recordRedirectHit mutation to increment the counter
 *   4. If no match, continue to the router
 *
 * Usage (in server middleware or route loader):
 *   import { resolveRedirectForUrl } from "@/middleware/redirects";
 *
 *   const redirect = await resolveRedirectForUrl(convexClient, pathname);
 *   if (redirect) {
 *     return new Response(null, {
 *       status: redirect.statusCode,
 *       headers: { Location: redirect.targetUrl },
 *     });
 *   }
 *
 * Note: In TanStack Start, middleware execution depends on the server
 * configuration. This module exports utility functions that can be
 * called from server middleware or route loaders.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ResolvedRedirect {
  /** The redirect record ID (for hit tracking). */
  redirectId: string;
  /** The target URL to redirect to. */
  targetUrl: string;
  /** HTTP status code (301, 302, 307, or 308). */
  statusCode: 301 | 302 | 307 | 308;
  /** The match type that triggered this redirect. */
  matchType: "exact" | "prefix" | "regex";
}

/**
 * Resolve a redirect for a given URL.
 *
 * This is a pure utility that wraps the Convex internal query call.
 * The actual Convex client interaction happens in the calling context
 * (server middleware or route loader) because the client must be
 * available in the server context.
 *
 * @param redirectRecord - The result from resolveRedirect internal query
 * @returns ResolvedRedirect if a match was found, null otherwise
 */
export function processRedirectResult(
  redirectRecord: { sourceUrl: string; targetUrl: string; statusCode: number } | null,
): ResolvedRedirect | null {
  if (!redirectRecord) return null;

  // Determine the effective target URL
  // For prefix and regex matches, _resolvedTargetUrl contains the
  // computed target; for exact matches, use targetUrl directly
  const targetUrl =
    redirectRecord._resolvedTargetUrl || redirectRecord.targetUrl;

  return {
    redirectId: redirectRecord._id,
    targetUrl,
    statusCode: redirectRecord.statusCode,
    matchType: redirectRecord.matchType,
  };
}

/**
 * Build a redirect Response object.
 *
 * @param redirect - Resolved redirect details
 * @returns HTTP Response with appropriate status and Location header
 */
export function buildRedirectResponse(redirect: ResolvedRedirect): Response {
  return new Response(null, {
    status: redirect.statusCode,
    headers: {
      Location: redirect.targetUrl,
      "Cache-Control":
        redirect.statusCode === 301 || redirect.statusCode === 308
          ? "public, max-age=86400" // Cache permanent redirects for 1 day
          : "no-cache", // Don't cache temporary redirects
    },
  });
}

/**
 * Build a 404 Response with appropriate headers.
 *
 * @returns HTTP Response with 404 status and SEO-safe headers
 */
export function build404Response(): Response {
  return new Response(null, {
    status: 404,
    headers: {
      "X-Robots-Tag": "noindex",
      "Cache-Control": "no-cache",
    },
  });
}
