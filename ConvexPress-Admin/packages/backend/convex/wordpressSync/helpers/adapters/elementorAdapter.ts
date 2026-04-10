// @ts-nocheck
/**
 * Elementor Adapter
 *
 * Fetches and extracts Elementor page builder data from WordPress post meta.
 * Relies on a custom meta endpoint (e.g. a WP plugin that exposes raw
 * post_meta via REST) to access Elementor's `_elementor_data`, CSS,
 * page settings, and template type fields.
 */

import { BaseAdapter } from "./baseAdapter";
import type { ProbeResult } from "./types";
import { AdapterError } from "./types";
import type { AdapterConfig } from "../../validators";

// ─── Raw Post Meta ────────────────────────────────────────────────────────

export interface RawPostMeta {
  _elementor_data?: string;
  _elementor_css?: string;
  _elementor_page_settings?: string;
  _elementor_template_type?: string;
  _wp_page_template?: string;
  [key: string]: unknown;
}

// ─── Extracted Elementor Fields ───────────────────────────────────────────

export interface ElementorFields {
  rawElementorData: string | undefined;
  elementorCss: string | undefined;
  elementorPageSettings: string | undefined;
  elementorTemplateType: string | undefined;
  wpPageTemplate: string | undefined;
  rawSourceMeta: Record<string, unknown>;
}

// ─── Elementor Adapter ────────────────────────────────────────────────────

export class ElementorAdapter extends BaseAdapter {
  constructor(config: AdapterConfig) {
    super(config);
  }

  // ─── Probe ──────────────────────────────────────────────────────────────

  /**
   * Probe Elementor meta endpoint availability.
   * If no metaEndpointPath is configured, the adapter is not usable.
   * Otherwise, attempts to fetch meta for post ID 1 as a connectivity test.
   */
  async probe(): Promise<ProbeResult> {
    if (!this.config.metaEndpointPath) {
      return {
        reachable: false,
        authenticated: false,
        error: {
          category: "source_data",
          message: "No metaEndpointPath configured — Elementor adapter requires a custom meta endpoint",
          retryable: false,
        },
      };
    }

    try {
      await this.fetchPostMeta(1);
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

  // ─── Fetch Post Meta ────────────────────────────────────────────────────

  /**
   * Fetch raw post meta from the custom meta endpoint.
   * Returns null if no metaEndpointPath is configured or if the request fails.
   *
   * The metaEndpointPath supports `:postType` and `:id` substitution,
   * e.g. "custom/v1/:postType/:id/meta" becomes "custom/v1/posts/42/meta".
   */
  async fetchPostMeta(
    postId: number,
    postType: string = "posts",
  ): Promise<RawPostMeta | null> {
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
      return (await response.json()) as RawPostMeta;
    } catch {
      return null;
    }
  }

  // ─── Extract Elementor Fields ───────────────────────────────────────────

  /**
   * Extract Elementor-specific fields from raw post meta.
   *
   * Separates known Elementor fields (`_elementor_*`, `_wp_page_template`)
   * from the rest of the meta. Filters out Yoast SEO (`_yoast_wpseo_*`)
   * and WordPress edit lock (`_edit_*`) keys from the remaining meta.
   */
  extractElementorFields(meta: RawPostMeta): ElementorFields {
    const rawSourceMeta: Record<string, unknown> = {};

    // Collect all non-Elementor, non-filtered keys into rawSourceMeta
    for (const [key, value] of Object.entries(meta)) {
      // Skip known Elementor fields
      if (
        key === "_elementor_data" ||
        key === "_elementor_css" ||
        key === "_elementor_page_settings" ||
        key === "_elementor_template_type" ||
        key === "_wp_page_template"
      ) {
        continue;
      }

      // Filter out Yoast SEO meta keys
      if (key.startsWith("_yoast_wpseo_")) {
        continue;
      }

      // Filter out WordPress edit lock/last keys
      if (key.startsWith("_edit_")) {
        continue;
      }

      rawSourceMeta[key] = value;
    }

    return {
      rawElementorData: meta._elementor_data,
      elementorCss: meta._elementor_css,
      elementorPageSettings: meta._elementor_page_settings,
      elementorTemplateType: meta._elementor_template_type,
      wpPageTemplate: meta._wp_page_template,
      rawSourceMeta,
    };
  }
}
