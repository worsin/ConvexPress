/**
 * Analytics System - Shared Argument Validators
 *
 * Reusable Convex validators for analytics function arguments.
 * Used across queries, mutations, internals, and HTTP actions.
 */

import { v } from "convex/values";
import {
  eventTypeValidator,
  deviceTypeValidator,
  eventPayloadValidator,
} from "../schema/analytics";

// ─── Date Range Args ────────────────────────────────────────────────────────

/** Standard date range args for analytics queries */
export const dateRangeArgs = {
  startDate: v.string(), // ISO date "2026-04-01"
  endDate: v.string(), // ISO date "2026-04-07"
};

// ─── Path / Post Targeting ──────────────────────────────────────────────────

/** Optional path or postId targeting for analytics queries */
export const targetArgs = {
  path: v.optional(v.string()),
  postId: v.optional(v.id("posts")),
};

// ─── Tracking Event (from client) ───────────────────────────────────────────

/**
 * Raw event shape as sent by the tracking script.
 * The HTTP action validates this shape, then normalizes it before writing.
 * Note: userAgent is accepted here but NOT stored -- it is parsed into
 * deviceType, browser, os server-side.
 */
export const trackingEventValidator = v.object({
  eventType: eventTypeValidator,
  path: v.string(),
  visitorId: v.string(),
  sessionId: v.string(),
  timestamp: v.number(),
  referrer: v.optional(v.string()),
  userAgent: v.optional(v.string()),
  utmSource: v.optional(v.string()),
  utmMedium: v.optional(v.string()),
  utmCampaign: v.optional(v.string()),
  payload: v.optional(
    v.object({
      section: v.optional(v.string()),
      sectionIndex: v.optional(v.number()),
      maxSections: v.optional(v.number()),
      targetPath: v.optional(v.string()),
      targetLabel: v.optional(v.string()),
      timeOnPageMs: v.optional(v.number()),
      engagedTimeMs: v.optional(v.number()),
    }),
  ),
});

// ─── Ingest Events (internal, after normalization) ──────────────────────────

/** Validated + normalized event shape written to pageEvents table */
export const normalizedEventValidator = v.object({
  eventType: eventTypeValidator,
  timestamp: v.number(),
  path: v.string(),
  postId: v.optional(v.id("posts")),
  visitorId: v.string(),
  sessionId: v.string(),
  referrer: v.optional(v.string()),
  referrerDomain: v.optional(v.string()),
  utmSource: v.optional(v.string()),
  utmMedium: v.optional(v.string()),
  utmCampaign: v.optional(v.string()),
  deviceType: deviceTypeValidator,
  browser: v.string(),
  os: v.string(),
  country: v.optional(v.string()),
  region: v.optional(v.string()),
  payload: eventPayloadValidator,
});

// ─── Purge Args ─────────────────────────────────────────────────────────────

export const purgeArgs = {
  scope: v.union(v.literal("all"), v.literal("before_date")),
  beforeDate: v.optional(v.string()),
};

// ─── Settings Args ──────────────────────────────────────────────────────────

export const settingsArgs = {
  trackingEnabled: v.optional(v.boolean()),
  respectDoNotTrack: v.optional(v.boolean()),
  retentionDays: v.optional(v.number()),
};
