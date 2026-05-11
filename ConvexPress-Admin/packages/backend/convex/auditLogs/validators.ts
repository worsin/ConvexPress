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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const severityValidator = v.union(
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("critical"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("high"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("medium"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("low"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("informational"),
);

// ─── Object Type Validator ────────────────────────────────────────────────────

/**
 * Validator for audit object type categories.
 * Covers all 13 object types in ConvexPress.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const objectTypeValidator = v.union(
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("post"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("page"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("comment"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("media"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("user"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("role"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("taxonomy"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("menu"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("settings"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("seo"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("api"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("notification"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    v.union(v.literal("newer"), v.literal("older")),
  ),
};

/**
 * Args for the get query (single entry by ID).
 */
export const getArgs = {
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    v.union(
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("today"),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("week"),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  mode: v.union(
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    v.literal("before_date"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    v.literal("by_severity"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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
