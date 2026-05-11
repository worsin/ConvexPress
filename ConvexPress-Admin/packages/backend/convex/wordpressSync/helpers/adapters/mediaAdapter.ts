// @ts-nocheck
/**
 * Media Adapter
 *
 * Wraps the WordPress REST API v2 media endpoint and provides media
 * download and URL extraction utilities for the import pipeline.
 */

import { BaseAdapter } from "./baseAdapter";
import type { NormalizedResponse, ProbeResult } from "./types";
import { AdapterError } from "./types";
import type { AdapterConfig } from "../../validators";
import type { WPMedia } from "../wpClient";

// ─── Download Result ──────────────────────────────────────────────────────

export interface MediaDownloadResult {
  buffer: ArrayBuffer;
  mimeType: string;
}

// ─── Media Adapter ────────────────────────────────────────────────────────

export class MediaAdapter extends BaseAdapter {
  constructor(config: AdapterConfig) {
    super(config);
  }

  // ─── Probe ──────────────────────────────────────────────────────────────

  /**
   * Probe media endpoint availability by fetching a single media item.
   */
  async probe(): Promise<ProbeResult> {
    try {
      await this.fetchMedia(1, 1);
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

  // ─── Fetch Media ────────────────────────────────────────────────────────

  /**
   * Fetch media attachments from the WordPress media library.
   */
  async fetchMedia(
    page: number,
    perPage: number = 100,
  ): Promise<NormalizedResponse<WPMedia>> {
    return this.fetchPaginated<WPMedia>("wp/v2/media", page, perPage);
  }

  // ─── Download Media ─────────────────────────────────────────────────────

  /**
   * Download a media file from the source WordPress site.
   * Uses a 60-second timeout to accommodate large files.
   * Returns null if the download fails for any reason.
   */
  async downloadMedia(sourceUrl: string): Promise<MediaDownloadResult | null> {
    const DOWNLOAD_TIMEOUT_MS = 60_000;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

      const response = await fetch(sourceUrl, {
        method: "GET",
        headers: {
          "User-Agent": "ConvexPress-CMS/1.0",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return null;
      }

      const buffer = await response.arrayBuffer();
      const mimeType =
        response.headers.get("Content-Type") || "application/octet-stream";

      return { buffer, mimeType };
    } catch {
      return null;
    }
  }

  // ─── Extract Source URLs ────────────────────────────────────────────────

  /**
   * Extract all media URLs from a WPMedia object, including the main
   * source_url and all size variants from media_details.sizes.
   *
   * Returns a deduplicated array of URLs.
   */
  extractSourceUrls(media: WPMedia): string[] {
    const urls = new Set<string>();

    // Main source URL
    if (media.source_url) {
      urls.add(media.source_url);
    }

    // Size variants
    if (media.media_details?.sizes) {
      for (const size of Object.values(media.media_details.sizes)) {
        if (size.source_url) {
          urls.add(size.source_url);
        }
      }
    }

    return Array.from(urls);
  }
}
