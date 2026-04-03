/**
 * Canonical URL Middleware
 *
 * Normalizes incoming URLs to their canonical form. This is the ConvexPress
 * equivalent of WordPress's redirect_canonical() function.
 *
 * Normalization rules (in order):
 *   1. Remove double slashes: /blog//post/ -> /blog/post/
 *   2. Lowercase path: /About-Us/ -> /about-us/
 *   3. Remove index files: /index.html -> /
 *   4. Remove pagination page 1: /blog/page/1/ -> /blog/
 *   5. Enforce trailing slash: /about -> /about/ (301 redirect)
 *
 * Exceptions (no normalization applied):
 *   - URLs with file extensions (.png, .css, .js, .xml, .txt, .woff2, etc.)
 *   - API routes (/api/*)
 *   - Convex routes (/_convex/*)
 *   - TanStack server function routes (/_serverFn/*, /_serverfn/*)
 *   - Auth routes (/login, /register, /logout, /auth/*)
 *
 * IMPORTANT: This middleware must run BEFORE the redirect middleware.
 *
 * Note: HTTPS enforcement and www/non-www preference are typically handled
 * at the reverse proxy / CDN level, not in application middleware.
 * They are included here as utilities but commented out for server-level handling.
 */

// ─── Constants ──────────────────────────────────────────────────────────────

/** File extensions that should NOT get trailing slashes or canonical redirects. */
const STATIC_FILE_EXTENSIONS = new Set([
  ".css",
  ".js",
  ".mjs",
  ".json",
  ".xml",
  ".txt",
  ".html",
  ".htm",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".avif",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".map",
  ".pdf",
  ".zip",
  ".gz",
  ".mp4",
  ".webm",
  ".mp3",
  ".ogg",
]);

/** Paths that should be excluded from canonical normalization. */
const EXCLUDED_PATH_PREFIXES = [
  "/api/",
  "/api",
  "/_convex/",
  "/_convex",
  "/_serverFn/",
  "/_serverFn",
  "/_serverfn/",
  "/_serverfn",
  "/auth/",
  "/auth",
];

/** Exact paths to exclude. */
const EXCLUDED_EXACT_PATHS = new Set([
  "/login",
  "/register",
  "/logout",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
]);

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CanonicalResult {
  /** Whether a redirect is needed. */
  shouldRedirect: boolean;
  /** The canonical URL to redirect to (only set if shouldRedirect is true). */
  canonicalUrl?: string;
  /** HTTP status code for the redirect (always 301). */
  statusCode: 301;
  /** Whether this is a ?p=ID query that needs resolution via Convex. */
  needsPostIdResolution?: boolean;
  /** The numeric post ID to resolve (only set if needsPostIdResolution is true). */
  postId?: string;
}

// ─── Main Function ──────────────────────────────────────────────────────────

/**
 * Check if a URL needs canonical normalization and return the canonical form.
 *
 * @param url - The incoming request URL (pathname + search, no host)
 * @returns CanonicalResult indicating whether a redirect is needed
 */
export function getCanonicalUrl(url: string): CanonicalResult {
  const noRedirect: CanonicalResult = { shouldRedirect: false, statusCode: 301 };

  // Parse URL into pathname and search
  let pathname: string;
  let search: string;

  const queryIndex = url.indexOf("?");
  if (queryIndex >= 0) {
    pathname = url.substring(0, queryIndex);
    search = url.substring(queryIndex);
  } else {
    pathname = url;
    search = "";
  }

  // ─── Check for ?p=ID query parameter (plain permalink) ────────────────
  // When a non-plain permalink structure is active, /?p=123 should resolve
  // the post by numeric ID and redirect (301) to the correct permalink URL.
  // The actual post lookup must happen in the calling context (server middleware
  // or route loader) because it requires Convex client access.

  if (pathname === "/" && search) {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const pParam = params.get("p");
    if (pParam && /^\d+$/.test(pParam)) {
      return {
        shouldRedirect: false,
        statusCode: 301,
        needsPostIdResolution: true,
        postId: pParam,
      };
    }
  }

  // ─── Skip conditions ──────────────────────────────────────────────────

  // Skip: Root path
  if (pathname === "/" || pathname === "") {
    return noRedirect;
  }

  // Skip: Excluded exact paths
  if (EXCLUDED_EXACT_PATHS.has(pathname)) {
    return noRedirect;
  }

  // Skip: Excluded path prefixes
  for (const prefix of EXCLUDED_PATH_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      return noRedirect;
    }
  }

  // Skip: Static file extensions
  const lastDotIndex = pathname.lastIndexOf(".");
  if (lastDotIndex > 0) {
    const ext = pathname.substring(lastDotIndex).toLowerCase();
    if (STATIC_FILE_EXTENSIONS.has(ext)) {
      return noRedirect;
    }
  }

  // ─── Apply normalization rules ────────────────────────────────────────

  let normalized = pathname;

  // Rule 1: Remove double slashes
  normalized = normalized.replace(/\/{2,}/g, "/");

  // Rule 2: Lowercase path
  normalized = normalized.toLowerCase();

  // Rule 3: Remove index files
  normalized = normalized.replace(/\/index\.(html?|php)$/i, "/");

  // Rule 4: Remove pagination page 1
  normalized = normalized.replace(/\/page\/1\/?$/, "/");

  // Rule 5: Enforce trailing slash (if not root, not already trailing)
  if (normalized !== "/" && !normalized.endsWith("/")) {
    normalized = normalized + "/";
  }

  // ─── Compare and decide ───────────────────────────────────────────────

  const normalizedUrl = normalized + search;
  const originalUrl = pathname + search;

  if (normalizedUrl !== originalUrl) {
    return {
      shouldRedirect: true,
      canonicalUrl: normalizedUrl,
      statusCode: 301,
    };
  }

  return noRedirect;
}

/**
 * Check if a URL appears to be for a static file.
 * Useful for early-exit checks in middleware chains.
 */
export function isStaticFile(pathname: string): boolean {
  const lastDotIndex = pathname.lastIndexOf(".");
  if (lastDotIndex <= 0) return false;
  const ext = pathname.substring(lastDotIndex).toLowerCase();
  return STATIC_FILE_EXTENSIONS.has(ext);
}

/**
 * Check if a URL should be excluded from all middleware processing.
 */
export function isExcludedPath(pathname: string): boolean {
  if (EXCLUDED_EXACT_PATHS.has(pathname)) return true;
  for (const prefix of EXCLUDED_PATH_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}
