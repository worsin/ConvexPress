/**
 * GA4 Integration System - Schema
 *
 * Single table: `gaCache` -- caches GA4 Data API responses.
 *
 * Each cache entry stores the full API response payload for a specific
 * query (identified by a SHA-256 hash of the query parameters). Entries
 * expire after 1 hour (3,600,000ms). An hourly cron job purges expired rows.
 *
 * The service account JSON (containing private key) is NEVER stored in
 * the database. It lives in the Convex environment variable
 * `GA4_SERVICE_ACCOUNT_JSON`. Only the property ID, connection status,
 * and service account email are stored in the Settings System.
 *
 * Key design decisions:
 *   - queryHash is SHA-256 of normalized {queryType, dateRange, path, metrics, dimensions}
 *   - queryType discriminates traffic/engagement/overview for type-safe parsing
 *   - data is v.any() because GA4 response shapes vary by query type
 *   - 1-hour TTL balances freshness vs. GA4 API quota (10,000 req/day)
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Validators ────────────────────────────────────────────────────────────

export const queryTypeValidator = v.union(
  v.literal("traffic"),
  v.literal("engagement"),
  v.literal("overview"),
);

// ─── Tables ────────────────────────────────────────────────────────────────

export const ga4Tables = {
  /**
   * gaCache - Cached GA4 Data API responses
   *
   * One document per unique query hash per property. TTL'd at 1 hour
   * via an hourly cron job. Used to avoid redundant GA4 API calls --
   * multiple admins viewing the same dashboard share the same cache entry.
   */
  gaCache: defineTable({
    propertyId: v.string(), // GA4 property ID (e.g., "properties/123456789")
    queryHash: v.string(), // SHA-256 hash of query parameters
    dateRange: v.string(), // Human-readable key (e.g., "last7days", "2026-03-01:2026-03-31")
    queryType: queryTypeValidator, // Categorizes what kind of data this entry contains
    path: v.optional(v.string()), // Page path filter; omitted for site-wide queries
    data: v.any(), // GA4 API response payload (typed per queryType at runtime)
    fetchedAt: v.number(), // Unix timestamp (ms) when data was fetched from GA4
    expiresAt: v.number(), // Unix timestamp (ms) when cache expires (fetchedAt + 3,600,000)
  })
    .index("by_hash", ["propertyId", "queryHash"])
    .index("by_expiry", ["expiresAt"])
    .index("by_type_and_range", ["propertyId", "queryType", "dateRange"]),
};
