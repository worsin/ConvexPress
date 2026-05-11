// @ts-nocheck
/**
 * WordPress REST API Adapter
 *
 * Wraps the WordPress REST API v2 endpoints with the structured adapter
 * interface. Provides typed, paginated fetching for all core WordPress
 * content types plus site info, capability detection, and meta endpoints.
 */

import { BaseAdapter } from "./baseAdapter";
import type { NormalizedResponse, ProbeResult } from "./types";
import { AdapterError } from "./types";
import type { AdapterConfig } from "../../validators";
import type {
  WPPost,
  WPPage,
  WPUser,
  WPMedia,
  WPComment,
  WPCategory,
  WPTag,
  WPSiteInfo,
} from "../wpClient";

// ─── Capability Detection Result ──────────────────────────────────────────

export interface DetectedCapabilities {
  wpRest: boolean;
  menusApi: boolean;
  woocommerceApi: boolean;
  customMetaEndpoint: boolean;
}

export interface FullDetectedCapabilities {
  wpRest: boolean;
  wpAuthValid: boolean;
  menusApi: boolean;
  woocommerceApi: boolean;
  wooAuthValid: boolean;
  customMetaEndpointConfigured: boolean;
  customMetaEndpointDetected: boolean;
  elementorDetected: boolean;
  mediaAccessible: boolean;
}

// ─── Content Counts ───────────────────────────────────────────────────────

export interface ContentCounts {
  users: number;
  posts: number;
  pages: number;
  categories: number;
  tags: number;
  media: number;
  comments: number;
}

// ─── WP Adapter ───────────────────────────────────────────────────────────

export class WPAdapter extends BaseAdapter {
  constructor(config: AdapterConfig) {
    super(config);
  }

  // ─── Probe ──────────────────────────────────────────────────────────────

  /**
   * Probe the WordPress site to check reachability and authentication.
   * Fetches the WP-JSON root endpoint which returns site info when accessible.
   */
  async probe(): Promise<ProbeResult> {
    try {
      const url = this.buildUrl("/");
      const headers = this.wpAuthHeaders();
      const response = await this.fetchWithRetry(url, headers);
      const body = (await response.json()) as WPSiteInfo;

      return {
        reachable: true,
        authenticated: true,
      };
    } catch (error) {
      if (error instanceof AdapterError) {
        return {
          reachable: error.category !== "network",
          authenticated: error.category !== "auth" && error.category !== "capability",
          error: error.toNormalized(),
        };
      }

      return {
        reachable: false,
        authenticated: false,
        error: {
          category: "unknown",
          message: error instanceof Error ? error.message : "Unknown error",
          retryable: false,
        },
      };
    }
  }

  // ─── Site Info ──────────────────────────────────────────────────────────

  /**
   * Fetch full site information from the WP-JSON root endpoint.
   */
  async fetchSiteInfo(): Promise<WPSiteInfo> {
    const url = this.buildUrl("/");
    const headers = this.wpAuthHeaders();
    const response = await this.fetchWithRetry(url, headers);
    return (await response.json()) as WPSiteInfo;
  }

  // ─── Posts ──────────────────────────────────────────────────────────────

  /**
   * Fetch posts with embeds (author, featured media, terms).
   */
  async fetchPosts(
    page: number,
    perPage: number = 100,
  ): Promise<NormalizedResponse<WPPost>> {
    return this.fetchPaginated<WPPost>("wp/v2/posts", page, perPage, {
      _embed: "1",
      status: "any",
      orderby: "id",
      order: "asc",
    });
  }

  // ─── Pages ──────────────────────────────────────────────────────────────

  /**
   * Fetch pages with embeds (author, featured media).
   */
  async fetchPages(
    page: number,
    perPage: number = 100,
  ): Promise<NormalizedResponse<WPPage>> {
    return this.fetchPaginated<WPPage>("wp/v2/pages", page, perPage, {
      _embed: "1",
      status: "any",
      orderby: "id",
      order: "asc",
    });
  }

  // ─── Users ──────────────────────────────────────────────────────────────

  /**
   * Fetch users with edit context (includes email, roles).
   */
  async fetchUsers(
    page: number,
    perPage: number = 100,
  ): Promise<NormalizedResponse<WPUser>> {
    return this.fetchPaginated<WPUser>("wp/v2/users", page, perPage, {
      context: "edit",
    });
  }

  // ─── Media ──────────────────────────────────────────────────────────────

  /**
   * Fetch media attachments.
   */
  async fetchMedia(
    page: number,
    perPage: number = 100,
  ): Promise<NormalizedResponse<WPMedia>> {
    return this.fetchPaginated<WPMedia>("wp/v2/media", page, perPage);
  }

  // ─── Comments ───────────────────────────────────────────────────────────

  /**
   * Fetch comments across all statuses (approved, pending, spam, trash).
   */
  async fetchComments(
    page: number,
    perPage: number = 100,
  ): Promise<NormalizedResponse<WPComment>> {
    return this.fetchPaginated<WPComment>("wp/v2/comments", page, perPage, {
      status: "any",
    });
  }

  // ─── Categories ─────────────────────────────────────────────────────────

  /**
   * Fetch all categories including empty ones.
   */
  async fetchCategories(
    page: number,
    perPage: number = 100,
  ): Promise<NormalizedResponse<WPCategory>> {
    return this.fetchPaginated<WPCategory>("wp/v2/categories", page, perPage, {
      hide_empty: false,
    });
  }

  // ─── Tags ───────────────────────────────────────────────────────────────

  /**
   * Fetch all tags including unused ones.
   */
  async fetchTags(
    page: number,
    perPage: number = 100,
  ): Promise<NormalizedResponse<WPTag>> {
    return this.fetchPaginated<WPTag>("wp/v2/tags", page, perPage, {
      hide_empty: false,
    });
  }

  // ─── Post Meta ──────────────────────────────────────────────────────────

  /**
   * Fetch post meta using the configured custom meta endpoint.
   * Returns null if no meta endpoint is configured.
   *
   * The metaEndpointPath supports `:postType` and `:id` substitution,
   * e.g. "wp/v2/:postType/:id/meta" becomes "wp/v2/posts/42/meta".
   */
  async fetchPostMeta(
    postId: number,
    postType: string = "posts",
  ): Promise<Record<string, unknown> | null> {
    if (!this.config.metaEndpointPath) {
      return null;
    }

    try {
      const path = this.config.metaEndpointPath
        .replace(":postType", postType)
        .replace(":id", String(postId));

      const url = this.buildUrl(path);
      const headers = this.wpAuthHeaders();
      const response = await this.fetchWithRetry(url, headers);
      return (await response.json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  // ─── Content Counts ─────────────────────────────────────────────────────

  /**
   * Get total counts for all WordPress content types by fetching page 1
   * with perPage=1 and reading the X-WP-Total pagination header.
   */
  async getContentCounts(): Promise<ContentCounts> {
    const fetchCount = async (
      path: string,
      extraParams?: Record<string, string | number | boolean>,
    ): Promise<number> => {
      try {
        const result = await this.fetchPaginated(path, 1, 1, extraParams);
        return result.pagination.total;
      } catch {
        return 0;
      }
    };

    const [users, posts, pages, categories, tags, media, comments] =
      await Promise.all([
        fetchCount("wp/v2/users", { context: "edit" }),
        fetchCount("wp/v2/posts", { status: "any" }),
        fetchCount("wp/v2/pages", { status: "any" }),
        fetchCount("wp/v2/categories", { hide_empty: false }),
        fetchCount("wp/v2/tags", { hide_empty: false }),
        fetchCount("wp/v2/media"),
        fetchCount("wp/v2/comments", { status: "any" }),
      ]);

    return { users, posts, pages, categories, tags, media, comments };
  }

  // ─── Capability Detection ───────────────────────────────────────────────

  /**
   * Detect available capabilities by inspecting the site info's
   * registered namespaces and routes.
   */
  detectCapabilities(siteInfo: WPSiteInfo): DetectedCapabilities {
    const namespaces = siteInfo.namespaces ?? [];
    const routes = siteInfo.routes ? Object.keys(siteInfo.routes) : [];

    // WordPress REST API v2 is available if "wp/v2" namespace exists
    const wpRest = namespaces.includes("wp/v2");

    // Menus API: check for "wp/v2" namespace and menu-related routes
    const menusApi =
      routes.some((r) => r.includes("/wp/v2/menus")) ||
      routes.some((r) => r.includes("/wp/v2/menu-items"));

    // WooCommerce API: check for "wc/v3" namespace
    const woocommerceApi = namespaces.includes("wc/v3");

    // Custom meta endpoint: check if the configured path matches a known route
    let customMetaEndpoint = false;
    if (this.config.metaEndpointPath) {
      // Normalize the path pattern to match WordPress route patterns
      const metaPattern = this.config.metaEndpointPath
        .replace(":postType", "(?P<post_type>[\\\\w-]+)")
        .replace(":id", "(?P<id>[\\\\d]+)");

      customMetaEndpoint = routes.some(
        (r) =>
          r.includes("/meta") ||
          r.includes(this.config.metaEndpointPath!.split(":")[0]),
      );
    }

    return {
      wpRest,
      menusApi,
      woocommerceApi,
      customMetaEndpoint,
    };
  }

  // ─── Full Capability Detection ─────────────────────────────────────────

  /**
   * Extended capability detection that goes beyond namespace/route inspection.
   * Probes the live site for Elementor presence (via post meta) and media
   * accessibility (via the media endpoint).
   *
   * Returns the full capabilities shape expected by the site schema.
   */
  async detectCapabilitiesFull(
    siteInfo: WPSiteInfo,
  ): Promise<FullDetectedCapabilities> {
    const basic = this.detectCapabilities(siteInfo);

    // Detect Elementor — two strategies:
    //   1. Custom postmeta endpoint (plugin-installed): authoritative, looks
    //      for the `_elementor_data` meta key directly.
    //   2. Content sniff: fetch a published page's rendered content and look
    //      for Elementor's signature CSS classes. Works on any WordPress
    //      install without extra plugins, which matches what we'll see on
    //      most customer sites.
    let elementorDetected = false;
    if (basic.customMetaEndpoint) {
      try {
        const posts = await this.fetchPosts(1, 1);
        if (posts.data.length > 0) {
          const meta = await this.fetchPostMeta(posts.data[0].id, "posts");
          elementorDetected = meta !== null && "_elementor_data" in meta;
        }
      } catch {
        /* non-critical */
      }
    }
    if (!elementorDetected) {
      try {
        const sniff = await this.sniffElementorInContent();
        elementorDetected = sniff;
      } catch {
        /* non-critical */
      }
    }

    // Check media accessibility by attempting to fetch a single media item
    let mediaAccessible = false;
    try {
      const media = await this.fetchMedia(1, 1);
      mediaAccessible = media.pagination.total > 0;
    } catch {
      /* non-critical — media detection is best-effort */
    }

    return {
      wpRest: basic.wpRest,
      wpAuthValid: true, // We got this far, auth works
      menusApi: basic.menusApi,
      woocommerceApi: basic.woocommerceApi,
      wooAuthValid: false, // Set by WooAdapter probe separately
      customMetaEndpointConfigured: !!this.config.metaEndpointPath,
      customMetaEndpointDetected: basic.customMetaEndpoint,
      elementorDetected,
      mediaAccessible,
    };
  }

  /**
   * Sniff Elementor by looking for its signature CSS classes in rendered
   * page or post content. Works without any plugin on the source site.
   *
   * Elementor wraps every section, column, and widget in elements with a
   * stable `elementor-element` (or `elementor-section`, `elementor-widget`)
   * class. If we see any of those in the rendered HTML of the first
   * published page or post, Elementor is in use.
   */
  private async sniffElementorInContent(): Promise<boolean> {
    const baseUrl = this.config.siteUrl.replace(/\/$/, "");
    const credentials = btoa(
      `${this.config.username}:${this.config.password}`,
    );
    const headers = {
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
    };

    const sniffEndpoints = [
      `${baseUrl}/wp-json/wp/v2/pages?per_page=3&_fields=content,id`,
      `${baseUrl}/wp-json/wp/v2/posts?per_page=3&_fields=content,id`,
    ];

    const elementorRegex =
      /elementor-(?:element|section|widget|column|container|kit-)/i;

    for (const url of sniffEndpoints) {
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) continue;
        const data = (await res.json()) as Array<{
          content?: { rendered?: string };
        }>;
        for (const item of data) {
          const html = item.content?.rendered ?? "";
          if (elementorRegex.test(html)) {
            return true;
          }
        }
      } catch {
        /* non-critical */
      }
    }
    return false;
  }
}
