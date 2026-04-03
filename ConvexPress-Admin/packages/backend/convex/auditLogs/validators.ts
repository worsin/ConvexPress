/**
 * Audit Log System - Shared Validators
 *
 * Convex argument validators used by queries, mutations, and internal functions.
 * These enforce type safety at the Convex argument level.
 */

import { v } from "convex/values";

// ─── Severity Validator ───────────────────────────────────────────────────────

/**
 * Validator for audit severity levels.
 * Maps to the 5-level severity scale (WordPress WP Activity Log has 6; we drop Debug).
 */
export const severityValidator = v.union(
  v.literal("critical"),
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
  v.literal("informational"),
);

// ─── Object Type Validator ────────────────────────────────────────────────────

/**
 * Validator for audit object type categories.
 * Covers all 13 object types in ConvexPress.
 */
export const objectTypeValidator = v.union(
  v.literal("post"),
  v.literal("page"),
  v.literal("comment"),
  v.literal("media"),
  v.literal("user"),
  v.literal("role"),
  v.literal("taxonomy"),
  v.literal("menu"),
  v.literal("settings"),
  v.literal("seo"),
  v.literal("api"),
  v.literal("notification"),
  v.literal("system"),
);

// ─── Query Argument Validators ────────────────────────────────────────────────

/**
 * Args for the list query (paginated, filtered audit entries).
 */
export const listArgs = {
  // Filters
  severity: v.optional(severityValidator),
  system: v.optional(v.string()),
  actorId: v.optional(v.string()),
  objectType: v.optional(objectTypeValidator),
  eventCode: v.optional(v.string()),
  objectId: v.optional(v.string()),
  correlationId: v.optional(v.string()),
  search: v.optional(v.string()),
  dateFrom: v.optional(v.number()),
  dateTo: v.optional(v.number()),
  // Pagination
  cursor: v.optional(v.string()),
  limit: v.optional(v.number()),
  direction: v.optional(
    v.union(v.literal("newer"), v.literal("older")),
  ),
};

/**
 * Args for the get query (single entry by ID).
 */
export const getArgs = {
  entryId: v.id("auditEntries"),
};

/**
 * Args for the getByEvent query (lookup by source event ID).
 */
export const getByEventArgs = {
  eventId: v.id("events"),
};

/**
 * Args for the getObjectHistory query (history for a specific object).
 */
export const getObjectHistoryArgs = {
  objectType: objectTypeValidator,
  objectId: v.string(),
  limit: v.optional(v.number()),
};

/**
 * Args for the getStats query (audit log statistics).
 */
export const getStatsArgs = {
  period: v.optional(
    v.union(
      v.literal("today"),
      v.literal("week"),
      v.literal("month"),
    ),
  ),
};

/**
 * Args for the recentActivity query (dashboard widget).
 */
export const recentActivityArgs = {
  limit: v.optional(v.number()),
};

// ─── Mutation Argument Validators ─────────────────────────────────────────────

/**
 * Args for the clear mutation.
 */
export const clearArgs = {
  mode: v.union(
    v.literal("before_date"),
    v.literal("by_severity"),
    v.literal("expired"),
  ),
  beforeDate: v.optional(v.number()),
  severity: v.optional(severityValidator),
  dryRun: v.optional(v.boolean()),
  confirmPhrase: v.optional(v.string()),
};

// ─── Internal Function Argument Validators ────────────────────────────────────

/**
 * Args for the internal createEntry function.
 */
export const createEntryArgs = {
  eventId: v.id("events"),
};

/**
 * Args for the internal clearBatch continuation.
 */
export const clearBatchArgs = {
  mode: v.string(),
  beforeDate: v.optional(v.number()),
  severity: v.optional(severityValidator),
  deletedSoFar: v.number(),
};
