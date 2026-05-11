/**
 * Analytics System - Schema
 *
 * Two tables supporting built-in, privacy-friendly page analytics:
 *   - `pageEvents` - Raw event log with 90-day TTL (purged by cron)
 *   - `pageAnalyticsDaily` - Aggregated daily rollups kept indefinitely
 *
 * This mirrors a two-layer analytics architecture: granular raw events for
 * recent detailed analysis, and efficient rollups for long-term trends.
 *
 * No PII is stored. Visitor IDs are anonymous UUIDs from localStorage.
 * Session IDs are random UUIDs from sessionStorage. User agents are parsed
 * server-side into device/browser/os; the raw string is never stored.
 * IP addresses are used only for optional geo lookup and then discarded.
 *
 * Key design decisions:
 *   - eventType discriminates between pageview, scroll_depth, click, and exit
 *   - postId is optional and resolved from path at ingest time
 *   - payload is a typed object with optional fields per event type
 *   - scrollDepth in rollups uses named sections, not raw percentages
 *   - Rollups are keyed by (date, path, referrerDomain, deviceType, country)
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Shared Validators (used by schema and functions) ───────────────────────

export const eventTypeValidator = v.union(
  v.literal("pageview"),
  v.literal("scroll_depth"),
  v.literal("click"),
  v.literal("exit"),
);

export const deviceTypeValidator = v.union(
  v.literal("desktop"),
  v.literal("mobile"),
  v.literal("tablet"),
);

export const eventPayloadValidator = v.optional(
  v.object({
    // scroll_depth: deepest section reached
    section: v.optional(v.string()),
    sectionIndex: v.optional(v.number()),
    maxSections: v.optional(v.number()),

    // click: link destination
    targetPath: v.optional(v.string()),
    targetLabel: v.optional(v.string()),

    // exit: time spent
    timeOnPageMs: v.optional(v.number()),
    engagedTimeMs: v.optional(v.number()),
  }),
);

export const scrollDepthValidator = v.object({
  hero: v.number(),
  topic1: v.number(),
  topic2: v.number(),
  topic3: v.number(),
  topic4: v.number(),
  topic5: v.number(),
  summary: v.number(),
  sources: v.number(),
  comments: v.number(),
});

export const clickTargetValidator = v.object({
  targetPath: v.string(),
  count: v.number(),
});

// ─── Tables ─────────────────────────────────────────────────────────────────

export const analyticsTables = {
  /**
   * pageEvents - Raw tracking events
   *
   * Stores individual pageview, scroll_depth, click, and exit events.
   * TTL'd at 90 days via a daily purge cron job. Used for:
   *   - Near-real-time "today's stats" in the admin dashboard
   *   - Daily rollup aggregation (processed then purged)
   *   - Session reconstruction for debugging
   */
  pageEvents: defineTable({
    // Event identification
    eventType: eventTypeValidator,
    timestamp: v.number(), // Unix ms

    // Page context
    path: v.string(), // e.g., "/blog/my-post-slug"
    postId: v.optional(v.id("posts")), // Linked post if path resolves

    // Visitor context (anonymous)
    visitorId: v.string(), // Anonymous UUID from localStorage
    sessionId: v.string(), // Session UUID from sessionStorage

    // Traffic source
    referrer: v.optional(v.string()), // Full referrer URL (first pageview only)
    referrerDomain: v.optional(v.string()), // Extracted domain (e.g., "google.com")
    utmSource: v.optional(v.string()),
    utmMedium: v.optional(v.string()),
    utmCampaign: v.optional(v.string()),

    // Device context (parsed from user agent server-side, raw UA not stored)
    deviceType: deviceTypeValidator,
    browser: v.string(), // e.g., "Chrome", "Safari", "Firefox"
    os: v.string(), // e.g., "Windows", "macOS", "iOS", "Android"

    // Geography (resolved from IP at ingest, IP not stored)
    country: v.optional(v.string()), // ISO 3166-1 alpha-2 (e.g., "US", "GB")
    region: v.optional(v.string()), // State/province (e.g., "California")

    // Event-specific payload
    payload: eventPayloadValidator,
  })
    .index("by_path_timestamp", ["path", "timestamp"])
    .index("by_postId_timestamp", ["postId", "timestamp"])
    .index("by_eventType_timestamp", ["eventType", "timestamp"])
    .index("by_timestamp", ["timestamp"])
    .index("by_session", ["sessionId", "timestamp"]),

  /**
   * pageAnalyticsDaily - Aggregated daily rollups
   *
   * One document per unique (date, path, referrerDomain, deviceType, country).
   * Kept indefinitely. Computed by the daily rollup cron from pageEvents.
   */
  pageAnalyticsDaily: defineTable({
    // Aggregation key
    date: v.string(), // ISO date "2026-04-01"
    path: v.string(), // Page path
    postId: v.optional(v.id("posts")),

    // Dimensions (each unique combo = one row)
    referrerDomain: v.optional(v.string()), // null = direct traffic
    deviceType: deviceTypeValidator,
    country: v.optional(v.string()),

    // Core metrics
    pageviews: v.number(),
    uniqueVisitors: v.number(), // Distinct visitorId count
    sessions: v.number(), // Distinct sessionId count

    // Engagement metrics
    avgTimeOnPageMs: v.number(), // Average time on page
    avgEngagedTimeMs: v.number(), // Average engaged (visible) time
    bounceRate: v.number(), // % of sessions with only one pageview (0-1)

    // Scroll depth distribution (% of pageviews reaching each section)
    scrollDepth: scrollDepthValidator,

    // Click metrics
    internalClicks: v.number(), // Total internal link clicks
    topClickTargets: v.array(clickTargetValidator),
  })
    .index("by_date_path", ["date", "path"])
    .index("by_postId_date", ["postId", "date"])
    .index("by_date", ["date"])
    .index("by_path_date", ["path", "date"]),
};
