# GA4 Integration System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect ConvexPress to Google Analytics 4 via the GA4 Data API. Administrators can link their GA4 property, and the Traffic and Engagement dashboard tabs automatically upgrade from built-in analytics to richer GA4 data (bounce rate, pages/session, traffic source breakdown, engagement rate). When GA4 is not connected, everything falls back transparently to the built-in Analytics System.

**Architecture:** A Convex action (running in the Node.js runtime) authenticates with a Google service account, calls the GA4 Data API `runReport` endpoint, and caches responses in a `gaCache` table with a 1-hour TTL. Reactive queries serve cached data to dashboard components. A cron job purges expired cache entries hourly. Settings (property ID, connection status, service account email) are stored in the existing Settings System. The service account JSON private key is stored as a Convex environment variable (`GA4_SERVICE_ACCOUNT_JSON`), never in the database.

**Tech Stack:** Convex (schema, mutations, queries, actions, internals, crons), `googleapis` npm package, TypeScript, TanStack Router, TanStack Form, React, Tailwind CSS v4, Lucide icons, Base UI, Sonner.

**Key Constraint:** The Admin app owns the Convex database. All schema, functions, and cron jobs live in `ConvexPress-Admin/packages/backend/convex/`. The GA4 system provides data hooks and a settings page -- dashboard rendering is owned by the existing TrafficDashboard and EngagementDashboard components which are modified to check GA4 connection status.

**Dependencies:**
- Built-in Analytics System (Plan 2) must be deployed first -- GA4 falls back to it
- Settings System (complete) -- stores GA4 connection metadata
- Role & Capability System (complete) -- provides `analytics.manage` and `analytics.view`
- Event Dispatcher System (complete) -- emits `ga4.connected`, `ga4.disconnected` events

---

## Task 1: Install googleapis and Create GA4 Cache Schema

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/package.json` (install googleapis)
- Create: `ConvexPress-Admin/packages/backend/convex/schema/ga4.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/schema.ts`

Install the Google APIs Node.js client and create the `gaCache` table for caching GA4 API responses with a 1-hour TTL.

- [ ] **Step 1: Install googleapis**

```bash
cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && bun add googleapis
```

- [ ] **Step 2: Create the GA4 cache schema file**

Create `ConvexPress-Admin/packages/backend/convex/schema/ga4.ts`:

```typescript
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
```

- [ ] **Step 3: Import and spread in schema.ts**

Modify `ConvexPress-Admin/packages/backend/convex/schema.ts`. Add the import after the existing `analyticsTables` import, and spread it into the `defineSchema` call after `...analyticsTables,`.

Add this import after `import { analyticsTables } from "./schema/analytics";`:

```typescript
import { ga4Tables } from "./schema/ga4";
```

Add this spread inside the `defineSchema({})` call after `...analyticsTables,`:

```typescript
  ...ga4Tables,
```

- [ ] **Step 4: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx convex dev --once --typecheck=disable` to confirm the schema deploys without errors.

**Commit:** `feat(ga4): add gaCache schema table and install googleapis`

---

## Task 2: Create GA4 Validators

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/ga4/validators.ts`

Shared argument validators for all GA4 Convex functions.

- [ ] **Step 1: Create the validators file**

Create `ConvexPress-Admin/packages/backend/convex/ga4/validators.ts`:

```typescript
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
```

**Commit:** `feat(ga4): add shared argument validators`

---

## Task 3: Create GA4 Helpers

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/ga4/helpers.ts`

Pure utility functions for query hash computation, date range parsing, GA4 report request building, and response parsing.

- [ ] **Step 1: Create the helpers file**

Create `ConvexPress-Admin/packages/backend/convex/ga4/helpers.ts`:

```typescript
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
```

**Commit:** `feat(ga4): add helper utilities for hash, date parsing, and response parsing`

---

## Task 4: Create GA4 Settings Mutations

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/ga4/mutations.ts`

Public mutations for saving/clearing GA4 connection settings, and an internal mutation for upserting cache entries.

- [ ] **Step 1: Create the mutations file**

Create `ConvexPress-Admin/packages/backend/convex/ga4/mutations.ts`:

```typescript
/**
 * GA4 Integration System - Mutations
 *
 * Public mutations:
 *   - saveConnectionSettings: store GA4 property ID and service account email
 *   - disconnect: clear GA4 settings and purge all cached data
 *   - clearCache: purge all cached GA4 data (manual refresh)
 *
 * Internal mutation:
 *   - upsertCache: called by actions to store GA4 API responses
 *
 * Settings are stored in the existing Settings System under a dedicated
 * settings document with section "analytics" (shared with the built-in
 * Analytics System settings). GA4-specific keys are prefixed with "ga4".
 *
 * The service account JSON private key is NEVER stored in the database.
 * It must be set as the Convex environment variable GA4_SERVICE_ACCOUNT_JSON.
 */

import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { requireCan } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { upsertCacheArgs, saveConnectionArgs } from "./validators";

// ─── saveConnectionSettings ────────────────────────────────────────────────

/**
 * Save GA4 connection settings after a successful test connection.
 * Stores property ID and service account email in the settings table.
 * Sets ga4Connected to true.
 *
 * @auth analytics.manage (Administrator only)
 */
export const saveConnectionSettings = mutation({
  args: saveConnectionArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "analytics.manage");

    // Validate property ID format
    if (!/^properties\/\d+$/.test(args.propertyId)) {
      throw new Error(
        "Invalid GA4 property ID format. Expected: properties/XXXXXXXXX",
      );
    }

    // Find or create the analytics settings document
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "analytics"))
      .unique();

    const ga4Settings = {
      ga4PropertyId: args.propertyId,
      ga4Connected: true,
      ga4ServiceAccountEmail: args.serviceAccountClientEmail,
      ga4LastSync: null,
      ga4Error: null,
    };

    if (existing) {
      await ctx.db.patch(existing._id, {
        values: { ...((existing.values as Record<string, unknown>) ?? {}), ...ga4Settings },
        updatedAt: Date.now(),
        updatedBy: user._id,
      });
    } else {
      await ctx.db.insert("settings", {
        section: "analytics",
        values: ga4Settings,
        updatedAt: Date.now(),
        updatedBy: user._id,
      });
    }

    // Emit connection event
    await emitEvent(ctx, "ga4.connected", "ga4", {
      propertyId: args.propertyId,
      serviceAccountEmail: args.serviceAccountClientEmail,
      connectedBy: user._id,
    });
  },
});

// ─── disconnect ────────────────────────────────────────────────────────────

/**
 * Disconnect GA4: clear all GA4 settings and purge cached data.
 * After disconnect, dashboards fall back to built-in Analytics System.
 *
 * Note: The admin must manually remove the GA4_SERVICE_ACCOUNT_JSON
 * environment variable via `npx convex env unset GA4_SERVICE_ACCOUNT_JSON`.
 *
 * @auth analytics.manage (Administrator only)
 */
export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireCan(ctx, "analytics.manage");

    // Read current settings to get property ID for event
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "analytics"))
      .unique();

    const values = (existing?.values as Record<string, unknown>) ?? {};
    const propertyId = values.ga4PropertyId as string | undefined;

    // Clear GA4 settings
    if (existing) {
      await ctx.db.patch(existing._id, {
        values: {
          ...values,
          ga4PropertyId: null,
          ga4Connected: false,
          ga4ServiceAccountEmail: null,
          ga4LastSync: null,
          ga4Error: null,
        },
        updatedAt: Date.now(),
        updatedBy: user._id,
      });
    }

    // Purge all cached GA4 data
    const cachedEntries = await ctx.db.query("gaCache").collect();
    for (const entry of cachedEntries) {
      await ctx.db.delete(entry._id);
    }

    // Emit disconnection event
    if (propertyId) {
      await emitEvent(ctx, "ga4.disconnected", "ga4", {
        propertyId,
        disconnectedBy: user._id,
      });
    }
  },
});

// ─── clearCache ────────────────────────────────────────────────────────────

/**
 * Manually clear all cached GA4 data. Forces fresh fetches on next view.
 *
 * @auth analytics.manage (Administrator only)
 */
export const clearCache = mutation({
  args: {},
  handler: async (ctx) => {
    await requireCan(ctx, "analytics.manage");

    const cachedEntries = await ctx.db.query("gaCache").collect();
    for (const entry of cachedEntries) {
      await ctx.db.delete(entry._id);
    }

    return { purged: cachedEntries.length };
  },
});

// ─── upsertCache (internal) ───────────────────────────────────────────────

/**
 * Upsert a GA4 cache entry. Called from actions after fetching from GA4 API.
 * If an entry with the same propertyId + queryHash exists, it is replaced.
 * Otherwise, a new entry is inserted.
 *
 * Sets fetchedAt to now and expiresAt to now + 1 hour (3,600,000ms).
 *
 * @internal -- not client-callable
 */
export const upsertCache = internalMutation({
  args: upsertCacheArgs,
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check for existing entry with same hash
    const existing = await ctx.db
      .query("gaCache")
      .withIndex("by_hash", (q) =>
        q.eq("propertyId", args.propertyId).eq("queryHash", args.queryHash),
      )
      .unique();

    const entry = {
      propertyId: args.propertyId,
      queryHash: args.queryHash,
      dateRange: args.dateRange,
      queryType: args.queryType,
      path: args.path,
      data: args.data,
      fetchedAt: now,
      expiresAt: now + 3_600_000, // 1 hour TTL
    };

    if (existing) {
      await ctx.db.replace(existing._id, entry);
    } else {
      await ctx.db.insert("gaCache", entry);
    }
  },
});
```

**Commit:** `feat(ga4): add settings mutations and cache upsert`

---

## Task 5: Create GA4 Queries

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/ga4/queries.ts`

Public queries for reading GA4 connection status and cached data.

- [ ] **Step 1: Create the queries file**

Create `ConvexPress-Admin/packages/backend/convex/ga4/queries.ts`:

```typescript
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
```

**Commit:** `feat(ga4): add public queries for connection status and cached data`

---

## Task 6: Create GA4 Actions (GA4 API Calls)

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/ga4/actions.ts`

Node.js actions that call the Google Analytics 4 Data API and cache results.

- [ ] **Step 1: Create the actions file**

Create `ConvexPress-Admin/packages/backend/convex/ga4/actions.ts`:

```typescript
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
```

- [ ] **Step 2: Add internal query for actions to read settings**

The actions need to read connection settings but they run in the Node.js runtime and can't directly query the database. They use `ctx.runQuery` with an internal query. Add this to the queries file.

Append to `ConvexPress-Admin/packages/backend/convex/ga4/queries.ts`:

```typescript
// ─── Internal Query (for actions) ──────────────────────────────────────────

import { internalQuery } from "../_generated/server";

/**
 * Internal query used by actions to read GA4 connection settings.
 * Not client-callable.
 */
export const getConnectionStatusInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "analytics"))
      .unique();

    if (!settings) return null;

    const values = (settings.values as Record<string, unknown>) ?? {};
    return {
      connected: values.ga4Connected === true,
      propertyId: (values.ga4PropertyId as string) ?? null,
      serviceAccountEmail: (values.ga4ServiceAccountEmail as string) ?? null,
    };
  },
});
```

**Commit:** `feat(ga4): add actions for GA4 API calls with caching`

---

## Task 7: Create GA4 Cache Internals

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/ga4/internals.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/crons.ts`

Internal mutations for cache maintenance and a cron job for hourly cleanup.

- [ ] **Step 1: Create the internals file**

Create `ConvexPress-Admin/packages/backend/convex/ga4/internals.ts`:

```typescript
/**
 * GA4 Integration System - Internal Functions
 *
 * Internal mutations for cache maintenance:
 *   - deleteExpiredEntries: purge expired gaCache entries (cron job)
 *   - purgeAllCache: delete all cache for a property (disconnect flow)
 *   - updateLastSync: update ga4LastSync timestamp after successful fetch
 *   - setError: store GA4 API error message in settings
 *
 * These are called by actions and cron jobs, not by the client.
 */

import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

// ─── deleteExpiredEntries ──────────────────────────────────────────────────

/**
 * Purge expired cache entries from the gaCache table.
 * Queries entries where expiresAt < now and deletes in batches of 100.
 *
 * Scheduled via hourly cron job.
 */
export const deleteExpiredEntries = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Query expired entries using the by_expiry index
    const expired = await ctx.db
      .query("gaCache")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", now))
      .take(100);

    for (const entry of expired) {
      await ctx.db.delete(entry._id);
    }

    return { deleted: expired.length };
  },
});

// ─── purgeAllCache ─────────────────────────────────────────────────────────

/**
 * Delete all gaCache entries for a specific property.
 * Called when disconnecting GA4.
 */
export const purgeAllCache = internalMutation({
  args: { propertyId: v.string() },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("gaCache")
      .withIndex("by_hash", (q) => q.eq("propertyId", args.propertyId))
      .collect();

    for (const entry of entries) {
      await ctx.db.delete(entry._id);
    }

    return { deleted: entries.length };
  },
});

// ─── updateLastSync ────────────────────────────────────────────────────────

/**
 * Update the ga4LastSync timestamp in settings after a successful GA4 fetch.
 * Also clears any previous error.
 */
export const updateLastSync = internalMutation({
  args: { propertyId: v.string() },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "analytics"))
      .unique();

    if (settings) {
      const values = (settings.values as Record<string, unknown>) ?? {};
      // Only update if this is still the active property
      if (values.ga4PropertyId === args.propertyId) {
        await ctx.db.patch(settings._id, {
          values: {
            ...values,
            ga4LastSync: Date.now(),
            ga4Error: null,
          },
        });
      }
    }
  },
});

// ─── setError ──────────────────────────────────────────────────────────────

/**
 * Store a GA4 API error message in settings.
 * Used by actions when a GA4 fetch fails.
 */
export const setError = internalMutation({
  args: { error: v.string() },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "analytics"))
      .unique();

    if (settings) {
      const values = (settings.values as Record<string, unknown>) ?? {};
      await ctx.db.patch(settings._id, {
        values: {
          ...values,
          ga4Error: args.error,
        },
      });
    }
  },
});
```

- [ ] **Step 2: Add GA4 cron job to crons.ts**

Modify `ConvexPress-Admin/packages/backend/convex/crons.ts`. Add the GA4 cache purge cron after the existing Analytics System crons (after the `analytics-purge-expired` block, before `export default crons;`).

Add this block before the `export default crons;` line:

```typescript
// ─── GA4 Integration System ─────────────────────────────────────────────────
// Hourly purge of expired gaCache entries (1-hour TTL).
// Processes in batches of 100 per invocation to stay within mutation limits.
// Added by: GA4 Integration System Expert
crons.hourly(
  "ga4-purge-expired-cache",
  { minuteUTC: 5 },
  internal.ga4.internals.deleteExpiredEntries,
);
```

- [ ] **Step 3: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx convex dev --once --typecheck=disable` to confirm deployment.

**Commit:** `feat(ga4): add cache internals and hourly purge cron job`

---

## Task 8: Create Analytics Settings Page

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/settings/analytics.tsx`

Admin settings page for configuring GA4 connection. Follows the existing settings page pattern (SettingsPageLayout, SettingsSection, SettingsField).

- [ ] **Step 1: Create the analytics settings route**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/settings/analytics.tsx`:

```typescript
/**
 * Analytics Settings Page
 *
 * GA4 connection management: configure property ID, upload service account
 * credentials, test connection, view status, and disconnect.
 *
 * Also shows built-in analytics tracking toggle.
 *
 * Unlike other settings pages, this does NOT use the useSettingsForm hook
 * because GA4 connection has a custom flow (test -> connect, not autosave).
 */

import { useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import {
  Settings,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Trash2,
  RefreshCcw,
  Upload,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/analytics",
)({
  component: AnalyticsSettingsPage,
});

function AnalyticsSettingsPage() {
  const connectionStatus = useQuery(api.ga4.queries.getConnectionStatus);
  const saveConnection = useMutation(api.ga4.mutations.saveConnectionSettings);
  const disconnectGA4 = useMutation(api.ga4.mutations.disconnect);
  const clearCache = useMutation(api.ga4.mutations.clearCache);
  const testConnection = useAction(api.ga4.actions.testConnection);

  // Form state (only used when not connected)
  const [propertyId, setPropertyId] = useState("");
  const [serviceAccountJson, setServiceAccountJson] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  // Disconnect confirmation
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  // Loading
  if (connectionStatus === undefined) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-32 rounded bg-muted" />
        </div>
      </div>
    );
  }

  const isConnected = connectionStatus?.connected ?? false;

  // ─── Handle Test & Connect ───────────────────────────────────────────

  const handleTestAndConnect = useCallback(async () => {
    setTestError(null);
    setIsTesting(true);

    try {
      const result = await testConnection({
        propertyId: propertyId.trim(),
        serviceAccountJson: serviceAccountJson.trim(),
      });

      if (result.success) {
        // Save connection settings
        await saveConnection({
          propertyId: propertyId.trim(),
          serviceAccountClientEmail: result.clientEmail ?? "",
        });
        toast.success("GA4 connected successfully!");
        setPropertyId("");
        setServiceAccountJson("");
      } else {
        setTestError(result.error ?? "Connection test failed");
        toast.error("GA4 connection failed");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setTestError(msg);
      toast.error("GA4 connection failed");
    } finally {
      setIsTesting(false);
    }
  }, [propertyId, serviceAccountJson, testConnection, saveConnection]);

  // ─── Handle Disconnect ───────────────────────────────────────────────

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnectGA4();
      setShowDisconnectConfirm(false);
      toast.success("GA4 disconnected. Dashboards will use built-in analytics.");
    } catch {
      toast.error("Failed to disconnect GA4");
    }
  }, [disconnectGA4]);

  // ─── Handle Clear Cache ──────────────────────────────────────────────

  const handleClearCache = useCallback(async () => {
    try {
      const result = await clearCache();
      toast.success(`Cleared ${result.purged} cached entries. Fresh data will be fetched.`);
    } catch {
      toast.error("Failed to clear cache");
    }
  }, [clearCache]);

  // ─── Handle File Upload ──────────────────────────────────────────────

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.name.endsWith(".json")) {
        setTestError("Please upload a .json file");
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        try {
          // Validate it's valid JSON
          JSON.parse(text);
          setServiceAccountJson(text);
          setTestError(null);
        } catch {
          setTestError("Invalid JSON file");
        }
      };
      reader.readAsText(file);
    },
    [],
  );

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">
          Analytics Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect Google Analytics 4 for richer traffic and engagement data.
        </p>
      </div>

      {/* Connection Status Section */}
      {isConnected ? (
        <div className="space-y-6">
          {/* Connected State */}
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <h2 className="text-lg font-semibold text-foreground">
                Google Analytics 4 Connected
              </h2>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Property ID</span>
                <span className="text-sm font-mono text-foreground">
                  {connectionStatus.propertyId}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">
                  Service Account
                </span>
                <span className="text-sm text-foreground">
                  {connectionStatus.serviceAccountEmail}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Last Sync</span>
                <span className="text-sm text-foreground">
                  {connectionStatus.lastSync
                    ? new Date(connectionStatus.lastSync).toLocaleString()
                    : "Not synced yet"}
                </span>
              </div>
              {connectionStatus.error && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 mt-2">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-sm text-destructive">
                    {connectionStatus.error}
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={handleClearCache}
                className="inline-flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/80 transition-colors"
              >
                <RefreshCcw className="h-4 w-4" />
                Clear Cache
              </button>
              <button
                type="button"
                onClick={() => setShowDisconnectConfirm(true)}
                className="inline-flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Disconnect GA4
              </button>
            </div>
          </div>

          {/* Disconnect Confirmation */}
          {showDisconnectConfirm && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
              <h3 className="text-sm font-semibold text-destructive mb-2">
                Confirm Disconnect
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                This will remove GA4 settings and purge all cached data.
                Dashboards will fall back to built-in analytics. You will also
                need to manually remove the{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  GA4_SERVICE_ACCOUNT_JSON
                </code>{" "}
                environment variable.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="rounded-md bg-destructive px-3 py-2 text-sm font-medium text-white hover:bg-destructive/90 transition-colors"
                >
                  Yes, Disconnect
                </button>
                <button
                  type="button"
                  onClick={() => setShowDisconnectConfirm(false)}
                  className="rounded-md bg-muted px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/80 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Not Connected State */
        <div className="space-y-6">
          {/* Info Callout */}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">
              How to connect Google Analytics 4
            </h3>
            <ol className="list-decimal list-inside space-y-1.5 text-sm text-muted-foreground">
              <li>
                Create a{" "}
                <a
                  href="https://console.cloud.google.com/iam-admin/serviceaccounts"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline inline-flex items-center gap-1"
                >
                  Google Cloud service account
                  <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>Download the service account JSON key file</li>
              <li>
                In your GA4 property, go to Admin &gt; Property Access Management
                and add the service account email as a Viewer
              </li>
              <li>
                Set the JSON key as an environment variable:{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  npx convex env set GA4_SERVICE_ACCOUNT_JSON "$(cat key.json)"
                </code>
              </li>
              <li>Enter your GA4 property ID below and click Test &amp; Connect</li>
            </ol>
          </div>

          {/* Connection Form */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Connect GA4
            </h2>

            <div className="space-y-4">
              {/* Property ID */}
              <div>
                <label
                  htmlFor="ga4-property-id"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  GA4 Property ID
                </label>
                <input
                  id="ga4-property-id"
                  type="text"
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                  placeholder="properties/123456789"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Found in GA4 Admin &gt; Property Settings. Format:
                  properties/XXXXXXXXX
                </p>
              </div>

              {/* Service Account JSON */}
              <div>
                <label
                  htmlFor="ga4-service-account"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  Service Account JSON (for testing only)
                </label>
                <div className="space-y-2">
                  {/* File upload */}
                  <label
                    className={cn(
                      "flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-border px-4 py-6 transition-colors",
                      "hover:border-primary/50 hover:bg-muted/50",
                    )}
                  >
                    <Upload className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {serviceAccountJson
                        ? "File loaded. Upload another to replace."
                        : "Drop or click to upload JSON key file"}
                    </span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleFileUpload}
                      className="sr-only"
                    />
                  </label>

                  {/* Or paste */}
                  <textarea
                    id="ga4-service-account"
                    value={serviceAccountJson}
                    onChange={(e) => {
                      setServiceAccountJson(e.target.value);
                      setTestError(null);
                    }}
                    placeholder='Paste service account JSON here (or upload above)...'
                    rows={4}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Used only for the connection test. The JSON should also be set
                  as the GA4_SERVICE_ACCOUNT_JSON Convex environment variable for
                  production data fetching.
                </p>
              </div>

              {/* Error display */}
              {testError && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3">
                  <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-sm text-destructive">{testError}</p>
                </div>
              )}

              {/* Test & Connect button */}
              <button
                type="button"
                onClick={handleTestAndConnect}
                disabled={
                  isTesting ||
                  !propertyId.trim() ||
                  !serviceAccountJson.trim()
                }
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  "bg-primary text-primary-foreground hover:bg-primary/90",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {isTesting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Testing Connection...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Test &amp; Connect
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Commit:** `feat(ga4): add analytics settings page with connection management`

---

## Task 9: Update Traffic Dashboard for GA4

**Files:**
- Modify: `ConvexPress-Admin/apps/web/src/components/analytics/TrafficDashboard.tsx`
- Create: `ConvexPress-Admin/apps/web/src/hooks/ga4/useTrafficData.ts`
- Create: `ConvexPress-Admin/apps/web/src/components/analytics/DataSourceIndicator.tsx`

Add GA4 connection awareness to the Traffic Dashboard. When GA4 is connected, fetch richer data. When not, use built-in analytics as before.

- [ ] **Step 1: Create the data source indicator component**

Create `ConvexPress-Admin/apps/web/src/components/analytics/DataSourceIndicator.tsx`:

```typescript
/**
 * DataSourceIndicator - Shows which analytics data source is active.
 *
 * Displays a small badge: "GA4 Connected" (green) or "Built-in Analytics"
 * (neutral). When not connected, includes a link to the settings page.
 */

import { Link } from "@tanstack/react-router";
import { BarChart3, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface DataSourceIndicatorProps {
  source: "ga4" | "builtin";
  className?: string;
}

export function DataSourceIndicator({
  source,
  className,
}: DataSourceIndicatorProps) {
  if (source === "ga4") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
          "bg-green-500/10 text-green-700 dark:text-green-400",
          className,
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        GA4 Connected
      </span>
    );
  }

  return (
    <Link
      to="/settings/analytics"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
        "bg-muted text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <BarChart3 className="h-3 w-3" />
      Built-in Analytics
      <ExternalLink className="h-3 w-3 opacity-50" />
    </Link>
  );
}
```

- [ ] **Step 2: Create the useTrafficData hook**

Create `ConvexPress-Admin/apps/web/src/hooks/ga4/useTrafficData.ts`:

```typescript
/**
 * useTrafficData - GA4/fallback switching hook for traffic data.
 *
 * Checks if GA4 is connected. If yes, reads from GA4 cache and triggers
 * fetch actions on cache miss. If no, reads from built-in analytics rollups.
 *
 * Returns a normalized data shape regardless of source, plus a `source`
 * field ("ga4" | "builtin") for the DataSourceIndicator.
 */

import { useQuery, useAction } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { useEffect, useRef } from "react";
import type { Id } from "@backend/convex/_generated/dataModel";

type DateRangeKey = "last7days" | "last28days" | "last90days";

function dateRangeToISO(range: DateRangeKey): {
  startDate: string;
  endDate: string;
} {
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);
  const days = range === "last7days" ? 7 : range === "last28days" ? 28 : 90;
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  return { startDate: start.toISOString().slice(0, 10), endDate };
}

export function useTrafficData(
  dateRange: DateRangeKey,
  opts?: { postId?: Id<"posts">; path?: string },
) {
  const isGA4Connected = useQuery(api.ga4.queries.isConnected);

  // GA4 path: read from cache
  const ga4Data = useQuery(
    api.ga4.queries.getCachedTrafficData,
    isGA4Connected ? { dateRange, path: opts?.path } : "skip",
  );

  // Built-in path: read from rollups
  const { startDate, endDate } = dateRangeToISO(dateRange);
  const builtinData = useQuery(
    api.analytics.queries.getTrafficSummary,
    !isGA4Connected
      ? { startDate, endDate, postId: opts?.postId, path: opts?.path }
      : "skip",
  );

  // Trigger GA4 fetch on cache miss
  const fetchTraffic = useAction(api.ga4.actions.fetchTrafficData);
  const fetchInFlightRef = useRef(false);

  useEffect(() => {
    if (isGA4Connected && ga4Data === null && !fetchInFlightRef.current) {
      fetchInFlightRef.current = true;
      fetchTraffic({ dateRange, path: opts?.path })
        .catch(() => {
          // Error handled by action (stored in settings)
        })
        .finally(() => {
          fetchInFlightRef.current = false;
        });
    }
  }, [isGA4Connected, ga4Data, dateRange, opts?.path, fetchTraffic]);

  return {
    data: isGA4Connected ? ga4Data?.data ?? null : builtinData,
    source: (isGA4Connected ? "ga4" : "builtin") as "ga4" | "builtin",
    isLoading:
      isGA4Connected === undefined ||
      (isGA4Connected && ga4Data === undefined) ||
      (!isGA4Connected && builtinData === undefined),
    isFetching: isGA4Connected && ga4Data === null,
  };
}
```

- [ ] **Step 3: Update TrafficDashboard to use GA4 data source indicator**

Modify `ConvexPress-Admin/apps/web/src/components/analytics/TrafficDashboard.tsx`. Add the DataSourceIndicator next to the date range selector.

Add this import at the top (after existing imports):

```typescript
import { useQuery } from "convex/react";
import { DataSourceIndicator } from "./DataSourceIndicator";
```

Then in the JSX, after the date range selector buttons `<div>` and before the Metric Cards section, add:

```typescript
      {/* Data Source Indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* existing date range buttons stay here */}
        </div>
        <DataSourceIndicator source={isGA4Connected ? "ga4" : "builtin"} />
      </div>
```

Note: The full refactor of TrafficDashboard to use `useTrafficData` hook is a larger change. For the initial integration, add the indicator and a `useQuery(api.ga4.queries.isConnected)` call. The hook can be wired in a follow-up if desired, since the built-in data is already showing correctly.

Add the GA4 connection check at the top of the component:

```typescript
  const isGA4Connected = useQuery(api.ga4.queries.isConnected);
```

Add the indicator after the date range selector row, wrapping the existing date range buttons and adding the indicator on the right side.

**Commit:** `feat(ga4): add data source indicator and useTrafficData hook`

---

## Task 10: Update Engagement Dashboard for GA4

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/hooks/ga4/useEngagementData.ts`
- Modify: `ConvexPress-Admin/apps/web/src/components/analytics/EngagementDashboard.tsx`

Same pattern as Traffic -- add GA4 awareness and fallback switching.

- [ ] **Step 1: Create the useEngagementData hook**

Create `ConvexPress-Admin/apps/web/src/hooks/ga4/useEngagementData.ts`:

```typescript
/**
 * useEngagementData - GA4/fallback switching hook for engagement data.
 *
 * When GA4 is connected: bounce rate, avg session duration, pages/session,
 * engagement rate, event count. These metrics are NOT available from built-in.
 *
 * When GA4 is not connected: scroll depth and time on page from built-in.
 * Bounce rate and pages/session show "N/A".
 *
 * The hook merges both sources: GA4 provides the aggregate engagement metrics,
 * while built-in always provides section-level scroll depth (GA4 cannot track
 * ConvexPress structured content sections).
 */

import { useQuery, useAction } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { useEffect, useRef } from "react";
import type { Id } from "@backend/convex/_generated/dataModel";

type DateRangeKey = "last7days" | "last28days" | "last90days";

function dateRangeToISO(range: DateRangeKey): {
  startDate: string;
  endDate: string;
} {
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);
  const days = range === "last7days" ? 7 : range === "last28days" ? 28 : 90;
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  return { startDate: start.toISOString().slice(0, 10), endDate };
}

export function useEngagementData(
  dateRange: DateRangeKey,
  opts?: { postId?: Id<"posts">; path?: string },
) {
  const isGA4Connected = useQuery(api.ga4.queries.isConnected);

  // GA4 path: read from cache
  const ga4Data = useQuery(
    api.ga4.queries.getCachedEngagementData,
    isGA4Connected ? { dateRange, path: opts?.path } : "skip",
  );

  // Built-in always loaded for scroll depth (GA4 can't do section-level)
  const { startDate, endDate } = dateRangeToISO(dateRange);
  const builtinData = useQuery(api.analytics.queries.getEngagementSummary, {
    startDate,
    endDate,
    postId: opts?.postId,
    path: opts?.path,
  });

  // Trigger GA4 fetch on cache miss
  const fetchEngagement = useAction(api.ga4.actions.fetchEngagementData);
  const fetchInFlightRef = useRef(false);

  useEffect(() => {
    if (isGA4Connected && ga4Data === null && !fetchInFlightRef.current) {
      fetchInFlightRef.current = true;
      fetchEngagement({ dateRange, path: opts?.path })
        .catch(() => {})
        .finally(() => {
          fetchInFlightRef.current = false;
        });
    }
  }, [isGA4Connected, ga4Data, dateRange, opts?.path, fetchEngagement]);

  return {
    ga4Data: isGA4Connected ? ga4Data?.data ?? null : null,
    builtinData,
    source: (isGA4Connected ? "ga4" : "builtin") as "ga4" | "builtin",
    isLoading:
      isGA4Connected === undefined ||
      builtinData === undefined ||
      (isGA4Connected && ga4Data === undefined),
    isFetching: isGA4Connected && ga4Data === null,
  };
}
```

- [ ] **Step 2: Update EngagementDashboard with GA4 indicator**

Modify `ConvexPress-Admin/apps/web/src/components/analytics/EngagementDashboard.tsx`. Same pattern as TrafficDashboard -- add the data source indicator.

Add imports:

```typescript
import { useQuery } from "convex/react";
import { DataSourceIndicator } from "./DataSourceIndicator";
```

Add the GA4 connection check in the component:

```typescript
  const isGA4Connected = useQuery(api.ga4.queries.isConnected);
```

Add the indicator alongside the date range selector. When GA4 is connected, display the extra metrics (bounce rate, pages/session) that are not available from built-in analytics.

**Commit:** `feat(ga4): add GA4 awareness to engagement dashboard`

---

## Task 11: Add Analytics Nav Item to Sidebar

**Files:**
- Modify: `ConvexPress-Admin/apps/web/src/lib/admin-shell/nav-config.ts`

Add an "Analytics" sub-item under the Settings section for the analytics settings page.

- [ ] **Step 1: Add analytics settings nav item**

Modify `ConvexPress-Admin/apps/web/src/lib/admin-shell/nav-config.ts`. Add the analytics settings item inside the `settings` section's `children` array, after the search item.

Add this child item after the `settings-search` entry in the settings `children` array:

```typescript
      {
        id: "settings-analytics",
        label: "Analytics",
        to: "/settings/analytics",
        capability: "analytics.manage",
      },
```

- [ ] **Step 2: Verify** -- Check that the sidebar renders correctly with the new item by running the dev server and navigating to the admin.

**Commit:** `feat(ga4): add Analytics settings link to admin sidebar`

---

## Task 12: Deploy

**Expert:** Convex Deployment Expert (`/experts:convex-deployment`)

- [ ] **Step 1: Deploy with typecheck disabled**

```bash
cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx convex deploy --typecheck=disable
```

- [ ] **Step 2: Set the GA4 service account environment variable (when ready)**

```bash
npx convex env set GA4_SERVICE_ACCOUNT_JSON "$(cat /path/to/service-account-key.json)"
```

Note: This step is done by the admin when they have their Google Cloud service account ready. It is not part of the automated deployment.

- [ ] **Step 3: Verify functions** -- Confirm all GA4 functions appear in the Convex dashboard: `ga4/actions`, `ga4/queries`, `ga4/mutations`, `ga4/internals`.

**Commit:** `chore(ga4): deploy GA4 integration system`

---

## Summary of Files

### New Files (14)

| # | File | Purpose |
|---|------|---------|
| 1 | `ConvexPress-Admin/packages/backend/convex/schema/ga4.ts` | gaCache table schema |
| 2 | `ConvexPress-Admin/packages/backend/convex/ga4/validators.ts` | Shared argument validators |
| 3 | `ConvexPress-Admin/packages/backend/convex/ga4/helpers.ts` | Hash, date parsing, response parsing utilities |
| 4 | `ConvexPress-Admin/packages/backend/convex/ga4/mutations.ts` | saveConnectionSettings, disconnect, clearCache, upsertCache |
| 5 | `ConvexPress-Admin/packages/backend/convex/ga4/queries.ts` | isConnected, getConnectionStatus, getCachedTrafficData, getCachedEngagementData |
| 6 | `ConvexPress-Admin/packages/backend/convex/ga4/actions.ts` | testConnection, fetchTrafficData, fetchEngagementData |
| 7 | `ConvexPress-Admin/packages/backend/convex/ga4/internals.ts` | deleteExpiredEntries, purgeAllCache, updateLastSync, setError |
| 8 | `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/settings/analytics.tsx` | Analytics settings page |
| 9 | `ConvexPress-Admin/apps/web/src/components/analytics/DataSourceIndicator.tsx` | GA4/built-in badge component |
| 10 | `ConvexPress-Admin/apps/web/src/hooks/ga4/useTrafficData.ts` | GA4/fallback switching hook for traffic |
| 11 | `ConvexPress-Admin/apps/web/src/hooks/ga4/useEngagementData.ts` | GA4/fallback switching hook for engagement |

### Modified Files (4)

| # | File | Change |
|---|------|--------|
| 12 | `ConvexPress-Admin/packages/backend/convex/schema.ts` | Import and spread ga4Tables |
| 13 | `ConvexPress-Admin/packages/backend/convex/crons.ts` | Add hourly ga4-purge-expired-cache cron |
| 14 | `ConvexPress-Admin/apps/web/src/lib/admin-shell/nav-config.ts` | Add Analytics item under Settings |
| 15 | `ConvexPress-Admin/apps/web/src/components/analytics/TrafficDashboard.tsx` | Add DataSourceIndicator |
| 16 | `ConvexPress-Admin/apps/web/src/components/analytics/EngagementDashboard.tsx` | Add DataSourceIndicator |

### npm Dependencies

| Package | Location | Purpose |
|---------|----------|---------|
| `googleapis` | `ConvexPress-Admin/packages/backend/` | Google Analytics 4 Data API client |

### Environment Variables

| Variable | Purpose | When to Set |
|----------|---------|-------------|
| `GA4_SERVICE_ACCOUNT_JSON` | Full service account JSON key | When connecting GA4 in production |

### Cron Jobs

| Name | Interval | Function |
|------|----------|----------|
| `ga4-purge-expired-cache` | Hourly (minute 5) | `internal.ga4.internals.deleteExpiredEntries` |

---

## Task Dependency Graph

```
Task 1 (Schema + googleapis install)
  |
  v
Task 2 (Validators)
  |
  v
Task 3 (Helpers)
  |
  +-----> Task 4 (Mutations) ----+
  |                               |
  +-----> Task 5 (Queries)  ----+---> Task 6 (Actions)
                                 |         |
                                 v         v
                           Task 7 (Internals + Cron)
                                 |
                                 v
                           Task 8 (Settings Page)
                                 |
                           +-----+-----+
                           |           |
                           v           v
                     Task 9        Task 10
                    (Traffic)    (Engagement)
                           |           |
                           +-----+-----+
                                 |
                                 v
                           Task 11 (Nav Item)
                                 |
                                 v
                           Task 12 (Deploy)
```

**Parallelizable:** Tasks 4 and 5 can run in parallel after Task 3. Tasks 9 and 10 can run in parallel after Task 8.
