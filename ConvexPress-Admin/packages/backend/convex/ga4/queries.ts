/**
 * GA4 Integration System - Public Queries
 *
 * Queries for GA4 integration:
 *   - isConnected: boolean check for dashboard data source switching
 *   - getConnectionStatus: full connection details for settings page
 *   - getCachedTrafficData: read cached traffic data from gaCache
 *   - getCachedEngagementData: read cached engagement data from gaCache
 *
 * All queries are reactive -- when an action writes fresh data to gaCache,
 * subscribed components automatically re-render with the new data.
 */

import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { validate } from "convex-helpers/validators";
import { currentUserCan } from "../helpers/permissions";
import {
  ga4DateRangeArgs,
  ga4EngagementDataValidator,
  ga4PathArgs,
  ga4TrafficDataValidator,
} from "./validators";
import {
  computeQueryHash,
  TRAFFIC_METRICS,
  TRAFFIC_DIMENSIONS_SOURCES,
  ENGAGEMENT_METRICS,
  ENGAGEMENT_DIMENSIONS_DAILY,
} from "./helpers";

function stringSetting(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberSetting(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

// ─── isConnected ───────────────────────────────────────────────────────────

/**
 * Check if GA4 is currently connected.
 * Returns a boolean used by dashboard hooks for GA4/fallback switching.
 *
 * @auth analytics.view (Administrator, Editor)
 */
export const isConnected = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const canView = await currentUserCan(ctx, "analytics.view");
    if (!canView) return false;

    const settings = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "analytics"))
      .unique();

    if (!settings) return false;

    const values = (settings.values as Record<string, unknown>) ?? {};
    return values.ga4Connected === true;
  },
});

// ─── getConnectionStatus ───────────────────────────────────────────────────

/**
 * Get full GA4 connection status details for the settings page.
 * Returns property ID, service account email, last sync time, and errors.
 *
 * @auth analytics.manage (Administrator only)
 */
export const getConnectionStatus = query({
  args: {},
  returns: v.union(v.null(), v.object({
    connected: v.boolean(),
    propertyId: v.union(v.string(), v.null()),
    serviceAccountEmail: v.union(v.string(), v.null()),
    lastSync: v.union(v.number(), v.null()),
    error: v.union(v.string(), v.null()),
  })),
  handler: async (ctx) => {
    const canManage = await currentUserCan(ctx, "analytics.manage");
    if (!canManage) return null;

    const settings = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "analytics"))
      .unique();

    if (!settings) {
      return {
        connected: false,
        propertyId: null,
        serviceAccountEmail: null,
        lastSync: null,
        error: null,
      };
    }

    const values = (settings.values as Record<string, unknown>) ?? {};

    return {
      connected: values.ga4Connected === true,
      propertyId: stringSetting(values.ga4PropertyId),
      serviceAccountEmail: stringSetting(values.ga4ServiceAccountEmail),
      lastSync: numberSetting(values.ga4LastSync),
      error: stringSetting(values.ga4Error),
    };
  },
});

// ─── getCachedTrafficData ──────────────────────────────────────────────────

/**
 * Read cached GA4 traffic data from the gaCache table.
 * Computes the query hash and looks up by (propertyId, queryHash).
 * Returns the cached data if found and not expired, null otherwise.
 *
 * When this returns null, the UI should trigger fetchTrafficData action.
 *
 * @auth analytics.view (Administrator, Editor)
 */
export const getCachedTrafficData = query({
  args: {
    ...ga4DateRangeArgs,
    ...ga4PathArgs,
  },
  returns: v.union(v.null(), v.object({
    data: ga4TrafficDataValidator,
    fetchedAt: v.number(),
    source: v.literal("ga4"),
  })),
  handler: async (ctx, args) => {
    const canView = await currentUserCan(ctx, "analytics.view");
    if (!canView) return null;

    // Get property ID from settings
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "analytics"))
      .unique();

    if (!settings) return null;
    const values = (settings.values as Record<string, unknown>) ?? {};
    const propertyId = stringSetting(values.ga4PropertyId);
    if (!propertyId || values.ga4Connected !== true) return null;

    // Compute query hash
    const queryHash = computeQueryHash({
      queryType: "traffic",
      dateRange: args.dateRange,
      path: args.path,
      metrics: TRAFFIC_METRICS,
      dimensions: TRAFFIC_DIMENSIONS_SOURCES,
    });

    // Look up cache
    const cached = await ctx.db
      .query("gaCache")
      .withIndex("by_hash", (q) =>
        q.eq("propertyId", propertyId).eq("queryHash", queryHash),
      )
      .unique();

    if (!cached) return null;

    // Check expiry
    if (cached.expiresAt < Date.now()) return null;

    // A cached payload that is not a normalized traffic report is a cache miss.
    const data: unknown = cached.data;
    if (!validate(ga4TrafficDataValidator, data)) return null;

    return {
      data,
      fetchedAt: cached.fetchedAt,
      source: "ga4" as const,
    };
  },
});

// ─── getCachedEngagementData ───────────────────────────────────────────────

/**
 * Read cached GA4 engagement data from the gaCache table.
 * Same pattern as getCachedTrafficData but for engagement metrics.
 *
 * @auth analytics.view (Administrator, Editor)
 */
export const getCachedEngagementData = query({
  args: {
    ...ga4DateRangeArgs,
    ...ga4PathArgs,
  },
  returns: v.union(v.null(), v.object({
    data: ga4EngagementDataValidator,
    fetchedAt: v.number(),
    source: v.literal("ga4"),
  })),
  handler: async (ctx, args) => {
    const canView = await currentUserCan(ctx, "analytics.view");
    if (!canView) return null;

    // Get property ID from settings
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "analytics"))
      .unique();

    if (!settings) return null;
    const values = (settings.values as Record<string, unknown>) ?? {};
    const propertyId = stringSetting(values.ga4PropertyId);
    if (!propertyId || values.ga4Connected !== true) return null;

    // Compute query hash
    const queryHash = computeQueryHash({
      queryType: "engagement",
      dateRange: args.dateRange,
      path: args.path,
      metrics: ENGAGEMENT_METRICS,
      dimensions: ENGAGEMENT_DIMENSIONS_DAILY,
    });

    // Look up cache
    const cached = await ctx.db
      .query("gaCache")
      .withIndex("by_hash", (q) =>
        q.eq("propertyId", propertyId).eq("queryHash", queryHash),
      )
      .unique();

    if (!cached) return null;

    // Check expiry
    if (cached.expiresAt < Date.now()) return null;

    // A cached payload that is not a normalized engagement report is a cache miss.
    const data: unknown = cached.data;
    if (!validate(ga4EngagementDataValidator, data)) return null;

    return {
      data,
      fetchedAt: cached.fetchedAt,
      source: "ga4" as const,
    };
  },
});

// ─── Internal Query (for actions) ──────────────────────────────────────────

/**
 * Internal query used by actions to read GA4 connection settings.
 * Not client-callable.
 */
export const getConnectionStatusInternal = internalQuery({
  args: {},
  returns: v.union(v.null(), v.object({
    connected: v.boolean(),
    propertyId: v.union(v.string(), v.null()),
    serviceAccountEmail: v.union(v.string(), v.null()),
  })),
  handler: async (ctx) => {
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "analytics"))
      .unique();

    if (!settings) return null;

    const values = (settings.values as Record<string, unknown>) ?? {};
    return {
      connected: values.ga4Connected === true,
      propertyId: stringSetting(values.ga4PropertyId),
      serviceAccountEmail: stringSetting(values.ga4ServiceAccountEmail),
    };
  },
});
