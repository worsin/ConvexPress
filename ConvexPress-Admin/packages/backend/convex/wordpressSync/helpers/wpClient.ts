/**
 * WordPress REST API Client
 *
 * Provides typed functions for fetching data from WordPress REST API
 * using Application Passwords authentication (Basic Auth).
 */

// ─── WordPress API Response Types ──────────────────────────────────────────

export interface WPPost {
  id: number;
  date: string;
  date_gmt: string;
  guid: { rendered: string };
  modified: string;
  modified_gmt: string;
  slug: string;
  status: string;
  type: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string; protected: boolean };
  excerpt: { rendered: string; protected: boolean };
  author: number;
  featured_media: number;
  comment_status: string;
  ping_status: string;
  sticky: boolean;
  template: string;
  format: string;
  meta: Record<string, unknown>;
  categories: number[];
  tags: number[];
  _embedded?: {
    author?: WPUser[];
    "wp:featuredmedia"?: WPMedia[];
    "wp:term"?: WPTerm[][];
  };
}

export interface WPPage {
  id: number;
  date: string;
  date_gmt: string;
  guid: { rendered: string };
  modified: string;
  modified_gmt: string;
  slug: string;
  status: string;
  type: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string; protected: boolean };
  excerpt: { rendered: string; protected: boolean };
  author: number;
  featured_media: number;
  comment_status: string;
  ping_status: string;
  parent: number;
  menu_order: number;
  template: string;
  meta: Record<string, unknown>;
  _embedded?: {
    author?: WPUser[];
    "wp:featuredmedia"?: WPMedia[];
  };
}

export interface WPUser {
  id: number;
  username: string;
  name: string;
  first_name: string;
  last_name: string;
  email?: string; // Only visible to authenticated users with proper caps
  url: string;
  description: string;
  link: string;
  slug: string;
  avatar_urls: Record<string, string>;
  meta: Record<string, unknown>;
  roles?: string[]; // Only visible to authenticated users with proper caps
}

export interface WPMedia {
  id: number;
  date: string;
  date_gmt: string;
  guid: { rendered: string };
  modified: string;
  modified_gmt: string;
  slug: string;
  status: string;
  type: string;
  link: string;
  title: { rendered: string };
  author: number;
  caption: { rendered: string };
  alt_text: string;
  description: { rendered: string };
  media_type: string;
  mime_type: string;
  media_details: {
    width?: number;
    height?: number;
    file?: string;
    filesize?: number;
    sizes?: Record<
      string,
      {
        file: string;
        width: number;
        height: number;
        mime_type: string;
        source_url: string;
      }
    >;
    image_meta?: Record<string, unknown>;
  };
  post: number | null;
  source_url: string;
}

export interface WPCategory {
  id: number;
  count: number;
  description: string;
  link: string;
  name: string;
  slug: string;
  taxonomy: string;
  parent: number;
  meta: Record<string, unknown>;
}

export interface WPTag {
  id: number;
  count: number;
  description: string;
  link: string;
  name: string;
  slug: string;
  taxonomy: string;
  meta: Record<string, unknown>;
}

export interface WPTerm {
  id: number;
  count: number;
  description: string;
  link: string;
  name: string;
  slug: string;
  taxonomy: string;
  parent?: number;
  meta: Record<string, unknown>;
}

export interface WPComment {
  id: number;
  post: number;
  parent: number;
  author: number;
  author_name: string;
  author_url: string;
  author_email?: string;
  author_ip?: string;
  author_user_agent?: string;
  date: string;
  date_gmt: string;
  content: { rendered: string };
  link: string;
  status: string;
  type: string;
  meta: Record<string, unknown>;
}

export interface WPMenu {
  id: number;
  description: string;
  name: string;
  slug: string;
  meta: Record<string, unknown>;
  locations: string[];
  auto_add: boolean;
}

export interface WPMenuItem {
  id: number;
  title: { rendered: string };
  status: string;
  url: string;
  attr_title: string;
  description: string;
  type: string;
  type_label: string;
  object: string;
  object_id: number;
  parent: number;
  menu_order: number;
  target: string;
  classes: string[];
  xfn: string[];
  meta: Record<string, unknown>;
  menus: number;
  _links: Record<string, unknown>;
}

export interface WPMeta {
  id: number;
  key: string;
  value: string | number | boolean | Record<string, unknown>;
}

export interface WPSiteInfo {
  name: string;
  description: string;
  url: string;
  home: string;
  gmt_offset: number;
  timezone_string: string;
  site_icon: number;
  site_icon_url: string;
  namespaces: string[];
  authentication: Record<string, unknown>;
  routes: Record<string, unknown>;
}

// ─── Client Configuration ──────────────────────────────────────────────────

export interface WPClientConfig {
  siteUrl: string;
  username: string;
  applicationPassword: string;
  wooConsumerKey?: string;
  wooConsumerSecret?: string;
  wooAuthMode?: "shared" | "separate";
  retryCount?: number;
  timeoutMs?: number;
}

export interface WPContentFetchOptions {
  importDrafts?: boolean;
  dateRangeStart?: number;
  dateRangeEnd?: number;
}

function contentStatusParam(options?: WPContentFetchOptions): string {
  return options?.importDrafts === false ? "publish,private" : "any";
}

function contentDateParams(options?: WPContentFetchOptions): Record<string, string> {
  const params: Record<string, string> = {};
  if (typeof options?.dateRangeStart === "number") {
    params.after = new Date(options.dateRangeStart).toISOString();
  }
  if (typeof options?.dateRangeEnd === "number") {
    params.before = new Date(options.dateRangeEnd).toISOString();
  }
  return params;
}

export interface WPFetchResult<T> {
  data: T;
  totalPages: number;
  total: number;
}

// ─── Error Handling ────────────────────────────────────────────────────────

export class WPApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = "WPApiError";
  }
}

const DEFAULT_RETRY_COUNT = 3;
const DEFAULT_TIMEOUT_MS = 30_000;
const BASE_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 10_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

function getRetryDelayMs(response: Response | null, attempt: number): number {
  const retryAfter = response?.headers.get("Retry-After");
  if (retryAfter) {
    const retryAfterSeconds = Number.parseInt(retryAfter, 10);
    if (Number.isFinite(retryAfterSeconds)) {
      return Math.min(retryAfterSeconds * 1000, MAX_RETRY_DELAY_MS);
    }

    const retryAfterDate = Date.parse(retryAfter);
    if (Number.isFinite(retryAfterDate)) {
      return Math.min(
        Math.max(retryAfterDate - Date.now(), BASE_RETRY_DELAY_MS),
        MAX_RETRY_DELAY_MS,
      );
    }
  }

  return Math.min(BASE_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

function toWPApiError(error: unknown): WPApiError {
  if (error instanceof WPApiError) {
    return error;
  }

  if (error instanceof Error && error.name === "AbortError") {
    return new WPApiError("Request timeout", 408, "TIMEOUT");
  }

  return new WPApiError(
    error instanceof Error ? error.message : "Unknown error",
    0,
    "NETWORK_ERROR",
  );
}

async function fetchJsonWithRetry<T>(
  url: URL,
  headers: Record<string, string>,
  config: WPClientConfig,
): Promise<WPFetchResult<T>> {
  const retryCount = config.retryCount ?? DEFAULT_RETRY_COUNT;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorData: unknown;
        try {
          errorData = await response.json();
        } catch {
          // Ignore JSON parse errors.
        }

        const wpError = errorData as { code?: string; message?: string } | undefined;
        const apiError = new WPApiError(
          wpError?.message ||
            `WordPress API error: ${response.status} ${response.statusText}`,
          response.status,
          wpError?.code,
          errorData,
        );

        if (attempt < retryCount && isRetryableStatus(response.status)) {
          await sleep(getRetryDelayMs(response, attempt));
          continue;
        }

        throw apiError;
      }

      const data = (await response.json()) as T;
      return {
        data,
        totalPages: parseInt(response.headers.get("X-WP-TotalPages") || "1", 10),
        total: parseInt(response.headers.get("X-WP-Total") || "0", 10),
      };
    } catch (error) {
      clearTimeout(timeoutId);
      const apiError = toWPApiError(error);
      if (attempt < retryCount && isRetryableStatus(apiError.status)) {
        await sleep(getRetryDelayMs(null, attempt));
        continue;
      }
      throw apiError;
    }
  }

  throw new WPApiError("WordPress API request failed", 0, "NETWORK_ERROR");
}

// ─── Core Fetch Function ───────────────────────────────────────────────────

/**
 * Fetch data from a WordPress REST API endpoint with authentication.
 */
export async function fetchWPEndpoint<T>(
  config: WPClientConfig,
  endpoint: string,
  params?: Record<string, string | number | boolean>
): Promise<WPFetchResult<T>> {
  // Normalize site URL (remove trailing slash)
  const baseUrl = config.siteUrl.replace(/\/$/, "");
  const url = new URL(`${baseUrl}/wp-json/wp/v2/${endpoint}`);

  // Add query parameters
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });
  }

  // WordPress Application Passwords use Basic Auth
  // The password is space-separated 4-character groups, but we use it as-is
  const credentials = btoa(`${config.username}:${config.applicationPassword}`);

  return fetchJsonWithRetry<T>(
    url,
    {
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
      "User-Agent": "ConvexPress-CMS/1.0",
    },
    config,
  );
}

/**
 * Like fetchWPEndpoint, but takes a custom JSON path (e.g. "/wc/v3/products")
 * instead of hardcoding "/wp-json/wp/v2/". Used by the WooCommerce client to
 * hit Woo's REST namespace.
 */
export async function fetchWPJsonEndpoint<T>(
  config: WPClientConfig,
  jsonPath: string,
  params?: Record<string, string | number | boolean>,
): Promise<WPFetchResult<T>> {
  const baseUrl = config.siteUrl.replace(/\/$/, "");
  const normalized = jsonPath.startsWith("/") ? jsonPath : `/${jsonPath}`;
  const url = new URL(`${baseUrl}/wp-json${normalized}`);
  const usesSeparateWooAuth =
    normalized.startsWith("/wc/") &&
    config.wooAuthMode === "separate" &&
    Boolean(config.wooConsumerKey && config.wooConsumerSecret);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });
  }

  if (usesSeparateWooAuth) {
    url.searchParams.set("consumer_key", config.wooConsumerKey!);
    url.searchParams.set("consumer_secret", config.wooConsumerSecret!);
  }

  const credentials = btoa(`${config.username}:${config.applicationPassword}`);

  return fetchJsonWithRetry<T>(
    url,
    {
      ...(usesSeparateWooAuth ? {} : { Authorization: `Basic ${credentials}` }),
      Accept: "application/json",
      "User-Agent": "ConvexPress-CMS/1.0",
    },
    config,
  );
}

// ─── Specialized Fetchers ──────────────────────────────────────────────────

/**
 * Test connection to a WordPress site.
 * Returns site info if successful.
 */
export async function testConnection(
  config: WPClientConfig
): Promise<{ success: true; siteInfo: WPSiteInfo } | { success: false; error: string }> {
  try {
    const baseUrl = config.siteUrl.replace(/\/$/, "");
    const credentials = btoa(`${config.username}:${config.applicationPassword}`);

    const response = await fetch(`${baseUrl}/wp-json/`, {
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: "Invalid credentials" };
      }
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const siteInfo = (await response.json()) as WPSiteInfo;
    return { success: true, siteInfo };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

/**
 * Fetch posts from WordPress.
 */
export function fetchWPPosts(
  config: WPClientConfig,
  page: number,
  perPage = 100,
  options?: WPContentFetchOptions,
): Promise<WPFetchResult<WPPost[]>> {
  return fetchWPEndpoint<WPPost[]>(config, "posts", {
    page,
    per_page: perPage,
    _embed: "1",
    status: contentStatusParam(options),
    orderby: "id",
    order: "asc",
    ...contentDateParams(options),
  });
}

/**
 * Fetch pages from WordPress.
 */
export function fetchWPPages(
  config: WPClientConfig,
  page: number,
  perPage = 100,
  options?: WPContentFetchOptions,
): Promise<WPFetchResult<WPPage[]>> {
  return fetchWPEndpoint<WPPage[]>(config, "pages", {
    page,
    per_page: perPage,
    _embed: "1",
    status: contentStatusParam(options),
    orderby: "id",
    order: "asc",
    ...contentDateParams(options),
  });
}

/**
 * Fetch users from WordPress.
 */
export function fetchWPUsers(
  config: WPClientConfig,
  page: number,
  perPage = 100
): Promise<WPFetchResult<WPUser[]>> {
  return fetchWPEndpoint<WPUser[]>(config, "users", {
    page,
    per_page: perPage,
    context: "edit", // Get full user data including email and roles
    orderby: "id",
    order: "asc",
  });
}

/**
 * Fetch media from WordPress.
 */
export function fetchWPMedia(
  config: WPClientConfig,
  page: number,
  perPage = 100,
  options?: WPContentFetchOptions,
): Promise<WPFetchResult<WPMedia[]>> {
  return fetchWPEndpoint<WPMedia[]>(config, "media", {
    page,
    per_page: perPage,
    status: "any",
    orderby: "id",
    order: "asc",
    ...contentDateParams(options),
  });
}

/**
 * Fetch categories from WordPress.
 */
export function fetchWPCategories(
  config: WPClientConfig,
  page: number,
  perPage = 100
): Promise<WPFetchResult<WPCategory[]>> {
  return fetchWPEndpoint<WPCategory[]>(config, "categories", {
    page,
    per_page: perPage,
    orderby: "id",
    order: "asc",
    hide_empty: false,
  });
}

/**
 * Fetch tags from WordPress.
 */
export function fetchWPTags(
  config: WPClientConfig,
  page: number,
  perPage = 100
): Promise<WPFetchResult<WPTag[]>> {
  return fetchWPEndpoint<WPTag[]>(config, "tags", {
    page,
    per_page: perPage,
    orderby: "id",
    order: "asc",
    hide_empty: false,
  });
}

/**
 * Fetch comments from WordPress.
 */
export function fetchWPComments(
  config: WPClientConfig,
  page: number,
  perPage = 100,
  options?: WPContentFetchOptions,
): Promise<WPFetchResult<WPComment[]>> {
  return fetchWPEndpoint<WPComment[]>(config, "comments", {
    page,
    per_page: perPage,
    status: "all",
    orderby: "id",
    order: "asc",
    ...contentDateParams(options),
  });
}

/**
 * Fetch menus from WordPress.
 * Note: Requires the WP REST API Menus plugin or WP 5.9+ with navigation blocks.
 */
export async function fetchWPMenus(
  config: WPClientConfig
): Promise<WPFetchResult<WPMenu[]>> {
  try {
    // Try the standard menus endpoint first (requires plugin or WP 5.9+)
    return await fetchWPEndpoint<WPMenu[]>(config, "menus", {});
  } catch (error) {
    // If menus endpoint doesn't exist, return empty
    if (error instanceof WPApiError && error.status === 404) {
      return { data: [], totalPages: 0, total: 0 };
    }
    throw error;
  }
}

/**
 * Fetch menu items for a specific menu.
 */
export async function fetchWPMenuItems(
  config: WPClientConfig,
  menuId: number
): Promise<WPFetchResult<WPMenuItem[]>> {
  try {
    return await fetchWPEndpoint<WPMenuItem[]>(config, `menu-items`, {
      menus: menuId,
      per_page: 100,
    });
  } catch (error) {
    if (error instanceof WPApiError && error.status === 404) {
      return { data: [], totalPages: 0, total: 0 };
    }
    throw error;
  }
}

/**
 * Fetch post meta for a specific post.
 * Note: Requires authentication and proper capabilities.
 */
export async function fetchWPPostMeta(
  config: WPClientConfig,
  postId: number
): Promise<WPMeta[]> {
  try {
    // Use the post endpoint with _fields to get meta
    const result = await fetchWPEndpoint<WPPost>(config, `posts/${postId}`, {
      context: "edit",
    });

    // Convert meta object to array format
    const metaArray: WPMeta[] = [];
    const meta = result.data.meta || {};

    let id = 0;
    for (const [key, value] of Object.entries(meta)) {
      metaArray.push({
        id: id++,
        key,
        value: value as string | number | boolean | Record<string, unknown>,
      });
    }

    return metaArray;
  } catch {
    return [];
  }
}

/**
 * Get total counts for all content types.
 * Useful for showing progress totals before sync starts.
 */
export async function getContentCounts(
  config: WPClientConfig
): Promise<{
  users: number;
  posts: number;
  pages: number;
  categories: number;
  tags: number;
  media: number;
  comments: number;
}> {
  // Fetch just the first page of each to get totals from headers
  const [users, posts, pages, categories, tags, media, comments] = await Promise.all([
    fetchWPUsers(config, 1, 1).catch(() => ({ total: 0 })),
    fetchWPPosts(config, 1, 1).catch(() => ({ total: 0 })),
    fetchWPPages(config, 1, 1).catch(() => ({ total: 0 })),
    fetchWPCategories(config, 1, 1).catch(() => ({ total: 0 })),
    fetchWPTags(config, 1, 1).catch(() => ({ total: 0 })),
    fetchWPMedia(config, 1, 1).catch(() => ({ total: 0 })),
    fetchWPComments(config, 1, 1).catch(() => ({ total: 0 })),
  ]);

  return {
    users: users.total,
    posts: posts.total,
    pages: pages.total,
    categories: categories.total,
    tags: tags.total,
    media: media.total,
    comments: comments.total,
  };
}
