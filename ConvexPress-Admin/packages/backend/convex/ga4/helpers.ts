/**
 * GA4 Integration System - Helpers
 *
 * Pure utility functions for:
 *   - Query hash computation (SHA-256 for cache keys)
 *   - GA4 date range parsing
 *   - GA4 report request building (traffic + engagement)
 *   - GA4 response parsing into app-friendly formats
 *
 * These helpers are used by actions (which call the GA4 Data API)
 * and queries (which compute cache lookup hashes).
 */

// ─── Query Hash ────────────────────────────────────────────────────────────

/**
 * Compute a deterministic hash of GA4 query parameters for cache lookup.
 * Uses a simple string hash (djb2) since we're in a Convex function
 * environment where crypto.subtle may not be available.
 *
 * The hash is computed from a normalized JSON string of:
 *   { queryType, dateRange, path, metrics, dimensions }
 *
 * Sorting metrics and dimensions ensures the same query always produces
 * the same hash regardless of argument order.
 */
export function computeQueryHash(params: {
  queryType: "traffic" | "engagement" | "overview";
  dateRange: string;
  path?: string;
  metrics: string[];
  dimensions: string[];
}): string {
  const normalized = JSON.stringify({
    queryType: params.queryType,
    dateRange: params.dateRange,
    path: params.path ?? null,
    metrics: [...params.metrics].sort(),
    dimensions: [...params.dimensions].sort(),
  });

  // djb2 hash -- fast, deterministic, good distribution for cache keys
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 33) ^ normalized.charCodeAt(i);
  }
  // Convert to unsigned 32-bit hex string
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// ─── Date Range Parsing ────────────────────────────────────────────────────

/**
 * Convert a GA4 date range key to GA4 Data API date strings.
 * GA4 accepts relative strings like "7daysAgo" or ISO dates.
 */
export function parseDateRange(
  dateRange: string,
  startDate?: string,
  endDate?: string,
): { startDate: string; endDate: string } {
  switch (dateRange) {
    case "today":
      return { startDate: "today", endDate: "today" };
    case "yesterday":
      return { startDate: "yesterday", endDate: "yesterday" };
    case "last7days":
      return { startDate: "7daysAgo", endDate: "today" };
    case "last28days":
      return { startDate: "28daysAgo", endDate: "today" };
    case "last90days":
      return { startDate: "90daysAgo", endDate: "today" };
    case "custom":
      if (!startDate || !endDate) {
        throw new Error("Custom date range requires startDate and endDate");
      }
      return { startDate, endDate };
    default:
      return { startDate: "28daysAgo", endDate: "today" };
  }
}

// ─── Traffic Report Constants ──────────────────────────────────────────────

export const TRAFFIC_METRICS = [
  "screenPageViews",
  "sessions",
  "totalUsers",
  "newUsers",
];

export const TRAFFIC_DIMENSIONS_SOURCES = ["sessionDefaultChannelGroup"];
export const TRAFFIC_DIMENSIONS_REFERRERS = ["sessionSource"];
export const TRAFFIC_DIMENSIONS_COUNTRIES = ["country"];
export const TRAFFIC_DIMENSIONS_DEVICES = ["deviceCategory"];
export const TRAFFIC_DIMENSIONS_DAILY = ["date"];

// ─── Engagement Report Constants ───────────────────────────────────────────

export const ENGAGEMENT_METRICS = [
  "bounceRate",
  "averageSessionDuration",
  "screenPageViewsPerSession",
  "engagementRate",
  "eventCount",
];

export const ENGAGEMENT_DIMENSIONS_DAILY = ["date"];

// ─── Response Parsing ──────────────────────────────────────────────────────

/**
 * Parse a GA4 RunReport response into a flat metrics object.
 * GA4 responses have a complex row/header structure; this flattens it.
 */
export function parseGA4RunReportResponse(response: {
  dimensionHeaders?: Array<{ name: string }>;
  metricHeaders?: Array<{ name: string; type?: string }>;
  rows?: Array<{
    dimensionValues?: Array<{ value: string }>;
    metricValues?: Array<{ value: string }>;
  }>;
  totals?: Array<{
    dimensionValues?: Array<{ value: string }>;
    metricValues?: Array<{ value: string }>;
  }>;
  rowCount?: number;
}): {
  rows: Array<Record<string, string | number>>;
  totals: Record<string, number>;
  rowCount: number;
} {
  const dimensionNames =
    response.dimensionHeaders?.map((h) => h.name) ?? [];
  const metricNames =
    response.metricHeaders?.map((h) => h.name) ?? [];

  const rows = (response.rows ?? []).map((row) => {
    const record: Record<string, string | number> = {};
    row.dimensionValues?.forEach((dv, i) => {
      record[dimensionNames[i]] = dv.value;
    });
    row.metricValues?.forEach((mv, i) => {
      record[metricNames[i]] = parseFloat(mv.value) || 0;
    });
    return record;
  });

  const totals: Record<string, number> = {};
  if (response.totals?.[0]) {
    response.totals[0].metricValues?.forEach((mv, i) => {
      totals[metricNames[i]] = parseFloat(mv.value) || 0;
    });
  }

  return {
    rows,
    totals,
    rowCount: response.rowCount ?? rows.length,
  };
}

/**
 * Build a normalized traffic data object from multiple GA4 report responses.
 */
export function buildTrafficData(reports: {
  summary: ReturnType<typeof parseGA4RunReportResponse>;
  sources: ReturnType<typeof parseGA4RunReportResponse>;
  referrers: ReturnType<typeof parseGA4RunReportResponse>;
  countries: ReturnType<typeof parseGA4RunReportResponse>;
  devices: ReturnType<typeof parseGA4RunReportResponse>;
  daily: ReturnType<typeof parseGA4RunReportResponse>;
}): {
  totalPageviews: number;
  totalSessions: number;
  totalUsers: number;
  newUsers: number;
  sources: Array<{ channel: string; sessions: number }>;
  referrers: Array<{ domain: string; sessions: number }>;
  countries: Array<{ country: string; users: number }>;
  devices: Array<{ category: string; sessions: number }>;
  daily: Array<{ date: string; pageviews: number; sessions: number; users: number }>;
} {
  return {
    totalPageviews: reports.summary.totals.screenPageViews ?? 0,
    totalSessions: reports.summary.totals.sessions ?? 0,
    totalUsers: reports.summary.totals.totalUsers ?? 0,
    newUsers: reports.summary.totals.newUsers ?? 0,
    sources: reports.sources.rows.map((r) => ({
      channel: String(r.sessionDefaultChannelGroup ?? "unknown"),
      sessions: Number(r.sessions ?? 0),
    })),
    referrers: reports.referrers.rows
      .map((r) => ({
        domain: String(r.sessionSource ?? "unknown"),
        sessions: Number(r.sessions ?? 0),
      }))
      .slice(0, 20),
    countries: reports.countries.rows
      .map((r) => ({
        country: String(r.country ?? "unknown"),
        users: Number(r.totalUsers ?? 0),
      }))
      .slice(0, 20),
    devices: reports.devices.rows.map((r) => ({
      category: String(r.deviceCategory ?? "unknown"),
      sessions: Number(r.sessions ?? 0),
    })),
    daily: reports.daily.rows.map((r) => ({
      date: String(r.date ?? ""),
      pageviews: Number(r.screenPageViews ?? 0),
      sessions: Number(r.sessions ?? 0),
      users: Number(r.totalUsers ?? 0),
    })),
  };
}

/**
 * Build a normalized engagement data object from GA4 report response.
 */
export function buildEngagementData(report: ReturnType<typeof parseGA4RunReportResponse>): {
  bounceRate: number;
  avgSessionDuration: number;
  pagesPerSession: number;
  engagementRate: number;
  totalEvents: number;
  daily: Array<{
    date: string;
    bounceRate: number;
    avgSessionDuration: number;
    pagesPerSession: number;
    engagementRate: number;
    eventCount: number;
  }>;
} {
  return {
    bounceRate: report.totals.bounceRate ?? 0,
    avgSessionDuration: report.totals.averageSessionDuration ?? 0,
    pagesPerSession: report.totals.screenPageViewsPerSession ?? 0,
    engagementRate: report.totals.engagementRate ?? 0,
    totalEvents: report.totals.eventCount ?? 0,
    daily: report.rows.map((r) => ({
      date: String(r.date ?? ""),
      bounceRate: Number(r.bounceRate ?? 0),
      avgSessionDuration: Number(r.averageSessionDuration ?? 0),
      pagesPerSession: Number(r.screenPageViewsPerSession ?? 0),
      engagementRate: Number(r.engagementRate ?? 0),
      eventCount: Number(r.eventCount ?? 0),
    })),
  };
}
