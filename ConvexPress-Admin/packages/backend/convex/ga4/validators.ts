/**
 * GA4 Integration System - Shared Argument Validators
 *
 * Reusable Convex validators for GA4 function arguments.
 * Used across queries, mutations, actions, and internals.
 */

import { v } from "convex/values";
import { queryTypeValidator } from "../schema/ga4";

// ─── Date Range ────────────────────────────────────────────────────────────

/**
 * Standard GA4 date range keys.
 * Maps to GA4 Data API date strings in helpers.
 */
export const ga4DateRangeValidator = v.union(
  v.literal("today"),
  v.literal("yesterday"),
  v.literal("last7days"),
  v.literal("last28days"),
  v.literal("last90days"),
  v.literal("custom"),
);

/**
 * Date range arguments for GA4 queries/actions.
 * For standard ranges, only dateRange is needed.
 * For custom ranges, startDate and endDate are required.
 */
export const ga4DateRangeArgs = {
  dateRange: ga4DateRangeValidator,
  startDate: v.optional(v.string()), // ISO date "2026-04-01" (custom only)
  endDate: v.optional(v.string()), // ISO date "2026-04-07" (custom only)
};

// ─── Path Targeting ────────────────────────────────────────────────────────

/** Optional page path filter for per-page analytics */
export const ga4PathArgs = {
  path: v.optional(v.string()),
};

// ─── Property ID ───────────────────────────────────────────────────────────

/** GA4 property ID (format: properties/XXXXXXXXX) */
export const propertyIdValidator = v.string();

// ─── Connection Settings ───────────────────────────────────────────────────

export const saveConnectionArgs = {
  propertyId: v.string(),
  serviceAccountClientEmail: v.string(),
};

export const testConnectionArgs = {
  propertyId: v.string(),
  serviceAccountJson: v.string(),
};

// ─── Cache Upsert ──────────────────────────────────────────────────────────

export const upsertCacheArgs = {
  propertyId: v.string(),
  queryHash: v.string(),
  dateRange: v.string(),
  queryType: queryTypeValidator,
  path: v.optional(v.string()),
  data: v.any(),
};

// ─── Re-export ─────────────────────────────────────────────────────────────

export { queryTypeValidator };
