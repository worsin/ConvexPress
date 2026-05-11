// @ts-nocheck
/**
 * Base Adapter
 *
 * Abstract base class that all source adapters extend. Provides:
 * - fetchWithRetry: retry with exponential backoff, rate-limit handling, auth fail-fast
 * - buildUrl / buildWooUrl: WordPress and WooCommerce URL construction
 * - wpAuthHeaders / wooAuthHeaders: authentication header generation
 * - parsePagination: X-WP-Total / X-WP-TotalPages header parsing
 * - fetchPaginated / fetchWooPaginated: paginated fetch helpers
 */

import type { AdapterConfig } from "../../validators";
import { AdapterError, type NormalizedResponse, type PaginationInfo } from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_RETRY_COUNT = 3;
const DEFAULT_TIMEOUT_MS = 30_000;
const BACKOFF_BASE_MS = 1_000;
const MAX_RETRY_AFTER_MS = 60_000;
const USER_AGENT = "ConvexPress-CMS/1.0";

// ─── Base Adapter ─────────────────────────────────────────────────────────────

export abstract class BaseAdapter {
  protected readonly config: AdapterConfig;
  protected readonly retryCount: number;

  constructor(config: AdapterConfig) {
    this.config = config;
    this.retryCount = config.retryCount ?? DEFAULT_RETRY_COUNT;
  }

  // ─── URL Building ─────────────────────────────────────────────────────────

  /**
   * Build a WordPress REST API URL from a path and optional query params.
   *
   * @param basePath - The REST path after /wp-json/ (e.g. "wp/v2/posts")
   * @param params - Optional query parameters
   */
  protected buildUrl(
    basePath: string,
    params?: Record<string, string | number | boolean>,
  ): string {
    const siteUrl = this.config.siteUrl.replace(/\/$/, "");
    const url = new URL(`${siteUrl}/wp-json/${basePath}`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  /**
   * Build a WooCommerce REST API URL. In "separate" auth mode, consumer_key
   * and consumer_secret are appended as query parameters (OAuth 1.0 over HTTPS).
   *
   * @param path - The REST path after /wp-json/ (e.g. "wc/v3/products")
   * @param params - Optional query parameters
   */
  protected buildWooUrl(
    path: string,
    params?: Record<string, string | number | boolean>,
  ): string {
    const siteUrl = this.config.siteUrl.replace(/\/$/, "");
    const url = new URL(`${siteUrl}/wp-json/${path}`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    // In "separate" mode, authenticate via query params instead of Basic Auth
    if (
      this.config.wooAuthMode === "separate" &&
      this.config.wooKey &&
      this.config.wooSecret
    ) {
      url.searchParams.set("consumer_key", this.config.wooKey);
      url.searchParams.set("consumer_secret", this.config.wooSecret);
    }

    return url.toString();
  }

  // ─── Auth Headers ─────────────────────────────────────────────────────────

  /**
   * Generate WordPress Basic Auth headers using username + application password.
   */
  protected wpAuthHeaders(): Record<string, string> {
    const credentials = btoa(`${this.config.username}:${this.config.password}`);
    return {
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    };
  }

  /**
   * Generate WooCommerce auth headers.
   *
   * - "shared" mode: reuse WordPress Basic Auth headers (same credentials)
   * - "separate" mode: return empty auth (credentials are in the URL query params)
   */
  protected wooAuthHeaders(): Record<string, string> {
    if (this.config.wooAuthMode === "shared") {
      return this.wpAuthHeaders();
    }

    // Separate mode: auth is in query params, no Authorization header needed
    return {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    };
  }

  // ─── Pagination Parsing ───────────────────────────────────────────────────

  /**
   * Parse WordPress/WooCommerce pagination headers into a PaginationInfo object.
   */
  protected parsePagination(
    headers: Headers,
    currentPage: number,
  ): PaginationInfo {
    const total = parseInt(headers.get("X-WP-Total") || "0", 10);
    const totalPages = parseInt(headers.get("X-WP-TotalPages") || "1", 10);

    return {
      total,
      totalPages,
      currentPage,
      hasMore: currentPage < totalPages,
    };
  }

  // ─── Fetch With Retry ─────────────────────────────────────────────────────

  /**
   * Perform a GET request with retry logic, exponential backoff, rate-limit
   * awareness, and auth fail-fast.
   *
   * @param url - Fully-qualified URL to fetch
   * @param headers - Request headers (including auth)
   * @param attempt - Current attempt number (0-based, used internally for recursion)
   * @returns The raw Response object on success
   * @throws AdapterError on unrecoverable or exhausted-retries failure
   */
  protected async fetchWithRetry(
    url: string,
    headers: Record<string, string>,
    attempt: number = 0,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // ── Auth failures: never retry ──────────────────────────────────────
      if (response.status === 401 || response.status === 403) {
        const body = await this.safeParseJson(response);
        const message =
          (typeof body?.message === "string" ? body.message : null) ??
          (response.status === 401
            ? "Authentication failed — invalid credentials"
            : "Forbidden — insufficient capabilities");

        throw new AdapterError(
          message,
          response.status === 401 ? "auth" : "capability",
          response.status,
          false, // never retry auth/cap errors
        );
      }

      // ── Rate limiting: respect Retry-After ──────────────────────────────
      if (response.status === 429) {
        if (attempt >= this.retryCount) {
          throw new AdapterError(
            "Rate limited — retries exhausted",
            "rate_limit",
            429,
            true,
          );
        }

        const retryAfterHeader = response.headers.get("Retry-After");
        let delayMs = BACKOFF_BASE_MS * Math.pow(2, attempt);

        if (retryAfterHeader) {
          const retryAfterSec = parseInt(retryAfterHeader, 10);
          if (!isNaN(retryAfterSec)) {
            delayMs = Math.min(retryAfterSec * 1_000, MAX_RETRY_AFTER_MS);
          }
        }

        await this.sleep(delayMs);
        return this.fetchWithRetry(url, headers, attempt + 1);
      }

      // ── Server errors (5xx): retry with backoff ─────────────────────────
      if (response.status >= 500) {
        if (attempt >= this.retryCount) {
          const body = await this.safeParseJson(response);
          throw new AdapterError(
            (typeof body?.message === "string" ? body.message : null) ?? `Server error: ${response.status} ${response.statusText}`,
            "source_data",
            response.status,
            true,
          );
        }

        const delayMs = BACKOFF_BASE_MS * Math.pow(2, attempt);
        await this.sleep(delayMs);
        return this.fetchWithRetry(url, headers, attempt + 1);
      }

      // ── Client errors (4xx, non-auth): do not retry ─────────────────────
      if (!response.ok) {
        const body = await this.safeParseJson(response);
        throw new AdapterError(
          (typeof body?.message === "string" ? body.message : null) ?? `HTTP ${response.status}: ${response.statusText}`,
          "source_data",
          response.status,
          false,
        );
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      // Re-throw AdapterErrors as-is
      if (error instanceof AdapterError) {
        throw error;
      }

      // ── Timeout / network errors: retry with backoff ────────────────────
      const isTimeout =
        error instanceof Error && error.name === "AbortError";
      const isNetwork =
        error instanceof Error &&
        (error.message.includes("fetch") ||
          error.message.includes("network") ||
          error.message.includes("ECONNREFUSED") ||
          error.message.includes("ENOTFOUND") ||
          error.message.includes("ETIMEDOUT"));

      if ((isTimeout || isNetwork) && attempt < this.retryCount) {
        const delayMs = BACKOFF_BASE_MS * Math.pow(2, attempt);
        await this.sleep(delayMs);
        return this.fetchWithRetry(url, headers, attempt + 1);
      }

      throw new AdapterError(
        isTimeout
          ? `Request timeout after ${DEFAULT_TIMEOUT_MS}ms`
          : error instanceof Error
            ? error.message
            : "Unknown network error",
        "network",
        undefined,
        true, // network errors are generally retryable
      );
    }
  }

  // ─── Paginated Fetchers ───────────────────────────────────────────────────

  /**
   * Fetch a paginated WordPress REST API endpoint.
   *
   * @param path - REST path after /wp-json/ (e.g. "wp/v2/posts")
   * @param page - Page number (1-based)
   * @param perPage - Items per page
   * @param extraParams - Additional query parameters
   * @param authHeaders - Auth headers to use (defaults to wpAuthHeaders)
   */
  protected async fetchPaginated<T>(
    path: string,
    page: number,
    perPage: number,
    extraParams?: Record<string, string | number | boolean>,
    authHeaders?: Record<string, string>,
  ): Promise<NormalizedResponse<T>> {
    const params: Record<string, string | number | boolean> = {
      page,
      per_page: perPage,
      ...extraParams,
    };

    const url = this.buildUrl(path, params);
    const headers = authHeaders ?? this.wpAuthHeaders();
    const response = await this.fetchWithRetry(url, headers);
    const data = (await response.json()) as T[];
    const pagination = this.parsePagination(response.headers, page);

    return { data, pagination };
  }

  /**
   * Fetch a paginated WooCommerce REST API endpoint.
   *
   * @param path - REST path after /wp-json/ (e.g. "wc/v3/products")
   * @param page - Page number (1-based)
   * @param perPage - Items per page
   * @param extraParams - Additional query parameters
   */
  protected async fetchWooPaginated<T>(
    path: string,
    page: number,
    perPage: number,
    extraParams?: Record<string, string | number | boolean>,
  ): Promise<NormalizedResponse<T>> {
    const params: Record<string, string | number | boolean> = {
      page,
      per_page: perPage,
      ...extraParams,
    };

    const url = this.buildWooUrl(path, params);
    const headers = this.wooAuthHeaders();
    const response = await this.fetchWithRetry(url, headers);
    const data = (await response.json()) as T[];
    const pagination = this.parsePagination(response.headers, page);

    return { data, pagination };
  }

  // ─── Internal Helpers ─────────────────────────────────────────────────────

  /**
   * Safely parse JSON from a response, returning null on failure.
   */
  private async safeParseJson(
    response: Response,
  ): Promise<Record<string, unknown> | null> {
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /**
   * Sleep for the given number of milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
