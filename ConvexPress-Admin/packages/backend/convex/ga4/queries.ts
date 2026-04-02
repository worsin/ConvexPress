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

import { query } from "../_generated/server";
import { v } from "convex/values";
import { currentUserCan } from "../helpers/permissions";
import { ga4DateRangeArgs, ga4PathArgs } from "./validators";
import {
  computeQueryHash,
  TRAFFIC_METRICS,
  TRAFFIC_DIMENSIONS_SOURCES,
  ENGAGEMENT_METRICS,
  ENGAGEMENT_DIMENSIONS_DAILY,
} from "./helpers";

// ─── isConnected ───────────────────────────────────────────────────────────

/**
 * Check if GA4 is currently connected.
 * Returns a boolean used by dashboard hooks for GA4/fallback switching.
 *
 * @auth analytics.view (Administrator, Editor)
 */
export const isConnected = query({
  args: {},
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
      propertyId: (values.ga4PropertyId as string) ?? null,
      serviceAccountEmail: (values.ga4ServiceAccountEmail as string) ?? null,
      lastSync: (values.ga4LastSync as number) ?? null,
      error: (values.ga4Error as string) ?? null,
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
    const propertyId = values.ga4PropertyId as string | undefined;
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

    return {
      data: cached.data,
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
    const propertyId = values.ga4PropertyId as string | undefined;
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

    return {
      data: cached.data,
      fetchedAt: cached.fetchedAt,
      source: "ga4" as const,
    };
  },
});
