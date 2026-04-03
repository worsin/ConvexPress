/**
 * URL Generation Utilities
 *
 * Pure functions for generating URLs for all content types based on
 * the current permalink settings. These are the ConvexPress equivalents
 * of WordPress's get_permalink(), get_page_link(), get_category_link(),
 * get_tag_link(), and get_author_posts_url().
 *
 * IMPORTANT: All functions are PURE -- they accept settings as a parameter
 * and never query the database internally. This makes them testable,
 * server-safe, and usable in any context.
 *
 * Permalink Structures:
 *   - plain:          /?p=123
 *   - day_and_name:   /2026/02/11/hello-world/
 *   - month_and_name: /2026/02/hello-world/
 *   - numeric:        /archives/123
 *   - post_name:      /hello-world/
 *   - custom:         Depends on pattern (must contain %postname% or %post_id%)
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type PermalinkStructure =
  | "plain"
  | "day_and_name"
  | "month_and_name"
  | "numeric"
  | "post_name"
  | "custom";

export interface PermalinkSettings {
  /** The active permalink structure. */
  structure: PermalinkStructure;
  /** Custom permalink pattern (only used when structure === "custom"). */
  customStructure?: string;
  /** Category URL base (default: "category"). */
  categoryBase: string;
  /** Tag URL base (default: "tag"). */
  tagBase: string;
}

export interface PostForUrl {
  /** Post slug. */
  slug: string;
  /** Numeric ID for plain/numeric permalink structures. */
  numericId?: number;
  /** Publication date (ms since epoch). Required for date-based structures. */
  publishedAt?: number;
  /** Primary category slug (for %category% tag in custom structures). */
  primaryCategorySlug?: string;
  /** Author slug (for %author% tag in custom structures). */
  authorSlug?: string;
}

export interface PageForUrl {
  /** Page slug. */
  slug: string;
  /** Full hierarchical path (e.g., "about/team" for a child page). */
  fullPath?: string;
}

export interface CategoryForUrl {
  /** Category slug. */
  slug: string;
}

export interface TagForUrl {
  /** Tag slug. */
  slug: string;
}

export interface AuthorForUrl {
  /** Author slug or username. */
  slug: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_PERMALINK_SETTINGS: PermalinkSettings = {
  structure: "post_name",
  categoryBase: "category",
  tagBase: "tag",
};

// ─── URL Generators ─────────────────────────────────────────────────────────

/**
 * Generate a URL for a post based on the current permalink structure.
 *
 * Handles all 6 permalink structures. Returns a relative path.
 *
 * @param post - Post data (slug, numericId, publishedAt, etc.)
 * @param settings - Current permalink settings
 * @param siteUrl - Optional site URL for absolute URLs
 * @returns Relative path (e.g., "/hello-world/") or absolute URL
 */
export function generatePostUrl(
  post: PostForUrl,
  settings: PermalinkSettings = DEFAULT_PERMALINK_SETTINGS,
  siteUrl?: string,
): string {
  let path: string;

  switch (settings.structure) {
    case "plain": {
      // /?p=123
      const id = post.numericId ?? 0;
      path = `/?p=${id}`;
      break;
    }

    case "day_and_name": {
      // /2026/02/11/hello-world/
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

    case "numeric": {
      // /archives/123
      const id = post.numericId ?? 0;
      path = `/archives/${id}`;
      break;
    }

    case "post_name": {
      // /hello-world/
      path = `/${post.slug}/`;
      break;
    }

    case "custom": {
      // Resolve permalink tags in the custom pattern
      path = resolvePermalinkTags(
        settings.customStructure || "/%postname%/",
        post,
      );
      break;
    }

    default:
      path = `/${post.slug}/`;
  }

  return siteUrl ? `${siteUrl.replace(/\/$/, "")}${path}` : path;
}

/**
 * Generate a URL for a page.
 *
 * Pages ALWAYS use /{slug}/ regardless of permalink settings.
 * Supports hierarchical pages: /{parent-slug}/{child-slug}/.
 *
 * @param page - Page data (slug, fullPath)
 * @param siteUrl - Optional site URL for absolute URLs
 * @returns Relative path (e.g., "/about/" or "/about/team/")
 */
export function generatePageUrl(
  page: PageForUrl,
  siteUrl?: string,
): string {
  const slug = page.fullPath || page.slug;
  const path = `/${slug}/`;

  return siteUrl ? `${siteUrl.replace(/\/$/, "")}${path}` : path;
}

/**
 * Generate a URL for a category archive.
 *
 * Uses settings.categoryBase (default: "category").
 * Output: /{categoryBase}/{slug}/
 *
 * @param category - Category data (slug)
 * @param settings - Current permalink settings
 * @param siteUrl - Optional site URL for absolute URLs
 * @returns Relative path (e.g., "/category/news/")
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
 * Generate a URL for a tag archive.
 *
 * Uses settings.tagBase (default: "tag").
 * Output: /{tagBase}/{slug}/
 *
 * @param tag - Tag data (slug)
 * @param settings - Current permalink settings
 * @param siteUrl - Optional site URL for absolute URLs
 * @returns Relative path (e.g., "/tag/javascript/")
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
 * Generate a URL for an author archive.
 *
 * Always /author/{slug}/ (author base is not configurable, matching WordPress).
 *
 * @param author - Author data (slug)
 * @param siteUrl - Optional site URL for absolute URLs
 * @returns Relative path (e.g., "/author/john-doe/")
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
 * Available permalink tags and their descriptions.
 */
export const PERMALINK_TAGS = {
  "%postname%": "Post slug",
  "%year%": "4-digit year (e.g., 2026)",
  "%monthnum%": "2-digit month (e.g., 02)",
  "%day%": "2-digit day (e.g., 11)",
  "%post_id%": "Numeric post ID",
  "%category%": "Primary category slug",
  "%author%": "Author slug",
  "%hour%": "2-digit hour (00-23)",
  "%minute%": "2-digit minute (00-59)",
  "%second%": "2-digit second (00-59)",
} as const;

/**
 * Resolve permalink tags in a custom pattern string.
 *
 * @param pattern - Pattern string with %tags% (e.g., "/%year%/%postname%/")
 * @param post - Post data to resolve tags with
 * @returns Resolved URL path
 */
export function resolvePermalinkTags(
  pattern: string,
  post: PostForUrl,
): string {
  const date = post.publishedAt ? new Date(post.publishedAt) : new Date();

  let result = pattern;

  result = result.replace(/%postname%/g, post.slug);
  result = result.replace(/%year%/g, String(date.getFullYear()));
  result = result.replace(
    /%monthnum%/g,
    String(date.getMonth() + 1).padStart(2, "0"),
  );
  result = result.replace(
    /%day%/g,
    String(date.getDate()).padStart(2, "0"),
  );
  result = result.replace(
    /%post_id%/g,
    String(post.numericId ?? 0),
  );
  result = result.replace(
    /%category%/g,
    post.primaryCategorySlug || "uncategorized",
  );
  result = result.replace(
    /%author%/g,
    post.authorSlug || "admin",
  );
  result = result.replace(
    /%hour%/g,
    String(date.getHours()).padStart(2, "0"),
  );
  result = result.replace(
    /%minute%/g,
    String(date.getMinutes()).padStart(2, "0"),
  );
  result = result.replace(
    /%second%/g,
    String(date.getSeconds()).padStart(2, "0"),
  );

  // Ensure leading slash
  if (!result.startsWith("/")) {
    result = "/" + result;
  }

  // Ensure trailing slash (unless it's a query-string URL)
  if (!result.endsWith("/") && !result.includes("?")) {
    result = result + "/";
  }

  return result;
}
