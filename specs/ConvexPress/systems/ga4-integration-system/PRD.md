# GA4 Integration System - Product Requirements Document

**System:** GA4 Integration System
**Priority:** P2 - Enhancement
**WordPress Equivalent:** Google Site Kit plugin (GA4 integration)
**Dependencies:** Settings System, Dashboard System, Role & Capability System, Event Dispatcher System
**npm Dependency:** `googleapis` (Google APIs Node.js client)

---

## 1. Overview

### Purpose

The GA4 Integration System connects ConvexPress to Google Analytics 4, pulling per-page traffic and engagement metrics into the admin dashboards. It serves as the primary data source for the Traffic and Engagement tabs on the Dashboard when connected, with the built-in Analytics System acting as the transparent fallback when GA4 is not configured or credentials are invalid.

### Problem Statement

ConvexPress's built-in Analytics System tracks basic pageview events server-side, but lacks the depth of data that site owners expect: traffic source breakdown (organic, social, direct, referral), device categories, geographic distribution, bounce rate, session duration, and pages-per-session. Google Analytics 4 already collects this data for most sites. Rather than duplicating GA4's collection infrastructure, ConvexPress should pull GA4 data into its own dashboards, giving administrators a single pane of glass.

### WordPress Equivalent

This system is the ConvexPress equivalent of the **Google Site Kit** WordPress plugin, specifically its Analytics module. Site Kit authenticates with a Google service account, fetches GA4 Data API reports, and renders traffic/engagement widgets in the WordPress dashboard. ConvexPress does the same but with Convex actions, a `gaCache` table for server-side caching, and reactive dashboard components.

---

## 2. Capabilities & Permissions

| Capability | Roles | Description |
|-----------|-------|-------------|
| `analytics.manage` | Administrator | Connect/disconnect GA4, upload service account credentials, configure property ID |
| `analytics.view` | Administrator, Editor | View GA4-powered Traffic and Engagement dashboard tabs |

Contributor and Subscriber roles cannot view GA4 data. Author role cannot view GA4 data (analytics dashboards require `analytics.view`).

---

## 3. Settings Page

### Route: `/admin/settings/analytics`

A new settings sub-page under the Settings menu. Requires `analytics.manage` capability.

#### Sections

**GA4 Connection**

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| `ga4PropertyId` | text | GA4 property ID (format: `properties/XXXXXXXXX`) | Required when connecting. Must match pattern `properties/\d+` |
| `ga4ServiceAccountJson` | file upload | Google service account JSON key file | Must be valid JSON with `type: "service_account"`, `client_email`, and `private_key` fields |
| `ga4Connected` | readonly status | Shows connection status (Connected / Not Connected / Error) | Auto-computed |
| `ga4LastSync` | readonly timestamp | Last successful data fetch | Auto-set |
| `ga4Error` | readonly text | Last error message if connection failed | Auto-set |

**Connection Flow:**
1. Admin uploads service account JSON file
2. System validates JSON structure (must contain `type`, `client_email`, `private_key`)
3. Admin enters GA4 property ID
4. Admin clicks "Test Connection" -- system calls GA4 Data API with a minimal report request
5. On success: credentials stored encrypted, status set to "connected", success toast
6. On failure: error message displayed, credentials not stored

**Disconnect Flow:**
1. Admin clicks "Disconnect GA4" (destructive action -- confirmation dialog)
2. Stored credentials deleted
3. All cached GA4 data purged from `gaCache` table
4. Dashboard falls back to built-in Analytics System

#### Credential Storage

The service account JSON private key MUST NOT be stored as plain text in the settings table. Storage options (in order of preference):

1. **Convex environment variable** -- Store the full service account JSON as `GA4_SERVICE_ACCOUNT_JSON` via `npx convex env set`. The Settings System stores only the `ga4PropertyId` and a `ga4Connected: boolean` flag.
2. **Encrypted in Convex** -- If env var approach is insufficient, encrypt the JSON before storing in a dedicated `gaCredentials` table with the private key encrypted at rest.

The `client_email` from the service account JSON can be stored in the settings table (it is not secret) for display purposes.

---

## 4. Data Model

### `gaCache` Table

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

| Field | Type | Purpose |
|-------|------|---------|
| `propertyId` | string | GA4 property ID this cache entry belongs to |
| `queryHash` | string | Deterministic hash of all query parameters for cache lookup |
| `dateRange` | string | Human-readable date range identifier |
| `queryType` | union literal | Categorizes what kind of GA4 data this entry contains |
| `path` | optional string | Page path filter; omitted for site-wide queries |
| `data` | any | The GA4 API response payload, structure varies by queryType |
| `fetchedAt` | number | When this data was fetched from GA4 |
| `expiresAt` | number | Cache expiration (fetchedAt + 3,600,000ms = 1 hour) |

**Indexes:**

| Index | Fields | Purpose |
|-------|--------|---------|
| `by_hash` | `[propertyId, queryHash]` | Primary cache lookup -- find cached result for a specific query |
| `by_expiry` | `[expiresAt]` | Scheduled cleanup of expired cache entries |
| `by_type_and_range` | `[propertyId, queryType, dateRange]` | Fetch all cached data of a type for a date range |

---

## 5. Metrics

### Traffic Metrics (Traffic Tab)

| Metric | GA4 API Metric Name | Description |
|--------|---------------------|-------------|
| Pageviews | `screenPageViews` | Total page views |
| Sessions | `sessions` | Total sessions |
| Unique Users | `totalUsers` | Unique visitors |
| New Users | `newUsers` | First-time visitors |
| Traffic Sources | dimension: `sessionDefaultChannelGroup` | Breakdown by organic, social, direct, referral, email, paid |
| Referrer Domains | dimension: `sessionSource` | Top referring domains |
| Country Breakdown | dimension: `country` | Visitors by country |
| Device Categories | dimension: `deviceCategory` | Desktop, mobile, tablet split |

### Engagement Metrics (Engagement Tab)

| Metric | GA4 API Metric Name | Description |
|--------|---------------------|-------------|
| Bounce Rate | `bounceRate` | Percentage of single-page sessions |
| Avg Session Duration | `averageSessionDuration` | Average time on site (seconds) |
| Pages per Session | `screenPageViewsPerSession` | Average pages viewed per session |
| Engagement Rate | `engagementRate` | Percentage of engaged sessions |
| Avg Engagement Time | `userEngagementDuration` / `totalUsers` | Average engagement time per user |
| Event Count | `eventCount` | Total GA4 events fired |
| Conversions | `conversions` | Conversion event count |

### Date Ranges

Dashboard components request data for these standard date ranges:

| Key | Range | Description |
|-----|-------|-------------|
| `today` | Today | Current day |
| `yesterday` | Yesterday | Previous day |
| `last7days` | Last 7 days | Trailing 7-day window |
| `last28days` | Last 28 days | Trailing 28-day window (GA4 default) |
| `last90days` | Last 90 days | Trailing 90-day window |
| `custom` | Custom | User-specified start and end dates |

---

## 6. Convex Functions

### Actions (GA4 API Calls)

Actions are used because they make external HTTP calls to the GA4 Data API.

#### `ga4/actions.ts`

**`fetchTrafficData`**
```
action({
  args: {
    dateRange: v.string(),
    path: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Read GA4 credentials from env var (GA4_SERVICE_ACCOUNT_JSON)
    // 2. Read GA4 property ID from settings
    // 3. Compute query hash from args
    // 4. Check gaCache for unexpired entry (via runQuery)
    // 5. If cache hit: return cached data
    // 6. If cache miss: call GA4 Data API runReport with traffic metrics/dimensions
    // 7. Store result in gaCache (via runMutation) with 1-hour TTL
    // 8. Return data
  },
})
```

**`fetchEngagementData`**
```
action({
  args: {
    dateRange: v.string(),
    path: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Same pattern as fetchTrafficData but with engagement metrics
  },
})
```

**`testConnection`**
```
action({
  args: {
    propertyId: v.string(),
    serviceAccountJson: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Validate service account JSON structure
    // 2. Authenticate with googleapis using service account
    // 3. Make minimal GA4 Data API request (1 metric, 1 day)
    // 4. Return { success: true } or { success: false, error: string }
  },
})
```

**`purgeExpiredCache`**
```
action({
  args: {},
  handler: async (ctx) => {
    // 1. Query gaCache by_expiry where expiresAt < Date.now()
    // 2. Delete expired entries in batches
    // Scheduled via Convex cron (every hour)
  },
})
```

### Queries

#### `ga4/queries.ts`

**`getCachedTrafficData`**
```
query({
  args: {
    dateRange: v.string(),
    path: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Require analytics.view capability
    // 2. Compute query hash
    // 3. Look up gaCache by_hash
    // 4. If found and not expired: return data
    // 5. If not found or expired: return null (UI triggers action)
  },
})
```

**`getCachedEngagementData`**
```
query({
  args: {
    dateRange: v.string(),
    path: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Same pattern as getCachedTrafficData
  },
})
```

**`getConnectionStatus`**
```
query({
  args: {},
  handler: async (ctx) => {
    // 1. Require analytics.manage capability
    // 2. Read ga4PropertyId, ga4Connected, ga4LastSync, ga4Error from settings
    // 3. Return connection status object
  },
})
```

**`isConnected`**
```
query({
  args: {},
  handler: async (ctx) => {
    // 1. Read ga4Connected from settings
    // 2. Return boolean -- used by dashboard to decide GA4 vs built-in fallback
  },
})
```

### Mutations

#### `ga4/mutations.ts`

**`saveConnectionSettings`**
```
mutation({
  args: {
    propertyId: v.string(),
    serviceAccountClientEmail: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Require analytics.manage capability
    // 2. Save ga4PropertyId, ga4Connected=true, ga4ServiceAccountEmail to settings
    // 3. Emit event: ga4.connected
    // Note: The actual service account JSON is stored as env var, not in DB
  },
})
```

**`disconnect`**
```
mutation({
  args: {},
  handler: async (ctx) => {
    // 1. Require analytics.manage capability
    // 2. Clear ga4PropertyId, set ga4Connected=false, clear ga4Error
    // 3. Delete all gaCache entries for this property
    // 4. Emit event: ga4.disconnected
    // Note: Admin must manually remove GA4_SERVICE_ACCOUNT_JSON env var
  },
})
```

**`upsertCache`**
```
mutation({
  args: {
    propertyId: v.string(),
    queryHash: v.string(),
    dateRange: v.string(),
    queryType: v.union(v.literal("traffic"), v.literal("engagement"), v.literal("overview")),
    path: v.optional(v.string()),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    // 1. Internal only (called from actions)
    // 2. Upsert gaCache entry: if exists by hash, update; otherwise insert
    // 3. Set fetchedAt = Date.now(), expiresAt = Date.now() + 3600000
  },
})
```

### Internals

#### `ga4/internals.ts`

**`deleteExpiredEntries`**
```
internalMutation({
  args: {},
  handler: async (ctx) => {
    // Query gaCache where expiresAt < Date.now()
    // Delete in batches of 100
  },
})
```

**`purgeAllCache`**
```
internalMutation({
  args: { propertyId: v.string() },
  handler: async (ctx, args) => {
    // Delete all gaCache entries for a specific property
    // Called when disconnecting GA4
  },
})
```

### Scheduled Functions (Cron)

```typescript
// convex/crons.ts (add to existing)
crons.interval("ga4:purgeExpiredCache", { hours: 1 }, internal.ga4.internals.deleteExpiredEntries);
```

---

## 7. Cache Strategy

### Hash Computation

The query hash is a deterministic SHA-256 hash of the normalized query parameters:

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

## 8. Fallback Behavior

When GA4 is not connected, dashboard components must transparently fall back to the built-in Analytics System.

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

Dashboard components should display a small indicator showing the data source ("GA4" badge or "Built-in Analytics" badge) so administrators know which source is active.

---

## 9. Events

| Event | Payload | When |
|-------|---------|------|
| `ga4.connected` | `{ propertyId, serviceAccountEmail, connectedBy }` | GA4 successfully connected |
| `ga4.disconnected` | `{ propertyId, disconnectedBy }` | GA4 disconnected |
| `ga4.connection_error` | `{ propertyId, error, attemptedBy }` | GA4 connection test failed |
| `ga4.fetch_error` | `{ propertyId, queryType, dateRange, error }` | GA4 Data API call failed |

---

## 10. Error Handling

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

## 11. Admin UI

### Settings Page: `/admin/settings/analytics`

**Layout:**
- Page title: "Analytics Settings"
- Two sections: "Google Analytics 4" and "Connection Status"

**When not connected:**
- GA4 Property ID text field
- Service account JSON file upload with drag-and-drop
- "Test & Connect" primary button
- Info callout explaining how to create a service account and grant GA4 access

**When connected:**
- Property ID displayed (read-only)
- Service account email displayed (read-only)
- Last sync timestamp
- "Disconnect GA4" destructive button with confirmation dialog
- Connection status badge (green: connected, red: error)

### Dashboard Integration

The GA4 system does not own dashboard components -- it provides data hooks. The Dashboard System consumes these hooks and renders the Traffic and Engagement tabs. The GA4 system only provides:

1. `useTrafficData(dateRange, path?)` hook
2. `useEngagementData(dateRange, path?)` hook
3. `useGA4ConnectionStatus()` hook
4. Data source indicator component ("Powered by Google Analytics 4" or "Built-in Analytics")

---

## 12. Security Considerations

1. **Service account JSON** -- Contains a private key. NEVER store in the settings table. Use Convex environment variables or encrypted storage.
2. **Minimal API scope** -- Service account only needs `https://www.googleapis.com/auth/analytics.readonly` scope.
3. **Capability gating** -- All GA4 settings mutations require `analytics.manage`. All GA4 data queries require `analytics.view`.
4. **No client-side API calls** -- All GA4 API calls happen in Convex actions (server-side). The service account credentials never reach the browser.
5. **Audit trail** -- All connection/disconnection events are logged via the Event Dispatcher System.

---

## 13. GA4 Data API Integration Details

### Authentication

```typescript
import { google } from "googleapis";

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(serviceAccountJson),
  scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
});

const analyticsData = google.analyticsdata({ version: "v1beta", auth });
```

### Report Request (Traffic Example)

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

### Report Request (Engagement Example)

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

---

## 14. Dependencies

### System Dependencies

| System | Dependency Type | Description |
|--------|----------------|-------------|
| Settings System | Hard | Stores GA4 property ID, connection status, service account email in `analytics` section |
| Dashboard System | Consumer | Dashboard reads GA4 data hooks for Traffic and Engagement tabs |
| Role & Capability System | Hard | Provides `analytics.manage` and `analytics.view` capability checks |
| Event Dispatcher System | Soft | Emits ga4.connected, ga4.disconnected, ga4.connection_error, ga4.fetch_error events |
| Audit Log System | Soft | Connection/disconnection events are logged |
| Built-in Analytics System | Fallback | Provides data when GA4 is not connected |

### External Dependencies

| Dependency | Version | Purpose |
|-----------|---------|---------|
| `googleapis` | latest | Google APIs Node.js client for GA4 Data API |

Install in admin backend:
```bash
cd ConvexPress-Admin/packages/backend && bun add googleapis
```

---

## 15. Implementation Phases

### Phase 1: Schema & Backend Core
- Create `convex/schema/ga4.ts` with `gaCache` table
- Add `ga4Tables` to `schema.ts`
- Create `convex/ga4/` directory with `actions.ts`, `queries.ts`, `mutations.ts`, `internals.ts`, `validators.ts`
- Implement cache hash computation helper
- Implement `upsertCache` and `deleteExpiredEntries` internals

### Phase 2: GA4 API Integration
- Install `googleapis` package
- Implement `testConnection` action
- Implement `fetchTrafficData` action
- Implement `fetchEngagementData` action
- Add cron job for cache cleanup

### Phase 3: Settings Page
- Create `/admin/settings/analytics` route
- Build connection form (property ID + service account upload)
- Build connection status display
- Wire to `saveConnectionSettings` / `disconnect` mutations
- Add test connection flow

### Phase 4: Dashboard Hooks & Fallback
- Create `useTrafficData` hook with GA4/fallback switching
- Create `useEngagementData` hook with GA4/fallback switching
- Create `useGA4ConnectionStatus` hook
- Create data source indicator component
- Wire hooks into Dashboard System components

---

## 16. Testing Checklist

- [ ] Service account JSON validation rejects invalid JSON
- [ ] Service account JSON validation rejects JSON missing required fields
- [ ] Property ID validation rejects invalid formats
- [ ] Test connection succeeds with valid credentials
- [ ] Test connection fails gracefully with invalid credentials
- [ ] Traffic data is fetched and cached on first request
- [ ] Subsequent requests within 1 hour return cached data (no GA4 API call)
- [ ] Cache expires after 1 hour and triggers fresh fetch
- [ ] Expired cache entries are cleaned up by cron
- [ ] Dashboard falls back to built-in analytics when GA4 is not connected
- [ ] Dashboard switches to GA4 data when connected
- [ ] Disconnect purges all cached data
- [ ] Non-admin users cannot access settings page
- [ ] Non-editor users cannot view GA4 dashboard data
- [ ] GA4 API errors are handled gracefully with user-friendly messages
- [ ] Data source indicator correctly shows "GA4" or "Built-in"
