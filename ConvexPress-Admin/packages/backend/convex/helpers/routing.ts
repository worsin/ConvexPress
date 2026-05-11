/**
 * Routing System - URL Generation Helpers
 *
 * Pure functions for generating URLs from content data and permalink settings.
 * These functions are the ConvexPress equivalents of WordPress's:
 *   - get_permalink()      -> generatePostUrl()
 *   - get_page_link()      -> generatePageUrl()
 *   - get_category_link()  -> generateCategoryUrl()
 *   - get_tag_link()       -> generateTagUrl()
 *   - get_author_posts_url() -> generateAuthorUrl()
 *
 * All functions are pure (no database access) and can be used in both
 * server-side (middleware, SSR) and client-side (React components) contexts.
 *
 * Usage:
 *   import {
 *     generatePostUrl,
 *     generatePageUrl,
 *     generateCategoryUrl,
 *     generateTagUrl,
 *     generateAuthorUrl,
 *   } from "../helpers/routing";
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Permalink settings as stored in the Settings System (permalinks section).
 */
export interface PermalinkSettings {
  /** The permalink structure: plain, day_and_name, month_and_name, numeric, post_name, custom */
  structure: string;
  /** Custom structure pattern (only used when structure is "custom"), e.g., "/blog/%year%/%postname%/" */
  customStructure?: string;
  /** Category URL base path (default: "category") */
  categoryBase: string;
  /** Tag URL base path (default: "tag") */
  tagBase: string;
}

/**
 * Minimal post data needed for URL generation.
 */
export interface PostForUrl {
  slug: string;
  publishedAt?: number;
  numericId?: number;
  primaryCategorySlug?: string;
  authorSlug?: string;
}

/**
 * Minimal page data needed for URL generation.
 * Pages use /{slug}/ regardless of permalink structure.
 * Hierarchical pages use /{parent-slug}/{child-slug}/.
 */
export interface PageForUrl {
  slug: string;
  /** Full hierarchical path, e.g., "about/team/leadership" */
  fullPath?: string;
}

/**
 * Minimal category data needed for URL generation.
 */
export interface CategoryForUrl {
  slug: string;
}

/**
 * Minimal tag data needed for URL generation.
 */
export interface TagForUrl {
  slug: string;
}

/**
 * Minimal author data needed for URL generation.
 */
export interface AuthorForUrl {
  slug: string;
}

// ─── Default Settings ───────────────────────────────────────────────────────

export const DEFAULT_PERMALINK_SETTINGS: PermalinkSettings = {
  structure: "post_name",
  categoryBase: "category",
  tagBase: "tag",
};

// ─── URL Generation Functions ───────────────────────────────────────────────

/**
 * Generate a post URL based on the current permalink structure.
 *
 * WordPress equivalent: get_permalink($post)
 *
 * @param post - Post data (slug, publishedAt, numericId, etc.)
 * @param settings - Current permalink settings
 * @param siteUrl - Optional site URL prefix for absolute URLs
 * @returns Relative or absolute URL string
 */
export function generatePostUrl(
  post: PostForUrl,
  settings: PermalinkSettings = DEFAULT_PERMALINK_SETTINGS,
  siteUrl?: string,
): string {
  let path: string;

  switch (settings.structure) {
    case "plain":
      // /?p=123
      path = post.numericId ? `/?p=${post.numericId}` : `/?p=${post.slug}`;
      break;

    case "day_and_name": {
      // /2026/02/08/hello-world/
      const date = post.publishedAt ? new Date(post.publishedAt) : new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      path = `/${year}/${month}/${day}/${post.slug}/`;
      break;
    }

    case "month_and_name": {
      // /2026/02/hello-world/
      const date = post.publishedAt ? new Date(post.publishedAt) : new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      path = `/${year}/${month}/${post.slug}/`;
      break;
    }

    case "numeric":
      // /archives/123
      path = `/archives/${post.numericId ?? post.slug}`;
      break;

    case "post_name":
      // /hello-world/
      path = `/${post.slug}/`;
      break;

    case "custom":
      // Resolve custom pattern using permalink tags
      path = resolvePermalinkTags(
        settings.customStructure ?? "/%postname%/",
        post,
      );
      break;

    default:
      // Fallback to post_name
      path = `/${post.slug}/`;
      break;
  }

  return siteUrl ? `${siteUrl.replace(/\/$/, "")}${path}` : path;
}

/**
 * Generate a page URL.
 *
 * WordPress equivalent: get_page_link($page)
 *
 * Pages always use /{slug}/ regardless of permalink settings.
 * Hierarchical pages use /{parent-slug}/{child-slug}/.
 *
 * @param page - Page data (slug, optional fullPath)
 * @param siteUrl - Optional site URL prefix for absolute URLs
 * @returns Relative or absolute URL string
 */
export function generatePageUrl(
  page: PageForUrl,
  siteUrl?: string,
): string {
  const path = page.fullPath
    ? `/${page.fullPath}/`
    : `/${page.slug}/`;

  return siteUrl ? `${siteUrl.replace(/\/$/, "")}${path}` : path;
}

/**
 * Generate a category archive URL.
 *
 * WordPress equivalent: get_category_link($cat)
 *
 * Uses settings.categoryBase (default: "category").
 * Output: /{categoryBase}/{slug}/
 *
 * @param category - Category data (slug)
 * @param settings - Current permalink settings
 * @param siteUrl - Optional site URL prefix for absolute URLs
 * @returns Relative or absolute URL string
 */
export function generateCategoryUrl(
  category: CategoryForUrl,
  settings: PermalinkSettings = DEFAULT_PERMALINK_SETTINGS,
  siteUrl?: string,
): string {
  const base = settings.categoryBase || "category";
  const path = `/${base}/${category.slug}/`;

  return siteUrl ? `${siteUrl.replace(/\/$/, "")}${path}` : path;
}

/**
 * Generate a tag archive URL.
 *
 * WordPress equivalent: get_tag_link($tag)
 *
 * Uses settings.tagBase (default: "tag").
 * Output: /{tagBase}/{slug}/
 *
 * @param tag - Tag data (slug)
 * @param settings - Current permalink settings
 * @param siteUrl - Optional site URL prefix for absolute URLs
 * @returns Relative or absolute URL string
 */
export function generateTagUrl(
  tag: TagForUrl,
  settings: PermalinkSettings = DEFAULT_PERMALINK_SETTINGS,
  siteUrl?: string,
): string {
  const base = settings.tagBase || "tag";
  const path = `/${base}/${tag.slug}/`;

  return siteUrl ? `${siteUrl.replace(/\/$/, "")}${path}` : path;
}

/**
 * Generate an author archive URL.
 *
 * WordPress equivalent: get_author_posts_url($author)
 *
 * Always /author/{slug}/ (not configurable).
 *
 * @param author - Author data (slug)
 * @param siteUrl - Optional site URL prefix for absolute URLs
 * @returns Relative or absolute URL string
 */
export function generateAuthorUrl(
  author: AuthorForUrl,
  siteUrl?: string,
): string {
  const path = `/author/${author.slug}/`;

  return siteUrl ? `${siteUrl.replace(/\/$/, "")}${path}` : path;
}

// ─── Permalink Tag Resolution ───────────────────────────────────────────────

/**
 * Available permalink tag definitions.
 *
 * Each tag is a placeholder in a custom permalink pattern that gets
 * replaced with actual content data at URL generation time.
 */
export const PERMALINK_TAG_DEFINITIONS: Record<
  string,
  { label: string; description: string }
> = {
  "%postname%": {
    label: "Post name",
    description: "The post slug (e.g., hello-world)",
  },
  "%year%": {
    label: "Year",
    description: "4-digit year of publication (e.g., 2026)",
  },
  "%monthnum%": {
    label: "Month",
    description: "2-digit month of publication (e.g., 02)",
  },
  "%day%": {
    label: "Day",
    description: "2-digit day of publication (e.g., 08)",
  },
  "%post_id%": {
    label: "Post ID",
    description: "Numeric post ID",
  },
  "%category%": {
    label: "Category",
    description: "Primary category slug",
  },
  "%author%": {
    label: "Author",
    description: "Author slug",
  },
  "%hour%": {
    label: "Hour",
    description: "2-digit hour of publication (e.g., 14)",
  },
  "%minute%": {
    label: "Minute",
    description: "2-digit minute of publication (e.g., 30)",
  },
  "%second%": {
    label: "Second",
    description: "2-digit second of publication (e.g., 45)",
  },
};

/**
 * Resolve permalink tags in a custom pattern string.
 *
 * Replaces %postname%, %year%, %monthnum%, %day%, %post_id%, %category%,
 * %author%, %hour%, %minute%, %second% with actual values from the post.
 *
 * @param pattern - The custom permalink pattern (e.g., "/blog/%year%/%postname%/")
 * @param post - Post data for tag resolution
 * @returns Resolved URL path string
 */
export function resolvePermalinkTags(
  pattern: string,
  post: PostForUrl,
): string {
  const date = post.publishedAt ? new Date(post.publishedAt) : new Date();

  let resolved = pattern;

  resolved = resolved.replace(/%postname%/g, post.slug);
  resolved = resolved.replace(/%year%/g, String(date.getFullYear()));
  resolved = resolved.replace(
    /%monthnum%/g,
    String(date.getMonth() + 1).padStart(2, "0"),
  );
  resolved = resolved.replace(
    /%day%/g,
    String(date.getDate()).padStart(2, "0"),
  );
  resolved = resolved.replace(
    /%post_id%/g,
    String(post.numericId ?? 0),
  );
  resolved = resolved.replace(
    /%category%/g,
    post.primaryCategorySlug ?? "uncategorized",
  );
  resolved = resolved.replace(
    /%author%/g,
    post.authorSlug ?? "unknown",
  );
  resolved = resolved.replace(
    /%hour%/g,
    String(date.getHours()).padStart(2, "0"),
  );
  resolved = resolved.replace(
    /%minute%/g,
    String(date.getMinutes()).padStart(2, "0"),
  );
  resolved = resolved.replace(
    /%second%/g,
    String(date.getSeconds()).padStart(2, "0"),
  );

  // Ensure trailing slash
  if (!resolved.endsWith("/")) {
    resolved += "/";
  }

  // Ensure leading slash
  if (!resolved.startsWith("/")) {
    resolved = "/" + resolved;
  }

  return resolved;
}

/**
 * Validate that a custom permalink structure contains at least %postname% or %post_id%.
 *
 * Custom structures MUST be resolvable to unique URLs, which requires at least
 * one of these tags. Without them, all posts would generate the same URL.
 *
 * @param structure - The custom permalink structure to validate
 * @returns true if the structure is valid
 */
export function isValidCustomStructure(structure: string): boolean {
  return structure.includes("%postname%") || structure.includes("%post_id%");
}

// ─── Canonical URL Utilities ────────────────────────────────────────────────

/**
 * File extensions that should NOT receive trailing slash redirects.
 * URLs with these extensions are static assets, not routes.
 */
const STATIC_FILE_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".css",
  ".js",
  ".json",
  ".xml",
  ".txt",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".webp",
  ".avif",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".mp3",
  ".mp4",
  ".webm",
  ".ogg",
  ".wav",
  ".pdf",
  ".zip",
  ".gz",
  ".br",
  ".map",
]);

/**
 * Check if a URL path refers to a static file (has a known file extension).
 *
 * @param path - URL path to check
 * @returns true if the path has a static file extension
 */
export function isStaticFilePath(path: string): boolean {
  const lastSegment = path.split("/").pop() ?? "";
  const dotIndex = lastSegment.lastIndexOf(".");
  if (dotIndex === -1) return false;

  const ext = lastSegment.slice(dotIndex).toLowerCase();
  return STATIC_FILE_EXTENSIONS.has(ext);
}

/**
 * Check if a URL path is an API route that should skip canonical processing.
 *
 * @param path - URL path to check
 * @returns true if the path is an API route
 */
export function isApiPath(path: string): boolean {
  return path.startsWith("/api/") || path === "/api";
}

/**
 * Normalize a URL path to its canonical form.
 *
 * Applies the following normalization rules:
 *   1. Lowercase the path
 *   2. Remove double slashes
 *   3. Add trailing slash (unless static file or API route)
 *   4. Remove index.html / index.htm
 *   5. Remove /page/1/ pagination (redirect to base)
 *
 * @param path - URL path to normalize
 * @returns Normalized path, or null if already canonical
 */
export function normalizeUrlPath(path: string): string | null {
  let normalized = path;
  let changed = false;

  // Skip API routes and static files
  if (isApiPath(normalized) || isStaticFilePath(normalized)) {
    return null;
  }

  // Lowercase
  const lowered = normalized.toLowerCase();
  if (lowered !== normalized) {
    normalized = lowered;
    changed = true;
  }

  // Remove double slashes
  const deduped = normalized.replace(/\/\/+/g, "/");
  if (deduped !== normalized) {
    normalized = deduped;
    changed = true;
  }

  // Remove index.html / index.htm
  if (
    normalized.endsWith("/index.html") ||
    normalized.endsWith("/index.htm")
  ) {
    normalized = normalized.replace(/\/index\.html?$/, "/");
    changed = true;
  }

  // Remove /page/1/ pagination (redirect to base URL)
  const pageOneMatch = normalized.match(/^(.+)\/page\/1\/?$/);
  if (pageOneMatch) {
    normalized = pageOneMatch[1] + "/";
    changed = true;
  }

  // Add trailing slash (if not root and missing)
  if (normalized !== "/" && !normalized.endsWith("/")) {
    normalized = normalized + "/";
    changed = true;
  }

  return changed ? normalized : null;
}
