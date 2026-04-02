"use node";

/**
 * GA4 Integration System - Actions
 *
 * Node.js actions that make external HTTP calls to the GA4 Data API.
 * Uses the `googleapis` package for authentication and report requests.
 *
 * Actions:
 *   - testConnection: validate credentials with a minimal API request
 *   - fetchTrafficData: fetch traffic metrics and cache the result
 *   - fetchEngagementData: fetch engagement metrics and cache the result
 *
 * All actions read the service account JSON from the Convex environment
 * variable GA4_SERVICE_ACCOUNT_JSON. The credentials never leave the server.
 *
 * Cache pattern:
 *   1. Compute query hash from parameters
 *   2. Check gaCache for unexpired entry (via internal query)
 *   3. Cache hit: return cached data immediately
 *   4. Cache miss: call GA4 API, cache result via upsertCache, return data
 */

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { google } from "googleapis";
import {
  ga4DateRangeArgs,
  ga4PathArgs,
  testConnectionArgs,
} from "./validators";
import {
  computeQueryHash,
  parseDateRange,
  parseGA4RunReportResponse,
  buildTrafficData,
  buildEngagementData,
  TRAFFIC_METRICS,
  TRAFFIC_DIMENSIONS_SOURCES,
  TRAFFIC_DIMENSIONS_REFERRERS,
  TRAFFIC_DIMENSIONS_COUNTRIES,
  TRAFFIC_DIMENSIONS_DEVICES,
  TRAFFIC_DIMENSIONS_DAILY,
  ENGAGEMENT_METRICS,
  ENGAGEMENT_DIMENSIONS_DAILY,
} from "./helpers";

// ─── Auth Helper ───────────────────────────────────────────────────────────

function getAnalyticsClient(serviceAccountJson: string) {
  const credentials = JSON.parse(serviceAccountJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  });
  return google.analyticsdata({ version: "v1beta", auth });
}

// ─── testConnection ────────────────────────────────────────────────────────

/**
 * Test GA4 connection by making a minimal API request.
 * Validates service account JSON structure, authenticates, and requests
 * a single metric for one day. Does NOT store credentials.
 *
 * @auth analytics.manage (validated client-side before calling)
 */
export const testConnection = action({
  args: testConnectionArgs,
  handler: async (_ctx, args) => {
    // Validate service account JSON structure
    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(args.serviceAccountJson);
    } catch {
      return {
        success: false,
        error: "Invalid JSON. Please provide a valid service account key file.",
      };
    }

    if (
      credentials.type !== "service_account" ||
      !credentials.client_email ||
      !credentials.private_key
    ) {
      return {
        success: false,
        error:
          "Invalid service account JSON. Must contain type: 'service_account', client_email, and private_key fields.",
      };
    }

    // Validate property ID format
    if (!/^properties\/\d+$/.test(args.propertyId)) {
      return {
        success: false,
        error:
          "Invalid GA4 property ID format. Expected: properties/XXXXXXXXX",
      };
    }

    // Test API call
    try {
      const analyticsData = getAnalyticsClient(args.serviceAccountJson);

      await analyticsData.properties.runReport({
        property: args.propertyId,
        requestBody: {
          dateRanges: [{ startDate: "yesterday", endDate: "today" }],
          metrics: [{ name: "screenPageViews" }],
        },
      });

      return {
        success: true,
        clientEmail: credentials.client_email as string,
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown error connecting to GA4";

      // Parse common GA4 API errors
      if (message.includes("403") || message.includes("PERMISSION_DENIED")) {
        return {
          success: false,
          error:
            "Service account does not have access to this GA4 property. Grant Viewer role in GA4 admin settings.",
        };
      }
      if (message.includes("404") || message.includes("NOT_FOUND")) {
        return {
          success: false,
          error:
            "GA4 property not found. Verify the property ID is correct.",
        };
      }

      return { success: false, error: message };
    }
  },
});

// ─── fetchTrafficData ──────────────────────────────────────────────────────

/**
 * Fetch traffic metrics from GA4 Data API and cache the result.
 * Makes multiple parallel runReport calls for different dimension breakdowns.
 *
 * Returns the normalized traffic data object.
 */
export const fetchTrafficData = action({
  args: {
    ...ga4DateRangeArgs,
    ...ga4PathArgs,
  },
  handler: async (ctx, args) => {
    // Read credentials from env var
    const serviceAccountJson = process.env.GA4_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      throw new Error("GA4_SERVICE_ACCOUNT_JSON environment variable not set");
    }

    // Read property ID from settings
    const settings = await ctx.runQuery(
      internal.ga4.queries.getConnectionStatusInternal,
    );
    if (!settings?.propertyId) {
      throw new Error("GA4 is not connected. Configure in Settings > Analytics.");
    }

    const propertyId = settings.propertyId;
    const analyticsData = getAnalyticsClient(serviceAccountJson);
    const { startDate, endDate } = parseDateRange(
      args.dateRange,
      args.startDate,
      args.endDate,
    );

    // Build path filter
    const dimensionFilter = args.path
      ? {
          filter: {
            fieldName: "pagePath",
            stringFilter: {
              value: args.path,
              matchType: "EXACT" as const,
            },
          },
        }
      : undefined;

    // Make parallel API calls for different dimension breakdowns
    try {
      const [summaryRes, sourcesRes, referrersRes, countriesRes, devicesRes, dailyRes] =
        await Promise.all([
          // Summary (totals only, no dimensions)
          analyticsData.properties.runReport({
            property: propertyId,
            requestBody: {
              dateRanges: [{ startDate, endDate }],
              metrics: TRAFFIC_METRICS.map((name) => ({ name })),
              dimensionFilter,
            },
          }),
          // By traffic source channel
          analyticsData.properties.runReport({
            property: propertyId,
            requestBody: {
              dateRanges: [{ startDate, endDate }],
              metrics: [{ name: "sessions" }],
              dimensions: TRAFFIC_DIMENSIONS_SOURCES.map((name) => ({ name })),
              dimensionFilter,
            },
          }),
          // By referrer domain
          analyticsData.properties.runReport({
            property: propertyId,
            requestBody: {
              dateRanges: [{ startDate, endDate }],
              metrics: [{ name: "sessions" }],
              dimensions: TRAFFIC_DIMENSIONS_REFERRERS.map((name) => ({ name })),
              dimensionFilter,
              limit: "20",
            },
          }),
          // By country
          analyticsData.properties.runReport({
            property: propertyId,
            requestBody: {
              dateRanges: [{ startDate, endDate }],
              metrics: [{ name: "totalUsers" }],
              dimensions: TRAFFIC_DIMENSIONS_COUNTRIES.map((name) => ({ name })),
              dimensionFilter,
              limit: "20",
            },
          }),
          // By device category
          analyticsData.properties.runReport({
            property: propertyId,
            requestBody: {
              dateRanges: [{ startDate, endDate }],
              metrics: [{ name: "sessions" }],
              dimensions: TRAFFIC_DIMENSIONS_DEVICES.map((name) => ({ name })),
              dimensionFilter,
            },
          }),
          // Daily breakdown
          analyticsData.properties.runReport({
            property: propertyId,
            requestBody: {
              dateRanges: [{ startDate, endDate }],
              metrics: TRAFFIC_METRICS.map((name) => ({ name })),
              dimensions: TRAFFIC_DIMENSIONS_DAILY.map((name) => ({ name })),
              dimensionFilter,
            },
          }),
        ]);

      // Parse responses
      const data = buildTrafficData({
        summary: parseGA4RunReportResponse(summaryRes.data as any),
        sources: parseGA4RunReportResponse(sourcesRes.data as any),
        referrers: parseGA4RunReportResponse(referrersRes.data as any),
        countries: parseGA4RunReportResponse(countriesRes.data as any),
        devices: parseGA4RunReportResponse(devicesRes.data as any),
        daily: parseGA4RunReportResponse(dailyRes.data as any),
      });

      // Cache the result
      const queryHash = computeQueryHash({
        queryType: "traffic",
        dateRange: args.dateRange,
        path: args.path,
        metrics: TRAFFIC_METRICS,
        dimensions: TRAFFIC_DIMENSIONS_SOURCES,
      });

      await ctx.runMutation(internal.ga4.mutations.upsertCache, {
        propertyId,
        queryHash,
        dateRange: args.dateRange,
        queryType: "traffic",
        path: args.path,
        data,
      });

      // Update last sync timestamp
      await ctx.runMutation(internal.ga4.internals.updateLastSync, {
        propertyId,
      });

      return data;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "GA4 API error";

      // Store error in settings
      await ctx.runMutation(internal.ga4.internals.setError, {
        error: message,
      });

      throw new Error(`GA4 fetch failed: ${message}`);
    }
  },
});

// ─── fetchEngagementData ───────────────────────────────────────────────────

/**
 * Fetch engagement metrics from GA4 Data API and cache the result.
 */
export const fetchEngagementData = action({
  args: {
    ...ga4DateRangeArgs,
    ...ga4PathArgs,
  },
  handler: async (ctx, args) => {
    // Read credentials from env var
    const serviceAccountJson = process.env.GA4_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      throw new Error("GA4_SERVICE_ACCOUNT_JSON environment variable not set");
    }

    // Read property ID from settings
    const settings = await ctx.runQuery(
      internal.ga4.queries.getConnectionStatusInternal,
    );
    if (!settings?.propertyId) {
      throw new Error("GA4 is not connected. Configure in Settings > Analytics.");
    }

    const propertyId = settings.propertyId;
    const analyticsData = getAnalyticsClient(serviceAccountJson);
    const { startDate, endDate } = parseDateRange(
      args.dateRange,
      args.startDate,
      args.endDate,
    );

    // Build path filter
    const dimensionFilter = args.path
      ? {
          filter: {
            fieldName: "pagePath",
            stringFilter: {
              value: args.path,
              matchType: "EXACT" as const,
            },
          },
        }
      : undefined;

    try {
      const response = await analyticsData.properties.runReport({
        property: propertyId,
        requestBody: {
          dateRanges: [{ startDate, endDate }],
          metrics: ENGAGEMENT_METRICS.map((name) => ({ name })),
          dimensions: ENGAGEMENT_DIMENSIONS_DAILY.map((name) => ({ name })),
          dimensionFilter,
        },
      });

      // Parse response
      const data = buildEngagementData(
        parseGA4RunReportResponse(response.data as any),
      );

      // Cache the result
      const queryHash = computeQueryHash({
        queryType: "engagement",
        dateRange: args.dateRange,
        path: args.path,
        metrics: ENGAGEMENT_METRICS,
        dimensions: ENGAGEMENT_DIMENSIONS_DAILY,
      });

      await ctx.runMutation(internal.ga4.mutations.upsertCache, {
        propertyId,
        queryHash,
        dateRange: args.dateRange,
        queryType: "engagement",
        path: args.path,
        data,
      });

      // Update last sync timestamp
      await ctx.runMutation(internal.ga4.internals.updateLastSync, {
        propertyId,
      });

      return data;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "GA4 API error";

      await ctx.runMutation(internal.ga4.internals.setError, {
        error: message,
      });

      throw new Error(`GA4 fetch failed: ${message}`);
    }
  },
});
