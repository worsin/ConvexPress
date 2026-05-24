# GA4 Integration System - Expert Knowledge Document

**System:** GA4 Integration System
**Status:** Not Started (0%)
**Priority:** P2 - Enhancement
**WordPress Equivalent:** Google Site Kit plugin (GA4 Analytics module)
**Last Analyzed:** 2026-04-01
**Airtable System ID:** N/A (pending registration)

---

## Quick Reference

### What This System Does

The GA4 Integration System connects ConvexPress to Google Analytics 4 via the GA4 Data API, pulling per-page traffic and engagement metrics into the admin dashboards. It authenticates using a Google service account, fetches GA4 reports through Convex actions, caches results in a `gaCache` table with a 1-hour TTL, and serves cached data reactively to dashboard components. When GA4 is not connected (or credentials are invalid), the system transparently falls back to the built-in Analytics System. It serves as the primary data source for the Dashboard's Traffic and Engagement tabs when connected, with the built-in Analytics System acting as the transparent fallback.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **gaCache** | Cache table storing GA4 API responses. Each entry is keyed by a SHA-256 hash of query parameters and expires after 1 hour. |
| **Service Account** | Google service account JSON key used to authenticate with the GA4 Data API. Stored as a Convex environment variable (`GA4_SERVICE_ACCOUNT_JSON`), never in the database. |
| **Property ID** | GA4 property identifier (format: `properties/XXXXXXXXX`). Stored in the Settings System. |
| **Query Hash** | Deterministic SHA-256 hash of normalized query parameters (queryType, dateRange, path, metrics, dimensions) used for cache lookup. |
| **Cache TTL** | 1 hour (3,600,000ms). Balances freshness against GA4 API quota (10,000 requests/day). |
| **Traffic Metrics** | Pageviews, sessions, users, new users, traffic sources, referrer domains, countries, device categories. |
| **Engagement Metrics** | Bounce rate, avg session duration, pages/session, engagement rate, avg engagement time, event count, conversions. |
| **Fallback Behavior** | When GA4 is not connected, dashboard hooks automatically switch to the built-in Analytics System queries. |
| **Test Connection** | Action that validates service account credentials by making a minimal GA4 Data API request before storing the connection. |
| **Hourly Cache Purge** | Cron job that runs every hour to delete expired `gaCache` entries. |
| **Data Source Indicator** | Small badge on dashboard showing "GA4" or "Built-in Analytics" so admins know which source is active. |

### ConvexPress vs WordPress

| Aspect | WordPress (Google Site Kit) | ConvexPress |
|--------|----------------------------|-------------|
| **Plugin** | Google Site Kit plugin | Built-in GA4 Integration System |
| **Auth method** | OAuth 2.0 flow (user grants access in browser) | Service account JSON (uploaded by admin, stored as env var) |
| **Data fetching** | PHP server-side API calls | Convex actions (server-side, no credentials in browser) |
| **Caching** | WordPress transients (database cache) | `gaCache` Convex table with 1-hour TTL and SHA-256 query hashing |
| **Real-time updates** | Page refresh required | Reactive Convex subscriptions push new cache data to UI |
| **Fallback** | No data without Site Kit | Transparent fallback to built-in Analytics System |
| **Configuration** | Site Kit setup wizard | Settings page with property ID + service account upload |
| **Dashboard** | Site Kit dashboard widgets | Integrated into existing Dashboard System Traffic/Engagement tabs |
| **Credential storage** | WordPress options table (encrypted) | Convex environment variable (never in database) |
| **API quota management** | Site Kit handles internally | 1-hour cache TTL, hourly purge cron |

---

## Architecture Overview

### Data Flow

```
Admin Settings Page (/admin/settings/analytics)
  -> Upload service account JSON + enter property ID
    -> testConnection action: validates credentials against GA4 Data API
      -> On success: store property ID in settings, store JSON as env var
      -> Emit event: ga4.connected

Dashboard Component (Traffic/Engagement Tab)
  -> useTrafficData / useEngagementData hook
    -> useQuery(api.ga4.queries.isConnected)
      -> true:
        -> useQuery(api.ga4.queries.getCachedTrafficData, { dateRange, path })
          -> Cache hit (not expired): return data immediately
          -> Cache miss: return null, trigger action
        -> useAction(api.ga4.actions.fetchTrafficData, { dateRange, path })
          -> Authenticate with googleapis using env var credentials
          -> Call GA4 Data API runReport
          -> upsertCache mutation stores result with 1-hour TTL
          -> Reactive query pushes new data to component
      -> false:
        -> useQuery(api.analytics.queries.getTrafficData, { dateRange, path })
          -> Built-in Analytics System (fallback)

Cron (every hour)
  -> ga4.internals.deleteExpiredEntries
    -> Query gaCache where expiresAt < Date.now()
    -> Delete expired entries in batches of 100
```

### Settings Page Flow

```
Admin navigates to /admin/settings/analytics
  |
  v
Not Connected:
  1. Admin enters GA4 property ID (properties/XXXXXXXXX)
  2. Admin uploads service account JSON file
  3. Admin clicks "Test & Connect"
  |
  v
testConnection action:
  1. Validate JSON structure (type, client_email, private_key)
  2. Authenticate with googleapis
  3. Make minimal GA4 Data API request (1 metric, 1 day)
  4. Return { success: true } or { success: false, error }
  |
  v
On success:
  1. Admin sets GA4_SERVICE_ACCOUNT_JSON env var (manual or CLI)
  2. saveConnectionSettings mutation stores propertyId, clientEmail, ga4Connected=true
  3. Emit ga4.connected event
  |
  v
Connected:
  - Property ID displayed (read-only)
  - Service account email displayed (read-only)
  - Last sync timestamp
  - Connection status badge (green)
  - "Disconnect GA4" button (destructive, with confirmation dialog)
```

### Authentication Flow

```
Service Account JSON (env var: GA4_SERVICE_ACCOUNT_JSON)
  -> google.auth.GoogleAuth({ credentials, scopes: ["analytics.readonly"] })
    -> google.analyticsdata({ version: "v1beta", auth })
      -> properties.runReport({ property, requestBody })
        -> GA4 Data API response
```

### Real-Time Behavior

GA4 data is not truly real-time (GA4 itself has a ~4-hour processing delay). The reactive behavior comes from Convex subscriptions to the `gaCache` table:

- When a cache miss triggers a fetch action and the action writes to `gaCache`, the subscribed query automatically re-evaluates and pushes updated data to the dashboard component.
- Multiple admins viewing the same dashboard will all receive the cached data simultaneously without duplicate API calls.

Key subscriptions:
- `ga4/queries.getCachedTrafficData` -- Returns cached traffic metrics or null (triggers fetch)
- `ga4/queries.getCachedEngagementData` -- Returns cached engagement metrics or null (triggers fetch)
- `ga4/queries.isConnected` -- Boolean used for GA4/fallback switching
- `ga4/queries.getConnectionStatus` -- Full connection details for settings page

### Authentication & Authorization

- **GA4 API calls** (`ga4/actions.ts`): Server-side only. Service account credentials read from env var. Never exposed to browser.
- **Settings mutations** (`saveConnectionSettings`, `disconnect`): Require `analytics.manage` capability (Administrator only).
- **Data queries** (`getCachedTrafficData`, `getCachedEngagementData`): Require `analytics.view` capability (Administrator, Editor).
- **`isConnected` query**: Requires `analytics.view` capability. Returns boolean.
- **`getConnectionStatus` query**: Requires `analytics.manage` capability. Returns full connection details.
- **Cache mutations** (`upsertCache`): Internal only -- called from actions, not client-callable.

---

## Database Schema

### gaCache Table

Cached GA4 API responses. TTL'd at 1 hour via hourly cron purge.

```typescript
// convex/schema/ga4.ts
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const ga4Tables = {
  gaCache: defineTable({
    propertyId: v.string(),       // GA4 property ID (e.g., "properties/123456789")
    queryHash: v.string(),        // SHA-256 hash of query parameters (metrics + dimensions + dateRange + filters)
    dateRange: v.string(),        // Human-readable date range key (e.g., "last7days", "last30days", "2026-03-01:2026-03-31")
    queryType: v.union(           // Type of GA4 query
      v.literal("traffic"),       // Traffic tab data (pageviews, sessions, users, sources)
      v.literal("engagement"),    // Engagement tab data (bounce rate, duration, pages/session)
      v.literal("overview")       // Overview metrics for dashboard widgets
    ),
    path: v.optional(v.string()), // Page path filter (null = site-wide)
    data: v.any(),                // GA4 API response data (typed per queryType)
    fetchedAt: v.number(),        // Unix timestamp (ms) when data was fetched from GA4
    expiresAt: v.number(),        // Unix timestamp (ms) when cache expires (fetchedAt + 1 hour)
  })
    .index("by_hash", ["propertyId", "queryHash"])
    .index("by_expiry", ["expiresAt"])
    .index("by_type_and_range", ["propertyId", "queryType", "dateRange"]),
};
```

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `propertyId` | `v.string()` | Yes | GA4 property ID this cache entry belongs to |
| `queryHash` | `v.string()` | Yes | Deterministic SHA-256 hash of all query parameters for cache lookup |
| `dateRange` | `v.string()` | Yes | Human-readable date range identifier (e.g., "last7days", "last28days") |
| `queryType` | `v.union("traffic", "engagement", "overview")` | Yes | Categorizes what kind of GA4 data this entry contains |
| `path` | `v.optional(v.string())` | No | Page path filter; omitted for site-wide queries |
| `data` | `v.any()` | Yes | The GA4 API response payload, structure varies by queryType |
| `fetchedAt` | `v.number()` | Yes | Unix timestamp (ms) when data was fetched from GA4 |
| `expiresAt` | `v.number()` | Yes | Cache expiration (fetchedAt + 3,600,000ms = 1 hour) |

### Indexes

| Table | Index Name | Fields | Purpose |
|-------|-----------|--------|---------|
| `gaCache` | `by_hash` | `["propertyId", "queryHash"]` | Primary cache lookup -- find cached result for a specific query |
| `gaCache` | `by_expiry` | `["expiresAt"]` | Scheduled cleanup of expired cache entries |
| `gaCache` | `by_type_and_range` | `["propertyId", "queryType", "dateRange"]` | Fetch all cached data of a type for a date range |

### Relationships

| This Table | Foreign Key | References | Relationship |
|-----------|-------------|------------|--------------|
| `gaCache` | `propertyId` | External (GA4) | Links cache entry to the GA4 property it was fetched from |

### Settings System Integration

GA4 connection metadata is stored in the Settings System (not in its own table):

| Setting Key | Type | Description |
|-------------|------|-------------|
| `ga4PropertyId` | string | GA4 property ID (`properties/XXXXXXXXX`) |
| `ga4Connected` | boolean | Whether GA4 is currently connected |
| `ga4ServiceAccountEmail` | string | Service account `client_email` (not secret, for display) |
| `ga4LastSync` | number | Unix timestamp of last successful GA4 API call |
| `ga4Error` | string or null | Last connection/fetch error message |

The service account JSON itself (containing the private key) is stored as the `GA4_SERVICE_ACCOUNT_JSON` Convex environment variable -- NEVER in the database.

---

## Convex Functions

### Actions (`convex/ga4/actions.ts`)

| Function | Auth | Args | Returns | Description |
|----------|------|------|---------|-------------|
| `fetchTrafficData` | `analytics.view` | `{ dateRange, path? }` | Traffic metrics object | Reads credentials from env var, checks cache, calls GA4 Data API runReport with traffic metrics/dimensions, caches result with 1-hour TTL |
| `fetchEngagementData` | `analytics.view` | `{ dateRange, path? }` | Engagement metrics object | Same cache-first pattern as fetchTrafficData but with engagement metrics |
| `testConnection` | `analytics.manage` | `{ propertyId, serviceAccountJson }` | `{ success: boolean, error?: string }` | Validates service account JSON structure, authenticates, makes minimal GA4 API request. Does NOT store credentials |

### Queries (`convex/ga4/queries.ts`)

| Function | Auth | Args | Returns | Description |
|----------|------|------|---------|-------------|
| `getCachedTrafficData` | `analytics.view` | `{ dateRange, path? }` | Cached data or null | Computes query hash, looks up gaCache by_hash. Returns data if found and unexpired, null otherwise |
| `getCachedEngagementData` | `analytics.view` | `{ dateRange, path? }` | Cached data or null | Same pattern as getCachedTrafficData for engagement metrics |
| `getConnectionStatus` | `analytics.manage` | `{}` | Connection status object | Returns ga4PropertyId, ga4Connected, ga4ServiceAccountEmail, ga4LastSync, ga4Error from settings |
| `isConnected` | `analytics.view` | `{}` | `boolean` | Returns whether GA4 is connected. Used by dashboard hooks for GA4/fallback switching |

### Mutations (`convex/ga4/mutations.ts`)

| Function | Auth | Args | Returns | Description |
|----------|------|------|---------|-------------|
| `saveConnectionSettings` | `analytics.manage` | `{ propertyId, serviceAccountClientEmail }` | `void` | Saves GA4 property ID, client email, sets ga4Connected=true in settings. Emits `ga4.connected` event |
| `disconnect` | `analytics.manage` | `{}` | `void` | Clears GA4 settings, deletes all gaCache entries via purgeAllCache, sets ga4Connected=false. Emits `ga4.disconnected` event |
| `upsertCache` | Internal | `{ propertyId, queryHash, dateRange, queryType, path?, data }` | `void` | Upserts gaCache entry. Sets fetchedAt=Date.now(), expiresAt=Date.now()+3600000. Called from actions only, not client-callable |

### Internal Functions (`convex/ga4/internals.ts`)

| Function | Type | Args | Description |
|----------|------|------|-------------|
| `deleteExpiredEntries` | internalMutation | `{}` | Query gaCache where expiresAt < Date.now(). Delete in batches of 100. Scheduled via hourly cron |
| `purgeAllCache` | internalMutation | `{ propertyId }` | Delete all gaCache entries for a specific property. Called when disconnecting GA4 |

### Helpers (`convex/ga4/helpers.ts`)

| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| `computeQueryHash` | `{ queryType, dateRange, path?, metrics, dimensions }` | `string` | SHA-256 hash of normalized query parameters for deterministic cache lookup |
| `buildTrafficReportRequest` | `{ dateRange, path? }` | GA4 RunReportRequest | Builds GA4 API request body for traffic metrics |
| `buildEngagementReportRequest` | `{ dateRange, path? }` | GA4 RunReportRequest | Builds GA4 API request body for engagement metrics |
| `parseDateRange` | `{ dateRange }` | `{ startDate, endDate }` | Converts date range key ("last7days", etc.) to GA4 date strings |
| `parseGA4Response` | `{ response, queryType }` | Normalized data object | Transforms raw GA4 API response into app-friendly format |

### Validators (`convex/ga4/validators.ts`)

Shared argument validators for GA4 functions:
- `dateRangeValidator` -- validates date range strings ("today", "yesterday", "last7days", "last28days", "last90days", custom "YYYY-MM-DD:YYYY-MM-DD")
- `queryTypeValidator` -- validates query type union ("traffic", "engagement", "overview")
- `propertyIdValidator` -- validates GA4 property ID format (`properties/\d+`)

### Scheduled Functions (Cron)

```typescript
// convex/crons.ts (add to existing)
crons.interval("ga4:purgeExpiredCache", { hours: 1 }, internal.ga4.internals.deleteExpiredEntries);
```

---

## Cache Strategy

### Hash Computation

The query hash is a deterministic SHA-256 hash of normalized query parameters:

```typescript
function computeQueryHash(params: {
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
    metrics: params.metrics.sort(),
    dimensions: params.dimensions.sort(),
  });
  // SHA-256 hash of the normalized string
  return sha256(normalized);
}
```

### Cache Lifecycle

1. **Dashboard component mounts** -- subscribes to `getCachedTrafficData` query
2. **Query returns cached data** (cache hit) -- component renders immediately
3. **Query returns null** (cache miss / expired) -- component shows loading state and triggers `fetchTrafficData` action
4. **Action fetches from GA4 API** -- calls `upsertCache` mutation to store result
5. **Reactive update** -- Convex pushes new cache data to subscribed query, component re-renders
6. **Hourly cron** -- `deleteExpiredEntries` cleans up stale cache rows

### TTL: 1 Hour

Cache entries expire 1 hour after fetch. This balances freshness (GA4 data itself has a ~4-hour processing delay) against API quota usage. The GA4 Data API has a default quota of 10,000 requests per day per project.

---

## Fallback Behavior

When GA4 is not connected, dashboard components transparently fall back to the built-in Analytics System.

### Decision Flow

```
Dashboard Component
  -> useQuery(api.ga4.queries.isConnected)
    -> true:  Use GA4 data (getCachedTrafficData / fetchTrafficData)
    -> false: Use built-in Analytics System (api.analytics.queries.*)
```

### Implementation Pattern

```typescript
// hooks/useTrafficData.ts
function useTrafficData(dateRange: string, path?: string) {
  const isGA4Connected = useQuery(api.ga4.queries.isConnected);
  const ga4Data = useQuery(
    api.ga4.queries.getCachedTrafficData,
    isGA4Connected ? { dateRange, path } : "skip"
  );
  const builtinData = useQuery(
    api.analytics.queries.getTrafficData,
    !isGA4Connected ? { dateRange, path } : "skip"
  );

  return {
    data: isGA4Connected ? ga4Data : builtinData,
    source: isGA4Connected ? "ga4" : "builtin",
    isLoading: isGA4Connected === undefined,
  };
}
```

Dashboard components display a small data source indicator ("Powered by Google Analytics 4" or "Built-in Analytics") so administrators know which source is active.

---

## GA4 Data API Integration

### Authentication

```typescript
import { google } from "googleapis";

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(serviceAccountJson),
  scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
});

const analyticsData = google.analyticsdata({ version: "v1beta", auth });
```

### Traffic Report Request Example

```typescript
const response = await analyticsData.properties.runReport({
  property: propertyId, // "properties/123456789"
  requestBody: {
    dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
    metrics: [
      { name: "screenPageViews" },
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "newUsers" },
    ],
    dimensions: [
      { name: "sessionDefaultChannelGroup" },
    ],
    dimensionFilter: path ? {
      filter: {
        fieldName: "pagePath",
        stringFilter: { value: path, matchType: "EXACT" },
      },
    } : undefined,
  },
});
```

### Engagement Report Request Example

```typescript
const response = await analyticsData.properties.runReport({
  property: propertyId,
  requestBody: {
    dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
    metrics: [
      { name: "bounceRate" },
      { name: "averageSessionDuration" },
      { name: "screenPageViewsPerSession" },
      { name: "engagementRate" },
      { name: "eventCount" },
    ],
    dimensions: [
      { name: "date" },
    ],
  },
});
```

### Traffic Metrics

| Metric | GA4 API Name | Description |
|--------|-------------|-------------|
| Pageviews | `screenPageViews` | Total page views |
| Sessions | `sessions` | Total sessions |
| Unique Users | `totalUsers` | Unique visitors |
| New Users | `newUsers` | First-time visitors |
| Traffic Sources | dimension: `sessionDefaultChannelGroup` | Organic, social, direct, referral, email, paid |
| Referrer Domains | dimension: `sessionSource` | Top referring domains |
| Country Breakdown | dimension: `country` | Visitors by country |
| Device Categories | dimension: `deviceCategory` | Desktop, mobile, tablet split |

### Engagement Metrics

| Metric | GA4 API Name | Description |
|--------|-------------|-------------|
| Bounce Rate | `bounceRate` | Percentage of single-page sessions |
| Avg Session Duration | `averageSessionDuration` | Average time on site (seconds) |
| Pages per Session | `screenPageViewsPerSession` | Average pages viewed per session |
| Engagement Rate | `engagementRate` | Percentage of engaged sessions |
| Avg Engagement Time | `userEngagementDuration` / `totalUsers` | Average engagement time per user |
| Event Count | `eventCount` | Total GA4 events fired |
| Conversions | `conversions` | Conversion event count |

### Date Ranges

| Key | GA4 startDate | GA4 endDate | Description |
|-----|--------------|-------------|-------------|
| `today` | `today` | `today` | Current day |
| `yesterday` | `yesterday` | `yesterday` | Previous day |
| `last7days` | `7daysAgo` | `today` | Trailing 7-day window |
| `last28days` | `28daysAgo` | `today` | Trailing 28-day window (GA4 default) |
| `last90days` | `90daysAgo` | `today` | Trailing 90-day window |
| `custom` | User-specified | User-specified | Custom start and end dates |

---

## Error Handling

| Error Scenario | Handling |
|----------------|----------|
| Invalid service account JSON | Validate JSON structure before storing. Show field-level error: "Invalid service account JSON. Must contain type, client_email, and private_key fields." |
| Invalid property ID format | Validate against `properties/\d+` pattern. Show field-level error. |
| GA4 API authentication failure | Show error on settings page. Set `ga4Error` field. Do not mark as connected. |
| GA4 API quota exceeded | Cache the quota error. Retry after 1 hour. Show warning badge on dashboard. |
| GA4 API timeout | Retry once. If second attempt fails, return stale cached data (if available) with "stale data" indicator. |
| Network error in action | Log error. Return null to trigger fallback to built-in analytics. |
| Service account lacks GA4 access | Show error: "Service account does not have access to this GA4 property. Grant Viewer role in GA4 admin." |
| Property has no data | Show empty state: "No data available for this date range." |

---

## Events

| Event | Payload | When |
|-------|---------|------|
| `ga4.connected` | `{ propertyId, serviceAccountEmail, connectedBy }` | GA4 successfully connected |
| `ga4.disconnected` | `{ propertyId, disconnectedBy }` | GA4 disconnected |
| `ga4.connection_error` | `{ propertyId, error, attemptedBy }` | GA4 connection test failed |
| `ga4.fetch_error` | `{ propertyId, queryType, dateRange, error }` | GA4 Data API call failed |

---

## Admin UI

### Settings Page: `/admin/settings/analytics`

**Route file:** `routes/_authenticated/_admin/settings/analytics.tsx`

**When not connected:**
- Section: "Google Analytics 4"
  - Info callout: instructions for creating a service account and granting GA4 Viewer access
  - GA4 Property ID text field (placeholder: `properties/123456789`)
  - Service account JSON file upload (drag-and-drop, accepts `.json`)
  - "Test & Connect" primary button
- No Connection Status section shown

**When connected:**
- Section: "Google Analytics 4"
  - Property ID (read-only display)
  - Service account email (read-only display)
  - Connection status badge (green)
  - Last sync timestamp
- Section: "Actions"
  - "Disconnect GA4" destructive button with confirmation dialog

### Dashboard Integration

The GA4 system does not own dashboard components -- it provides data hooks. The Dashboard System consumes these hooks and renders the Traffic and Engagement tabs. The GA4 system provides:

1. `useTrafficData(dateRange, path?)` hook
2. `useEngagementData(dateRange, path?)` hook
3. `useGA4ConnectionStatus()` hook
4. Data source indicator component ("Powered by Google Analytics 4" or "Built-in Analytics")

---

## Files Owned by This Expert

### Backend Files (ConvexPress-Admin/packages/backend/convex/)

1. **`schema/ga4.ts`** -- PENDING
   - Exports: `ga4Tables` (gaCache)
   - Must be imported + spread in `schema.ts`

2. **`ga4/actions.ts`** -- PENDING
   - Exports: `fetchTrafficData`, `fetchEngagementData`, `testConnection`
   - Imports from: `googleapis` (Google APIs client), `../helpers/permissions` (requireCan), `../helpers/events` (emitEvent)
   - fetchTrafficData and fetchEngagementData require `analytics.view` capability
   - testConnection requires `analytics.manage` capability

3. **`ga4/queries.ts`** -- PENDING
   - Exports: `getCachedTrafficData`, `getCachedEngagementData`, `getConnectionStatus`, `isConnected`
   - Imports from: `../helpers/permissions` (requireCan)
   - getCachedTrafficData and getCachedEngagementData require `analytics.view`
   - getConnectionStatus requires `analytics.manage`
   - isConnected requires `analytics.view`

4. **`ga4/mutations.ts`** -- PENDING
   - Exports: `saveConnectionSettings`, `disconnect`, `upsertCache`
   - Imports from: `../helpers/permissions` (requireCan), `../helpers/events` (emitEvent)
   - saveConnectionSettings emits `ga4.connected` event
   - disconnect emits `ga4.disconnected` event
   - upsertCache is internal (called from actions only)

5. **`ga4/internals.ts`** -- PENDING
   - Exports: `deleteExpiredEntries` (internalMutation), `purgeAllCache` (internalMutation)
   - deleteExpiredEntries: query expired gaCache entries and delete in batches of 100
   - purgeAllCache: delete all gaCache entries for a specific property (used on disconnect)

6. **`ga4/helpers.ts`** -- PENDING
   - Exports: `computeQueryHash`, `buildTrafficReportRequest`, `buildEngagementReportRequest`, `parseDateRange`, `parseGA4Response`

7. **`ga4/validators.ts`** -- PENDING
   - Exports: shared argument validators for date ranges, query types, property ID format

### Frontend Files -- Admin (ConvexPress-Admin/apps/web/src/)

8. **`routes/_authenticated/_admin/settings/analytics.tsx`** -- PENDING
   - Route path: `/_authenticated/_admin/settings/analytics`
   - Renders: GA4 settings page (connection form or connected status)

9. **`components/settings/GA4ConnectionForm.tsx`** -- PENDING
   - Property ID input, service account JSON file upload, "Test & Connect" button

10. **`components/settings/GA4ConnectionStatus.tsx`** -- PENDING
    - Connected state display: property ID, service account email, last sync, disconnect button

11. **`components/settings/GA4DisconnectDialog.tsx`** -- PENDING
    - Confirmation dialog for destructive disconnect action

12. **`components/dashboard/DataSourceIndicator.tsx`** -- PENDING
    - Small badge showing "GA4" or "Built-in Analytics" as active data source

13. **`hooks/ga4/useTrafficData.ts`** -- PENDING
    - GA4/fallback switching hook for traffic data

14. **`hooks/ga4/useEngagementData.ts`** -- PENDING
    - GA4/fallback switching hook for engagement data

15. **`hooks/ga4/useGA4ConnectionStatus.ts`** -- PENDING
    - Wraps getConnectionStatus query for settings page

---

## Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| **Schema** (`convex/schema/ga4.ts`) | PENDING | gaCache table with by_hash, by_expiry, by_type_and_range indexes |
| **Actions** (`convex/ga4/actions.ts`) | PENDING | fetchTrafficData, fetchEngagementData, testConnection |
| **Queries** (`convex/ga4/queries.ts`) | PENDING | getCachedTrafficData, getCachedEngagementData, getConnectionStatus, isConnected |
| **Mutations** (`convex/ga4/mutations.ts`) | PENDING | saveConnectionSettings, disconnect, upsertCache |
| **Internals** (`convex/ga4/internals.ts`) | PENDING | deleteExpiredEntries, purgeAllCache |
| **Helpers** (`convex/ga4/helpers.ts`) | PENDING | computeQueryHash, report builders, response parser, date range parser |
| **Validators** (`convex/ga4/validators.ts`) | PENDING | Date range, query type, property ID validators |
| **Cron Job** | PENDING | Hourly cache purge in convex/crons.ts |
| **Settings Route** (`routes/_authenticated/_admin/settings/analytics.tsx`) | PENDING | GA4 settings page |
| **GA4ConnectionForm** | PENDING | Connection form component |
| **GA4ConnectionStatus** | PENDING | Connected status display component |
| **GA4DisconnectDialog** | PENDING | Disconnect confirmation dialog |
| **DataSourceIndicator** | PENDING | GA4/built-in badge component |
| **useTrafficData hook** | PENDING | GA4/fallback switching for traffic |
| **useEngagementData hook** | PENDING | GA4/fallback switching for engagement |
| **useGA4ConnectionStatus hook** | PENDING | Connection status for settings page |
| **npm dependency** | PENDING | `googleapis` not installed in ConvexPress-Admin/packages/backend |
| **Schema integration** | PENDING | `ga4Tables` not imported in main `schema.ts` |

---

## Dependencies

### System Dependencies

| System | Dependency Type | Description |
|--------|----------------|-------------|
| Settings System | Hard | Stores GA4 property ID, connection status, service account email in settings table |
| Dashboard System | Consumer | Dashboard reads GA4 data hooks for Traffic and Engagement tabs |
| Role & Capability System | Hard | Provides `analytics.manage` and `analytics.view` capability checks |
| Event Dispatcher System | Soft | Emits ga4.connected, ga4.disconnected, ga4.connection_error, ga4.fetch_error events |
| Audit Log System | Soft | Connection/disconnection events are logged |
| Built-in Analytics System | Fallback | Provides data when GA4 is not connected |

### External Dependencies

| Dependency | Version | Purpose |
|-----------|---------|---------|
| `googleapis` | latest | Google APIs Node.js client for GA4 Data API authentication and report requests |

Install in admin backend:
```bash
cd ConvexPress-Admin/packages/backend && bun add googleapis
```

---

## Security Considerations

1. **Service account JSON** -- Contains a private key. NEVER stored in the settings table or any Convex table. Must be stored as Convex environment variable `GA4_SERVICE_ACCOUNT_JSON`.
2. **Minimal API scope** -- Service account only needs `https://www.googleapis.com/auth/analytics.readonly`.
3. **Capability gating** -- All settings mutations require `analytics.manage`. All data queries require `analytics.view`.
4. **No client-side API calls** -- All GA4 API calls happen in Convex actions (server-side). Credentials never reach the browser.
5. **Audit trail** -- All connection/disconnection events logged via Event Dispatcher System.

---

## Related Experts

| Expert | When to Consult |
|--------|----------------|
| **Analytics System Expert** (`/experts:analytics-system`) | Built-in analytics fallback data. Shares `analytics.view` and `analytics.manage` capabilities. |
| **Dashboard System Expert** (`/experts:dashboard-system`) | Dashboard Traffic and Engagement tabs consume GA4 data hooks. |
| **Settings System Expert** (`/experts:settings-system`) | GA4 connection metadata stored in settings table. Analytics settings sub-page. |
| **Role & Capability System Expert** (`/experts:role-capability-system`) | Provides `analytics.manage` and `analytics.view` capability checks. |
| **Event Dispatcher System Expert** (`/experts:event-dispatcher-system`) | Emitting ga4.connected, ga4.disconnected, ga4.connection_error, ga4.fetch_error events. |
| **Admin Settings & Forms UI Expert** (`/experts:admin-settings-ui`) | Shared form patterns, file upload component for settings page. |
| **Admin Shell & Navigation UI Expert** (`/experts:admin-shell-ui`) | Analytics settings sub-page in Settings menu. |
| **Convex Deployment Expert** (`/experts:convex-deployment`) | Deploy after any backend changes (schema, actions, queries, mutations, crons). |
