# Analytics System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a built-in, privacy-friendly analytics engine for ConvexPress. Every site gets per-page metrics from day one: pageviews, scroll depth (mapped to structured content sections), internal link clicks, time on page, referrers, devices, and geography. No external analytics, no cookies, no consent walls.

**Architecture:** Two-layer data model (raw events with 90-day TTL + daily rollups kept indefinitely). A lightweight (~2KB) tracking script on the website frontend fires events to a public Convex HTTP endpoint. Daily cron jobs aggregate raw events into rollups and purge expired events. Admin queries read from rollups for fast dashboards, with fallback to raw events for today's near-real-time data.

**Tech Stack:** Convex (schema, mutations, queries, internals, HTTP actions, crons), TypeScript, TanStack Router (lazy-loaded tab routes), React, Tailwind CSS v4, Lucide icons.

**Key Constraint:** The Admin app owns the Convex database. All schema, mutations, queries, and HTTP actions live in `ConvexPress-Admin/packages/backend/convex/`. The Website app is a consumer only -- it never deploys to Convex or writes mutations. The tracking script on the Website sends events via HTTP POST to the Convex HTTP endpoint.

---

## Task 1: Create Analytics Schema

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/schema/analytics.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/schema.ts`

Two tables: `pageEvents` (raw tracking events, 90-day TTL) and `pageAnalyticsDaily` (aggregated daily rollups, kept indefinitely).

- [ ] **Step 1: Create the analytics schema file**

Create `ConvexPress-Admin/packages/backend/convex/schema/analytics.ts`:

```typescript
/**
 * Analytics System - Schema
 *
 * Two tables supporting built-in, privacy-friendly page analytics:
 *   - `pageEvents` - Raw event log with 90-day TTL (purged by cron)
 *   - `pageAnalyticsDaily` - Aggregated daily rollups kept indefinitely
 *
 * This mirrors a two-layer analytics architecture: granular raw events for
 * recent detailed analysis, and efficient rollups for long-term trends.
 *
 * No PII is stored. Visitor IDs are anonymous UUIDs from localStorage.
 * Session IDs are random UUIDs from sessionStorage. User agents are parsed
 * server-side into device/browser/os; the raw string is never stored.
 * IP addresses are used only for optional geo lookup and then discarded.
 *
 * Key design decisions:
 *   - eventType discriminates between pageview, scroll_depth, click, and exit
 *   - postId is optional and resolved from path at ingest time
 *   - payload is a typed object with optional fields per event type
 *   - scrollDepth in rollups uses named sections, not raw percentages
 *   - Rollups are keyed by (date, path, referrerDomain, deviceType, country)
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Shared Validators (used by schema and functions) ───────────────────────

export const eventTypeValidator = v.union(
  v.literal("pageview"),
  v.literal("scroll_depth"),
  v.literal("click"),
  v.literal("exit"),
);

export const deviceTypeValidator = v.union(
  v.literal("desktop"),
  v.literal("mobile"),
  v.literal("tablet"),
);

export const eventPayloadValidator = v.optional(
  v.object({
    // scroll_depth: deepest section reached
    section: v.optional(v.string()),
    sectionIndex: v.optional(v.number()),
    maxSections: v.optional(v.number()),

    // click: link destination
    targetPath: v.optional(v.string()),
    targetLabel: v.optional(v.string()),

    // exit: time spent
    timeOnPageMs: v.optional(v.number()),
    engagedTimeMs: v.optional(v.number()),
  }),
);

export const scrollDepthValidator = v.object({
  hero: v.number(),
  topic1: v.number(),
  topic2: v.number(),
  topic3: v.number(),
  topic4: v.number(),
  topic5: v.number(),
  summary: v.number(),
  sources: v.number(),
  comments: v.number(),
});

export const clickTargetValidator = v.object({
  targetPath: v.string(),
  count: v.number(),
});

// ─── Tables ─────────────────────────────────────────────────────────────────

export const analyticsTables = {
  /**
   * pageEvents - Raw tracking events
   *
   * Stores individual pageview, scroll_depth, click, and exit events.
   * TTL'd at 90 days via a daily purge cron job. Used for:
   *   - Near-real-time "today's stats" in the admin dashboard
   *   - Daily rollup aggregation (processed then purged)
   *   - Session reconstruction for debugging
   */
  pageEvents: defineTable({
    // Event identification
    eventType: eventTypeValidator,
    timestamp: v.number(), // Unix ms

    // Page context
    path: v.string(), // e.g., "/blog/my-post-slug"
    postId: v.optional(v.id("posts")), // Linked post if path resolves

    // Visitor context (anonymous)
    visitorId: v.string(), // Anonymous UUID from localStorage
    sessionId: v.string(), // Session UUID from sessionStorage

    // Traffic source
    referrer: v.optional(v.string()), // Full referrer URL (first pageview only)
    referrerDomain: v.optional(v.string()), // Extracted domain (e.g., "google.com")
    utmSource: v.optional(v.string()),
    utmMedium: v.optional(v.string()),
    utmCampaign: v.optional(v.string()),

    // Device context (parsed from user agent server-side, raw UA not stored)
    deviceType: deviceTypeValidator,
    browser: v.string(), // e.g., "Chrome", "Safari", "Firefox"
    os: v.string(), // e.g., "Windows", "macOS", "iOS", "Android"

    // Geography (resolved from IP at ingest, IP not stored)
    country: v.optional(v.string()), // ISO 3166-1 alpha-2 (e.g., "US", "GB")
    region: v.optional(v.string()), // State/province (e.g., "California")

    // Event-specific payload
    payload: eventPayloadValidator,
  })
    .index("by_path_timestamp", ["path", "timestamp"])
    .index("by_postId_timestamp", ["postId", "timestamp"])
    .index("by_eventType_timestamp", ["eventType", "timestamp"])
    .index("by_timestamp", ["timestamp"])
    .index("by_session", ["sessionId", "timestamp"]),

  /**
   * pageAnalyticsDaily - Aggregated daily rollups
   *
   * One document per unique (date, path, referrerDomain, deviceType, country).
   * Kept indefinitely. Computed by the daily rollup cron from pageEvents.
   */
  pageAnalyticsDaily: defineTable({
    // Aggregation key
    date: v.string(), // ISO date "2026-04-01"
    path: v.string(), // Page path
    postId: v.optional(v.id("posts")),

    // Dimensions (each unique combo = one row)
    referrerDomain: v.optional(v.string()), // null = direct traffic
    deviceType: deviceTypeValidator,
    country: v.optional(v.string()),

    // Core metrics
    pageviews: v.number(),
    uniqueVisitors: v.number(), // Distinct visitorId count
    sessions: v.number(), // Distinct sessionId count

    // Engagement metrics
    avgTimeOnPageMs: v.number(), // Average time on page
    avgEngagedTimeMs: v.number(), // Average engaged (visible) time
    bounceRate: v.number(), // % of sessions with only one pageview (0-1)

    // Scroll depth distribution (% of pageviews reaching each section)
    scrollDepth: scrollDepthValidator,

    // Click metrics
    internalClicks: v.number(), // Total internal link clicks
    topClickTargets: v.array(clickTargetValidator),
  })
    .index("by_date_path", ["date", "path"])
    .index("by_postId_date", ["postId", "date"])
    .index("by_date", ["date"])
    .index("by_path_date", ["path", "date"]),
};
```

- [ ] **Step 2: Import and spread in schema.ts**

Modify `ConvexPress-Admin/packages/backend/convex/schema.ts`. Add the import alongside the other schema imports, and spread it into the `defineSchema` call.

Add this import after the existing imports (e.g., after `import { authTables } from "./schema/auth";`):

```typescript
import { analyticsTables } from "./schema/analytics";
```

Add this spread inside the `defineSchema({})` call (e.g., after `...authTables,`):

```typescript
  ...analyticsTables,
```

- [ ] **Step 3: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx convex dev --once --typecheck=disable` to confirm the schema deploys without errors.

**Commit:** `feat(analytics): add pageEvents and pageAnalyticsDaily schema tables`

---

## Task 2: Create Analytics Validators

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/analytics/validators.ts`

Shared argument validators for all analytics Convex functions.

- [ ] **Step 1: Create the validators file**

Create `ConvexPress-Admin/packages/backend/convex/analytics/validators.ts`:

```typescript
/**
 * Analytics System - Shared Argument Validators
 *
 * Reusable Convex validators for analytics function arguments.
 * Used across queries, mutations, internals, and HTTP actions.
 */

import { v } from "convex/values";
import {
  eventTypeValidator,
  deviceTypeValidator,
  eventPayloadValidator,
} from "../schema/analytics";

// ─── Date Range Args ────────────────────────────────────────────────────────

/** Standard date range args for analytics queries */
export const dateRangeArgs = {
  startDate: v.string(), // ISO date "2026-04-01"
  endDate: v.string(), // ISO date "2026-04-07"
};

// ─── Path / Post Targeting ──────────────────────────────────────────────────

/** Optional path or postId targeting for analytics queries */
export const targetArgs = {
  path: v.optional(v.string()),
  postId: v.optional(v.id("posts")),
};

// ─── Tracking Event (from client) ───────────────────────────────────────────

/**
 * Raw event shape as sent by the tracking script.
 * The HTTP action validates this shape, then normalizes it before writing.
 * Note: userAgent is accepted here but NOT stored -- it is parsed into
 * deviceType, browser, os server-side.
 */
export const trackingEventValidator = v.object({
  eventType: eventTypeValidator,
  path: v.string(),
  visitorId: v.string(),
  sessionId: v.string(),
  timestamp: v.number(),
  referrer: v.optional(v.string()),
  userAgent: v.optional(v.string()),
  utmSource: v.optional(v.string()),
  utmMedium: v.optional(v.string()),
  utmCampaign: v.optional(v.string()),
  payload: v.optional(
    v.object({
      section: v.optional(v.string()),
      sectionIndex: v.optional(v.number()),
      maxSections: v.optional(v.number()),
      targetPath: v.optional(v.string()),
      targetLabel: v.optional(v.string()),
      timeOnPageMs: v.optional(v.number()),
      engagedTimeMs: v.optional(v.number()),
    }),
  ),
});

// ─── Ingest Events (internal, after normalization) ──────────────────────────

/** Validated + normalized event shape written to pageEvents table */
export const normalizedEventValidator = v.object({
  eventType: eventTypeValidator,
  timestamp: v.number(),
  path: v.string(),
  postId: v.optional(v.id("posts")),
  visitorId: v.string(),
  sessionId: v.string(),
  referrer: v.optional(v.string()),
  referrerDomain: v.optional(v.string()),
  utmSource: v.optional(v.string()),
  utmMedium: v.optional(v.string()),
  utmCampaign: v.optional(v.string()),
  deviceType: deviceTypeValidator,
  browser: v.string(),
  os: v.string(),
  country: v.optional(v.string()),
  region: v.optional(v.string()),
  payload: eventPayloadValidator,
});

// ─── Purge Args ─────────────────────────────────────────────────────────────

export const purgeArgs = {
  scope: v.union(v.literal("all"), v.literal("before_date")),
  beforeDate: v.optional(v.string()),
};

// ─── Settings Args ──────────────────────────────────────────────────────────

export const settingsArgs = {
  trackingEnabled: v.optional(v.boolean()),
  respectDoNotTrack: v.optional(v.boolean()),
  retentionDays: v.optional(v.number()),
};
```

**Commit:** `feat(analytics): add shared argument validators`

---

## Task 3: Create Analytics Mutations

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/analytics/mutations.ts`

Public mutations for admin-facing operations: manual purge and settings update.

- [ ] **Step 1: Create the mutations file**

Create `ConvexPress-Admin/packages/backend/convex/analytics/mutations.ts`:

```typescript
/**
 * Analytics System - Public Mutations
 *
 * Admin-facing mutations for managing analytics data and settings.
 * All mutations require analytics.manage capability (Administrator only).
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireCan } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { purgeArgs, settingsArgs } from "./validators";

// ─── purgeAnalytics ─────────────────────────────────────────────────────────

/**
 * Manually purge analytics data.
 *
 * Destructive action -- the admin UI should show a confirmation dialog.
 * Can purge all data or only data before a specific date.
 *
 * @auth analytics.manage (Administrator only)
 */
export const purgeAnalytics = mutation({
  args: purgeArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "analytics.manage");

    let deletedEvents = 0;
    let deletedRollups = 0;

    if (args.scope === "all") {
      // Delete all pageEvents
      const allEvents = await ctx.db.query("pageEvents").collect();
      for (const event of allEvents) {
        await ctx.db.delete(event._id);
        deletedEvents++;
      }

      // Delete all rollups
      const allRollups = await ctx.db.query("pageAnalyticsDaily").collect();
      for (const rollup of allRollups) {
        await ctx.db.delete(rollup._id);
        deletedRollups++;
      }
    } else if (args.scope === "before_date" && args.beforeDate) {
      // Delete pageEvents before the given date
      const cutoffMs = new Date(args.beforeDate).getTime();
      const events = await ctx.db
        .query("pageEvents")
        .withIndex("by_timestamp", (q) => q.lt("timestamp", cutoffMs))
        .collect();
      for (const event of events) {
        await ctx.db.delete(event._id);
        deletedEvents++;
      }

      // Delete rollups before the given date
      const rollups = await ctx.db
        .query("pageAnalyticsDaily")
        .withIndex("by_date", (q) => q.lt("date", args.beforeDate!))
        .collect();
      for (const rollup of rollups) {
        await ctx.db.delete(rollup._id);
        deletedRollups++;
      }
    }

    // Emit event for audit trail
    await emitEvent(ctx, "analytics.data_purged", "analytics", {
      scope: args.scope,
      beforeDate: args.beforeDate,
      deletedEvents,
      deletedRollups,
      purgedBy: user._id,
    });

    return { deletedEvents, deletedRollups };
  },
});

// ─── updateSettings ─────────────────────────────────────────────────────────

/**
 * Update analytics settings.
 *
 * Settings are stored in the global settings table via the Settings System.
 * This mutation updates the relevant setting keys.
 *
 * @auth analytics.manage (Administrator only)
 */
export const updateSettings = mutation({
  args: settingsArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "analytics.manage");

    const changes: Record<string, unknown> = {};

    // Update each provided setting
    if (args.trackingEnabled !== undefined) {
      const existing = await ctx.db
        .query("settings")
        .withIndex("by_key", (q) => q.eq("key", "analytics_tracking_enabled"))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { value: args.trackingEnabled });
      } else {
        await ctx.db.insert("settings", {
          key: "analytics_tracking_enabled",
          value: args.trackingEnabled,
          group: "analytics",
          label: "Enable Tracking",
          description: "Master switch for analytics tracking",
          type: "boolean",
          isPublic: false,
          isAutoloaded: true,
        });
      }
      changes.trackingEnabled = args.trackingEnabled;
    }

    if (args.respectDoNotTrack !== undefined) {
      const existing = await ctx.db
        .query("settings")
        .withIndex("by_key", (q) => q.eq("key", "analytics_respect_dnt"))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { value: args.respectDoNotTrack });
      } else {
        await ctx.db.insert("settings", {
          key: "analytics_respect_dnt",
          value: args.respectDoNotTrack,
          group: "analytics",
          label: "Respect Do Not Track",
          description: "Honor the browser Do Not Track header",
          type: "boolean",
          isPublic: false,
          isAutoloaded: true,
        });
      }
      changes.respectDoNotTrack = args.respectDoNotTrack;
    }

    if (args.retentionDays !== undefined) {
      const existing = await ctx.db
        .query("settings")
        .withIndex("by_key", (q) =>
          q.eq("key", "analytics_retention_days"),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { value: args.retentionDays });
      } else {
        await ctx.db.insert("settings", {
          key: "analytics_retention_days",
          value: args.retentionDays,
          group: "analytics",
          label: "Data Retention (Days)",
          description: "Days to keep raw tracking events before purging",
          type: "number",
          isPublic: false,
          isAutoloaded: true,
        });
      }
      changes.retentionDays = args.retentionDays;
    }

    // Emit event for audit trail
    if (Object.keys(changes).length > 0) {
      await emitEvent(ctx, "analytics.settings_updated", "analytics", {
        changes,
        updatedBy: user._id,
      });
    }
  },
});
```

**Commit:** `feat(analytics): add purgeAnalytics and updateSettings mutations`

---

## Task 4: Create Analytics HTTP Endpoint

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/http/analytics.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/http.ts`

A public HTTP action at `POST /api/analytics/track` that accepts batched events from the website tracking script, validates them, normalizes user agent into device/browser/os, extracts referrer domain, resolves postId from path, and calls the internal `ingestEvents` mutation.

- [ ] **Step 1: Create the HTTP handler file**

Create `ConvexPress-Admin/packages/backend/convex/http/analytics.ts`:

```typescript
/**
 * Analytics System - HTTP Action
 *
 * Public endpoint that receives batched tracking events from the website
 * tracking script. No authentication required -- this is a public ingestion
 * endpoint. Rate limiting is enforced per-request (max 20 events).
 *
 * Processing flow:
 *   1. Parse JSON body, validate events array (max 20)
 *   2. For each event: parse userAgent, extract referrerDomain, resolve postId
 *   3. Call ingestEvents internal mutation with normalized events
 *   4. Return accepted count
 *
 * Privacy: userAgent is parsed into deviceType/browser/os and discarded.
 * IP is not stored (could be used for geo lookup in the future).
 */

import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { corsPreflightResponse, jsonResponse, errorResponse } from "./helpers";

// ─── User Agent Parsing (lightweight, no external dependency) ───────────────

interface ParsedUA {
  deviceType: "desktop" | "mobile" | "tablet";
  browser: string;
  os: string;
}

function parseUserAgent(ua: string | undefined): ParsedUA {
  if (!ua) {
    return { deviceType: "desktop", browser: "Unknown", os: "Unknown" };
  }

  // Device type detection
  let deviceType: "desktop" | "mobile" | "tablet" = "desktop";
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    deviceType = "tablet";
  } else if (
    /mobile|iphone|ipod|android.*mobile|windows phone|blackberry/i.test(ua)
  ) {
    deviceType = "mobile";
  }

  // Browser detection (order matters -- more specific first)
  let browser = "Other";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/opr\//i.test(ua) || /opera/i.test(ua)) browser = "Opera";
  else if (/firefox\//i.test(ua)) browser = "Firefox";
  else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = "Safari";
  else if (/chrome\//i.test(ua)) browser = "Chrome";

  // OS detection
  let os = "Other";
  if (/windows nt/i.test(ua)) os = "Windows";
  else if (/macintosh|mac os x/i.test(ua)) os = "macOS";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/linux/i.test(ua)) os = "Linux";
  else if (/cros/i.test(ua)) os = "ChromeOS";

  return { deviceType, browser, os };
}

// ─── Referrer Domain Extraction ─────────────────────────────────────────────

function extractReferrerDomain(referrer: string | undefined): string | undefined {
  if (!referrer) return undefined;
  try {
    const url = new URL(referrer);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

// ─── Path Sanitization ──────────────────────────────────────────────────────

function sanitizePath(path: string): string {
  // Remove query string and fragment
  let clean = path.split("?")[0].split("#")[0];
  // Ensure leading slash
  if (!clean.startsWith("/")) clean = "/" + clean;
  // Remove trailing slash (except root)
  if (clean.length > 1 && clean.endsWith("/")) {
    clean = clean.slice(0, -1);
  }
  // Limit length
  if (clean.length > 500) clean = clean.slice(0, 500);
  return clean;
}

// ─── Event Validation ───────────────────────────────────────────────────────

const VALID_EVENT_TYPES = new Set(["pageview", "scroll_depth", "click", "exit"]);
const MAX_EVENTS_PER_REQUEST = 20;

interface RawTrackingEvent {
  eventType: string;
  path: string;
  visitorId: string;
  sessionId: string;
  timestamp: number;
  referrer?: string;
  userAgent?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  payload?: {
    section?: string;
    sectionIndex?: number;
    maxSections?: number;
    targetPath?: string;
    targetLabel?: string;
    timeOnPageMs?: number;
    engagedTimeMs?: number;
  };
}

function validateEvent(event: unknown): event is RawTrackingEvent {
  if (typeof event !== "object" || event === null) return false;
  const e = event as Record<string, unknown>;

  if (!VALID_EVENT_TYPES.has(e.eventType as string)) return false;
  if (typeof e.path !== "string" || e.path.length === 0) return false;
  if (typeof e.visitorId !== "string" || e.visitorId.length === 0) return false;
  if (typeof e.sessionId !== "string" || e.sessionId.length === 0) return false;
  if (typeof e.timestamp !== "number" || e.timestamp <= 0) return false;

  return true;
}

// ─── HTTP Action ────────────────────────────────────────────────────────────

export const analyticsTrackHandler = httpAction(async (ctx, request) => {
  // Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", "INVALID_BODY", 400);
  }

  // Validate top-level structure
  if (typeof body !== "object" || body === null || !Array.isArray((body as any).events)) {
    return errorResponse(
      'Request body must have an "events" array',
      "INVALID_STRUCTURE",
      400,
    );
  }

  const rawEvents = (body as { events: unknown[] }).events;

  // Enforce max events per request
  if (rawEvents.length > MAX_EVENTS_PER_REQUEST) {
    return errorResponse(
      `Maximum ${MAX_EVENTS_PER_REQUEST} events per request`,
      "TOO_MANY_EVENTS",
      400,
    );
  }

  if (rawEvents.length === 0) {
    return jsonResponse({ accepted: 0 });
  }

  // Validate and normalize each event
  const normalizedEvents: Array<Record<string, unknown>> = [];

  for (const raw of rawEvents) {
    if (!validateEvent(raw)) continue; // Silently skip invalid events

    const { deviceType, browser, os } = parseUserAgent(raw.userAgent);
    const referrerDomain = extractReferrerDomain(raw.referrer);
    const cleanPath = sanitizePath(raw.path);

    // Resolve postId from path (look up published posts by slug)
    let postId: string | undefined;
    const slug = cleanPath.startsWith("/blog/")
      ? cleanPath.slice(6)
      : cleanPath.startsWith("/")
        ? cleanPath.slice(1)
        : cleanPath;

    if (slug) {
      const post = await ctx.runQuery(internal.analytics.internals.resolvePostFromPath, {
        path: cleanPath,
      });
      if (post) {
        postId = post;
      }
    }

    normalizedEvents.push({
      eventType: raw.eventType,
      timestamp: raw.timestamp,
      path: cleanPath,
      postId,
      visitorId: raw.visitorId,
      sessionId: raw.sessionId,
      referrer: raw.referrer,
      referrerDomain,
      utmSource: raw.utmSource,
      utmMedium: raw.utmMedium,
      utmCampaign: raw.utmCampaign,
      deviceType,
      browser,
      os,
      country: undefined, // Geo resolution deferred for v1
      region: undefined,
      payload: raw.payload,
    });
  }

  // Write normalized events to the database
  if (normalizedEvents.length > 0) {
    await ctx.runMutation(internal.analytics.internals.ingestEvents, {
      events: normalizedEvents,
    });
  }

  return jsonResponse({ accepted: normalizedEvents.length });
});
```

- [ ] **Step 2: Register the HTTP route in http.ts**

Modify `ConvexPress-Admin/packages/backend/convex/http.ts`. Add the import and route registrations.

Add this import near the top of the file, after the existing HTTP handler imports:

```typescript
import { analyticsTrackHandler } from "./http/analytics";
```

Add these route registrations before the `export default http;` line (after the webhooks section):

```typescript
// ─── Analytics Tracking (Public, no auth) ───────────────────────────────────
http.route({
  path: "/api/analytics/track",
  method: "OPTIONS",
  handler: corsPreflight,
});
http.route({
  path: "/api/analytics/track",
  method: "POST",
  handler: analyticsTrackHandler,
});
```

**Commit:** `feat(analytics): add POST /api/analytics/track HTTP endpoint`

---

## Task 5: Create Analytics Queries

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/analytics/queries.ts`

Admin-facing queries that read from `pageAnalyticsDaily` rollups for fast dashboard rendering, with supplemental reads from raw `pageEvents` for today's near-real-time data.

- [ ] **Step 1: Create the queries file**

Create `ConvexPress-Admin/packages/backend/convex/analytics/queries.ts`:

```typescript
/**
 * Analytics System - Public Queries
 *
 * Admin-facing queries for analytics dashboards and post editor tabs.
 * All queries require analytics.view capability (Editor+).
 * Data is read primarily from pageAnalyticsDaily rollups for performance.
 * Today's data is supplemented from raw pageEvents for near-real-time stats.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireCan, currentUserCan } from "../helpers/permissions";
import { dateRangeArgs, targetArgs } from "./validators";

// ─── Helper: Get date string for N days ago ─────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── getTrafficSummary ──────────────────────────────────────────────────────

/**
 * Traffic summary for a specific page or site-wide.
 * Reads from pageAnalyticsDaily rollups for the given date range.
 *
 * @auth analytics.view (Editor+)
 */
export const getTrafficSummary = query({
  args: {
    ...targetArgs,
    ...dateRangeArgs,
  },
  handler: async (ctx, args) => {
    const canView = await currentUserCan(ctx, "analytics.view");
    if (!canView) return null;

    // Fetch rollups for the date range
    let rollups;
    if (args.postId) {
      rollups = await ctx.db
        .query("pageAnalyticsDaily")
        .withIndex("by_postId_date", (q) =>
          q.eq("postId", args.postId!).gte("date", args.startDate).lte("date", args.endDate),
        )
        .collect();
    } else if (args.path) {
      rollups = await ctx.db
        .query("pageAnalyticsDaily")
        .withIndex("by_path_date", (q) =>
          q.eq("path", args.path!).gte("date", args.startDate).lte("date", args.endDate),
        )
        .collect();
    } else {
      // Site-wide
      rollups = await ctx.db
        .query("pageAnalyticsDaily")
        .withIndex("by_date", (q) =>
          q.gte("date", args.startDate).lte("date", args.endDate),
        )
        .collect();
    }

    // Aggregate across all rollup rows
    let totalPageviews = 0;
    let totalSessions = 0;
    let bounceRateSum = 0;
    let bounceRateCount = 0;

    // Track unique visitors across all rollups (approximate via set)
    const allVisitorEstimate = new Set<string>();

    // Daily breakdown
    const dailyMap = new Map<string, { pageviews: number; uniqueVisitors: number }>();

    // Referrer breakdown
    const referrerMap = new Map<string, number>();

    // Device breakdown
    const deviceBreakdown = { desktop: 0, mobile: 0, tablet: 0 };

    // Country breakdown
    const countryMap = new Map<string, number>();

    for (const r of rollups) {
      totalPageviews += r.pageviews;
      totalSessions += r.sessions;
      bounceRateSum += r.bounceRate * r.sessions;
      bounceRateCount += r.sessions;

      // Daily
      const existing = dailyMap.get(r.date) ?? { pageviews: 0, uniqueVisitors: 0 };
      existing.pageviews += r.pageviews;
      existing.uniqueVisitors += r.uniqueVisitors;
      dailyMap.set(r.date, existing);

      // Referrers
      const domain = r.referrerDomain ?? "(direct)";
      referrerMap.set(domain, (referrerMap.get(domain) ?? 0) + r.pageviews);

      // Devices
      deviceBreakdown[r.deviceType] += r.pageviews;

      // Countries
      if (r.country) {
        countryMap.set(r.country, (countryMap.get(r.country) ?? 0) + r.pageviews);
      }
    }

    // Compute total unique visitors (summed from daily -- approximate, may overcount)
    let totalUniqueVisitors = 0;
    for (const d of dailyMap.values()) {
      totalUniqueVisitors += d.uniqueVisitors;
    }

    // Sort and format outputs
    const dailyBreakdown = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    const topReferrers = Array.from(referrerMap.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([domain, pageviews]) => ({ domain, pageviews }));

    const topCountries = Array.from(countryMap.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([country, pageviews]) => ({ country, pageviews }));

    return {
      totalPageviews,
      totalUniqueVisitors,
      totalSessions,
      avgBounceRate: bounceRateCount > 0 ? bounceRateSum / bounceRateCount : 0,
      dailyBreakdown,
      topReferrers,
      deviceBreakdown,
      topCountries,
    };
  },
});

// ─── getEngagementSummary ───────────────────────────────────────────────────

/**
 * Engagement summary for a specific page or site-wide.
 * Reads from pageAnalyticsDaily rollups for the given date range.
 *
 * @auth analytics.view (Editor+)
 */
export const getEngagementSummary = query({
  args: {
    ...targetArgs,
    ...dateRangeArgs,
  },
  handler: async (ctx, args) => {
    const canView = await currentUserCan(ctx, "analytics.view");
    if (!canView) return null;

    // Fetch rollups (same pattern as getTrafficSummary)
    let rollups;
    if (args.postId) {
      rollups = await ctx.db
        .query("pageAnalyticsDaily")
        .withIndex("by_postId_date", (q) =>
          q.eq("postId", args.postId!).gte("date", args.startDate).lte("date", args.endDate),
        )
        .collect();
    } else if (args.path) {
      rollups = await ctx.db
        .query("pageAnalyticsDaily")
        .withIndex("by_path_date", (q) =>
          q.eq("path", args.path!).gte("date", args.startDate).lte("date", args.endDate),
        )
        .collect();
    } else {
      rollups = await ctx.db
        .query("pageAnalyticsDaily")
        .withIndex("by_date", (q) =>
          q.gte("date", args.startDate).lte("date", args.endDate),
        )
        .collect();
    }

    // Aggregate engagement metrics
    let totalTimeMs = 0;
    let totalEngagedMs = 0;
    let totalPageviews = 0;
    let totalInternalClicks = 0;

    // Weighted scroll depth aggregation
    const scrollDepthAccum = {
      hero: 0,
      topic1: 0,
      topic2: 0,
      topic3: 0,
      topic4: 0,
      topic5: 0,
      summary: 0,
      sources: 0,
      comments: 0,
    };

    // Click target aggregation
    const clickMap = new Map<string, number>();

    for (const r of rollups) {
      const weight = r.pageviews;
      totalTimeMs += r.avgTimeOnPageMs * weight;
      totalEngagedMs += r.avgEngagedTimeMs * weight;
      totalPageviews += weight;
      totalInternalClicks += r.internalClicks;

      // Weighted scroll depth
      for (const key of Object.keys(scrollDepthAccum) as Array<keyof typeof scrollDepthAccum>) {
        scrollDepthAccum[key] += r.scrollDepth[key] * weight;
      }

      // Click targets
      for (const ct of r.topClickTargets) {
        clickMap.set(ct.targetPath, (clickMap.get(ct.targetPath) ?? 0) + ct.count);
      }
    }

    // Compute weighted averages
    const scrollDepthDistribution = { ...scrollDepthAccum };
    if (totalPageviews > 0) {
      for (const key of Object.keys(scrollDepthDistribution) as Array<keyof typeof scrollDepthDistribution>) {
        scrollDepthDistribution[key] = scrollDepthDistribution[key] / totalPageviews;
      }
    }

    const topInternalLinks = Array.from(clickMap.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([targetPath, clicks]) => ({ targetPath, clicks }));

    return {
      avgTimeOnPage: totalPageviews > 0 ? totalTimeMs / totalPageviews : 0,
      avgEngagedTime: totalPageviews > 0 ? totalEngagedMs / totalPageviews : 0,
      scrollDepthDistribution,
      topInternalLinks,
      totalInternalClicks,
    };
  },
});

// ─── getTabBadges ───────────────────────────────────────────────────────────

/**
 * Compact metrics for the post editor's Analytics tab badges.
 * Returns lightweight data suitable for rendering in the tab bar.
 *
 * @auth analytics.view (Editor+)
 */
export const getTabBadges = query({
  args: {
    postId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    const canView = await currentUserCan(ctx, "analytics.view");
    if (!canView) return null;

    const now = todayUTC();
    const d7 = daysAgo(7);
    const d30 = daysAgo(30);

    // 7-day rollups
    const rollups7d = await ctx.db
      .query("pageAnalyticsDaily")
      .withIndex("by_postId_date", (q) =>
        q.eq("postId", args.postId).gte("date", d7).lte("date", now),
      )
      .collect();

    // 30-day rollups
    const rollups30d = await ctx.db
      .query("pageAnalyticsDaily")
      .withIndex("by_postId_date", (q) =>
        q.eq("postId", args.postId).gte("date", d30).lte("date", now),
      )
      .collect();

    const views7d = rollups7d.reduce((sum, r) => sum + r.pageviews, 0);
    const views30d = rollups30d.reduce((sum, r) => sum + r.pageviews, 0);

    // Average time on page (30d, weighted by pageviews)
    let totalTimeWeighted = 0;
    let totalPvs = 0;
    for (const r of rollups30d) {
      totalTimeWeighted += r.avgTimeOnPageMs * r.pageviews;
      totalPvs += r.pageviews;
    }
    const avgTimeOnPage = totalPvs > 0 ? totalTimeWeighted / totalPvs : 0;

    // Top section (deepest section most visitors reach in 30d)
    // Find the section with highest weighted scroll depth
    const sectionAccum = {
      hero: 0,
      topic1: 0,
      topic2: 0,
      topic3: 0,
      topic4: 0,
      topic5: 0,
      summary: 0,
      sources: 0,
      comments: 0,
    };
    for (const r of rollups30d) {
      for (const key of Object.keys(sectionAccum) as Array<keyof typeof sectionAccum>) {
        sectionAccum[key] += r.scrollDepth[key] * r.pageviews;
      }
    }

    // Find deepest section where >50% of readers reach
    const sectionOrder: Array<keyof typeof sectionAccum> = [
      "hero",
      "topic1",
      "topic2",
      "topic3",
      "topic4",
      "topic5",
      "summary",
      "sources",
      "comments",
    ];
    let topSection = "hero";
    if (totalPvs > 0) {
      for (const key of sectionOrder) {
        if (sectionAccum[key] / totalPvs >= 0.5) {
          topSection = key;
        }
      }
    }

    return {
      views7d,
      views30d,
      avgTimeOnPage,
      topSection,
    };
  },
});

// ─── getSiteOverview ────────────────────────────────────────────────────────

/**
 * Site-wide analytics overview for the admin Analytics page.
 *
 * @auth analytics.view (Editor+)
 */
export const getSiteOverview = query({
  args: dateRangeArgs,
  handler: async (ctx, args) => {
    const canView = await currentUserCan(ctx, "analytics.view");
    if (!canView) return null;

    const rollups = await ctx.db
      .query("pageAnalyticsDaily")
      .withIndex("by_date", (q) =>
        q.gte("date", args.startDate).lte("date", args.endDate),
      )
      .collect();

    let totalPageviews = 0;
    let totalSessions = 0;
    let bounceRateSum = 0;
    let bounceRateCount = 0;

    // Group by date for daily trend
    const dailyMap = new Map<string, { pageviews: number; uniqueVisitors: number }>();

    // Group by path for top pages
    const pageMap = new Map<
      string,
      { postId?: string; pageviews: number }
    >();

    for (const r of rollups) {
      totalPageviews += r.pageviews;
      totalSessions += r.sessions;
      bounceRateSum += r.bounceRate * r.sessions;
      bounceRateCount += r.sessions;

      // Daily
      const existing = dailyMap.get(r.date) ?? { pageviews: 0, uniqueVisitors: 0 };
      existing.pageviews += r.pageviews;
      existing.uniqueVisitors += r.uniqueVisitors;
      dailyMap.set(r.date, existing);

      // Pages
      const pageEntry = pageMap.get(r.path) ?? { postId: undefined, pageviews: 0 };
      pageEntry.pageviews += r.pageviews;
      if (r.postId) pageEntry.postId = r.postId;
      pageMap.set(r.path, pageEntry);
    }

    // Total unique visitors (approximate)
    let totalUniqueVisitors = 0;
    for (const d of dailyMap.values()) {
      totalUniqueVisitors += d.uniqueVisitors;
    }

    // Sort and format
    const dailyTrend = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    const topPages = Array.from(pageMap.entries())
      .sort(([, a], [, b]) => b.pageviews - a.pageviews)
      .slice(0, 20)
      .map(([path, data]) => ({ path, postId: data.postId, pageviews: data.pageviews }));

    return {
      totalPageviews,
      totalUniqueVisitors,
      totalSessions,
      avgBounceRate: bounceRateCount > 0 ? bounceRateSum / bounceRateCount : 0,
      topPages,
      dailyTrend,
    };
  },
});

// ─── getRecentEvents ────────────────────────────────────────────────────────

/**
 * Recent raw events for near-real-time display.
 * Reads from the raw pageEvents table for the last hour.
 *
 * @auth analytics.view (Editor+)
 */
export const getRecentEvents = query({
  args: {
    path: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const canView = await currentUserCan(ctx, "analytics.view");
    if (!canView) return null;

    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const limit = args.limit ?? 50;

    let events;
    if (args.path) {
      events = await ctx.db
        .query("pageEvents")
        .withIndex("by_path_timestamp", (q) =>
          q.eq("path", args.path!).gte("timestamp", oneHourAgo),
        )
        .order("desc")
        .take(limit);
    } else {
      events = await ctx.db
        .query("pageEvents")
        .withIndex("by_timestamp", (q) => q.gte("timestamp", oneHourAgo))
        .order("desc")
        .take(limit);
    }

    return events.map((e) => ({
      eventType: e.eventType,
      path: e.path,
      timestamp: e.timestamp,
      deviceType: e.deviceType,
      browser: e.browser,
      referrerDomain: e.referrerDomain,
      payload: e.payload,
    }));
  },
});
```

**Commit:** `feat(analytics): add admin dashboard queries (traffic, engagement, badges, overview)`

---

## Task 6: Create Analytics Internals (Rollup + Purge)

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/analytics/internals.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/crons.ts`

Internal functions for event ingestion, daily rollup aggregation, expired event purging, and path-to-post resolution. Plus cron job registration.

- [ ] **Step 1: Create the internals file**

Create `ConvexPress-Admin/packages/backend/convex/analytics/internals.ts`:

```typescript
/**
 * Analytics System - Internal Functions
 *
 * Not callable from clients. Used by:
 *   - HTTP action (ingestEvents, resolvePostFromPath)
 *   - Cron jobs (rollupDailyAnalytics, purgeExpiredEvents)
 *
 * These are the workhorses of the analytics pipeline.
 */

import {
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

// ─── resolvePostFromPath ────────────────────────────────────────────────────

/**
 * Look up a published post by its URL path.
 * Returns the post _id if found, undefined otherwise.
 *
 * Supports paths like:
 *   /blog/my-post-slug  -> looks up slug "my-post-slug"
 *   /my-page-slug       -> looks up slug "my-page-slug" (pages)
 */
export const resolvePostFromPath = internalQuery({
  args: { path: v.string() },
  handler: async (ctx, args) => {
    // Extract slug from path
    let slug: string;
    if (args.path.startsWith("/blog/")) {
      slug = args.path.slice(6);
    } else if (args.path.startsWith("/")) {
      slug = args.path.slice(1);
    } else {
      slug = args.path;
    }

    // Remove any remaining slashes (e.g., nested page paths)
    // For pages with hierarchy, use the last segment
    const segments = slug.split("/").filter(Boolean);
    if (segments.length === 0) return undefined;
    slug = segments[segments.length - 1];

    // Look up post by slug
    const post = await ctx.db
      .query("posts")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    if (post && post.status === "publish") {
      return post._id;
    }

    return undefined;
  },
});

// ─── ingestEvents ───────────────────────────────────────────────────────────

/**
 * Write validated, normalized events to the pageEvents table.
 * Called by the HTTP action after validation and normalization.
 *
 * Uses v.any() for the events array since the HTTP action has already
 * validated the shape. This avoids duplicating the full validator at
 * the internal boundary.
 */
export const ingestEvents = internalMutation({
  args: {
    events: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    for (const event of args.events) {
      await ctx.db.insert("pageEvents", {
        eventType: event.eventType,
        timestamp: event.timestamp,
        path: event.path,
        postId: event.postId,
        visitorId: event.visitorId,
        sessionId: event.sessionId,
        referrer: event.referrer,
        referrerDomain: event.referrerDomain,
        utmSource: event.utmSource,
        utmMedium: event.utmMedium,
        utmCampaign: event.utmCampaign,
        deviceType: event.deviceType,
        browser: event.browser,
        os: event.os,
        country: event.country,
        region: event.region,
        payload: event.payload,
      });
    }
  },
});

// ─── rollupDailyAnalytics ───────────────────────────────────────────────────

/**
 * Aggregate yesterday's raw pageEvents into pageAnalyticsDaily rollups.
 * Scheduled via cron at 00:05 UTC daily.
 *
 * Groups events by (path, referrerDomain, deviceType, country) and computes:
 *   - pageviews, uniqueVisitors, sessions
 *   - avgTimeOnPageMs, avgEngagedTimeMs, bounceRate
 *   - scrollDepth distribution
 *   - internalClicks, topClickTargets
 */
export const rollupDailyAnalytics = internalMutation({
  args: {
    date: v.optional(v.string()), // Override date for backfills, defaults to yesterday
  },
  handler: async (ctx, args) => {
    // Determine target date
    const targetDate =
      args.date ??
      (() => {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - 1);
        return d.toISOString().slice(0, 10);
      })();

    // Time boundaries for the target date (UTC)
    const startMs = new Date(targetDate + "T00:00:00Z").getTime();
    const endMs = new Date(targetDate + "T23:59:59.999Z").getTime();

    // Fetch all events for the target date
    const events = await ctx.db
      .query("pageEvents")
      .withIndex("by_timestamp", (q) =>
        q.gte("timestamp", startMs).lte("timestamp", endMs),
      )
      .collect();

    if (events.length === 0) return;

    // Group events by (path, referrerDomain, deviceType, country)
    const groups = new Map<string, typeof events>();
    for (const e of events) {
      const key = [
        e.path,
        e.referrerDomain ?? "__direct__",
        e.deviceType,
        e.country ?? "__unknown__",
      ].join("|");

      const group = groups.get(key) ?? [];
      group.push(e);
      groups.set(key, group);
    }

    // Process each group into a rollup
    for (const [, groupEvents] of groups) {
      const first = groupEvents[0];
      const path = first.path;
      const referrerDomain = first.referrerDomain ?? undefined;
      const deviceType = first.deviceType;
      const country = first.country ?? undefined;

      // Count pageviews
      const pageviewEvents = groupEvents.filter(
        (e) => e.eventType === "pageview",
      );
      const pageviews = pageviewEvents.length;
      if (pageviews === 0) continue; // Skip groups with no pageviews

      // Unique visitors and sessions
      const visitorIds = new Set(pageviewEvents.map((e) => e.visitorId));
      const sessionIds = new Set(pageviewEvents.map((e) => e.sessionId));

      // Time on page from exit events
      const exitEvents = groupEvents.filter(
        (e) => e.eventType === "exit" && e.payload?.timeOnPageMs != null,
      );
      let avgTimeOnPageMs = 0;
      let avgEngagedTimeMs = 0;
      if (exitEvents.length > 0) {
        avgTimeOnPageMs =
          exitEvents.reduce(
            (sum, e) => sum + (e.payload?.timeOnPageMs ?? 0),
            0,
          ) / exitEvents.length;
        avgEngagedTimeMs =
          exitEvents.reduce(
            (sum, e) => sum + (e.payload?.engagedTimeMs ?? 0),
            0,
          ) / exitEvents.length;
      }

      // Bounce rate: sessions with exactly 1 pageview
      const sessionPageviews = new Map<string, number>();
      for (const e of pageviewEvents) {
        sessionPageviews.set(
          e.sessionId,
          (sessionPageviews.get(e.sessionId) ?? 0) + 1,
        );
      }
      const bouncedSessions = Array.from(sessionPageviews.values()).filter(
        (count) => count === 1,
      ).length;
      const bounceRate =
        sessionPageviews.size > 0
          ? bouncedSessions / sessionPageviews.size
          : 0;

      // Scroll depth distribution
      const scrollEvents = groupEvents.filter(
        (e) => e.eventType === "scroll_depth" && e.payload?.section,
      );
      const sectionNames = [
        "hero",
        "topic-1",
        "topic-2",
        "topic-3",
        "topic-4",
        "topic-5",
        "summary",
        "sources",
        "comments",
      ];
      const sectionKeys: Array<
        keyof {
          hero: number;
          topic1: number;
          topic2: number;
          topic3: number;
          topic4: number;
          topic5: number;
          summary: number;
          sources: number;
          comments: number;
        }
      > = [
        "hero",
        "topic1",
        "topic2",
        "topic3",
        "topic4",
        "topic5",
        "summary",
        "sources",
        "comments",
      ];

      // Track which sections each visitor reached
      const visitorSections = new Map<string, Set<string>>();
      for (const e of scrollEvents) {
        const sections =
          visitorSections.get(e.visitorId) ?? new Set<string>();
        sections.add(e.payload!.section!);
        visitorSections.set(e.visitorId, sections);
      }

      const scrollDepth = {
        hero: 1.0, // Everyone sees the hero
        topic1: 0,
        topic2: 0,
        topic3: 0,
        topic4: 0,
        topic5: 0,
        summary: 0,
        sources: 0,
        comments: 0,
      };

      if (pageviews > 0) {
        for (let i = 0; i < sectionNames.length; i++) {
          const sectionName = sectionNames[i];
          const sectionKey = sectionKeys[i];
          if (sectionKey === "hero") continue; // Always 1.0

          let reached = 0;
          for (const sections of visitorSections.values()) {
            if (sections.has(sectionName)) reached++;
          }
          scrollDepth[sectionKey] = reached / pageviews;
        }
      }

      // Click metrics
      const clickEvents = groupEvents.filter(
        (e) => e.eventType === "click",
      );
      const internalClicks = clickEvents.length;

      const clickTargetMap = new Map<string, number>();
      for (const e of clickEvents) {
        if (e.payload?.targetPath) {
          clickTargetMap.set(
            e.payload.targetPath,
            (clickTargetMap.get(e.payload.targetPath) ?? 0) + 1,
          );
        }
      }
      const topClickTargets = Array.from(clickTargetMap.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([targetPath, count]) => ({ targetPath, count }));

      // Check if a rollup already exists for this key
      const existingRollups = await ctx.db
        .query("pageAnalyticsDaily")
        .withIndex("by_date_path", (q) =>
          q.eq("date", targetDate).eq("path", path),
        )
        .collect();

      const existing = existingRollups.find(
        (r) =>
          (r.referrerDomain ?? undefined) === referrerDomain &&
          r.deviceType === deviceType &&
          (r.country ?? undefined) === country,
      );

      const postId = first.postId ?? undefined;

      if (existing) {
        // Update existing rollup
        await ctx.db.patch(existing._id, {
          pageviews,
          uniqueVisitors: visitorIds.size,
          sessions: sessionIds.size,
          avgTimeOnPageMs,
          avgEngagedTimeMs,
          bounceRate,
          scrollDepth,
          internalClicks,
          topClickTargets,
        });
      } else {
        // Create new rollup
        await ctx.db.insert("pageAnalyticsDaily", {
          date: targetDate,
          path,
          postId,
          referrerDomain,
          deviceType,
          country,
          pageviews,
          uniqueVisitors: visitorIds.size,
          sessions: sessionIds.size,
          avgTimeOnPageMs,
          avgEngagedTimeMs,
          bounceRate,
          scrollDepth,
          internalClicks,
          topClickTargets,
        });
      }
    }
  },
});

// ─── purgeExpiredEvents ─────────────────────────────────────────────────────

/**
 * Delete pageEvents older than the retention period.
 * Scheduled via cron at 01:00 UTC daily.
 * Processes in batches to stay within Convex mutation time limits.
 * Reschedules itself if more events remain.
 */
export const purgeExpiredEvents = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 1000;

    // Read retention days from settings (default 90)
    const retentionSetting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) =>
        q.eq("key", "analytics_retention_days"),
      )
      .unique();
    const retentionDays =
      retentionSetting && typeof retentionSetting.value === "number"
        ? retentionSetting.value
        : 90;

    const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    // Fetch a batch of expired events
    const expired = await ctx.db
      .query("pageEvents")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", cutoffMs))
      .take(batchSize);

    // Delete the batch
    for (const event of expired) {
      await ctx.db.delete(event._id);
    }

    // If we got a full batch, there may be more -- reschedule
    if (expired.length >= batchSize) {
      await ctx.scheduler.runAfter(
        0,
        internal.analytics.internals.purgeExpiredEvents,
        { batchSize },
      );
    }
  },
});
```

- [ ] **Step 2: Register cron jobs in crons.ts**

Modify `ConvexPress-Admin/packages/backend/convex/crons.ts`. Add the analytics cron jobs at the end, before the `export default crons;` line.

Add these entries:

```typescript
// ─── Analytics System ────────────────────────────────────────────────────────
// Daily rollup: aggregate yesterday's raw pageEvents into pageAnalyticsDaily.
// Runs at 00:05 UTC to ensure the previous day's events are complete.
// Added by: Analytics System Expert
crons.daily(
  "analytics-daily-rollup",
  { hourUTC: 0, minuteUTC: 5 },
  internal.analytics.internals.rollupDailyAnalytics,
  {},
);

// Daily purge: delete raw pageEvents older than retention period (default 90 days).
// Processes in batches of 1000; reschedules itself if more remain.
// Added by: Analytics System Expert
crons.daily(
  "analytics-purge-expired",
  { hourUTC: 1, minuteUTC: 0 },
  internal.analytics.internals.purgeExpiredEvents,
  {},
);
```

- [ ] **Step 3: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx convex dev --once --typecheck=disable` to confirm everything deploys together.

**Commit:** `feat(analytics): add internals (ingest, rollup, purge) and cron jobs`

---

## Task 7: Wire Traffic Tab Dashboard

**Files:**
- Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/$postId/traffic.lazy.tsx`
- Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/$pageId/traffic.lazy.tsx`

Replace the placeholder "coming soon" UI with a real dashboard that queries `getTrafficSummary`. Includes a date range selector, metric cards, daily chart, source breakdown, and device/country tables.

- [ ] **Step 1: Create shared TrafficDashboard component**

Create `ConvexPress-Admin/apps/web/src/components/analytics/TrafficDashboard.tsx`:

```typescript
/**
 * TrafficDashboard - Shared traffic analytics dashboard component.
 *
 * Used by both the post and page traffic tabs. Receives a postId and
 * renders pageview metrics, a daily trend chart, referrer breakdown,
 * device breakdown, and country breakdown.
 *
 * Supports date range selection: 7d, 30d, 90d, all time.
 */

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import {
  BarChart3,
  TrendingUp,
  Clock,
  Users,
  Globe,
  Monitor,
  Smartphone,
  Tablet,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Date Range Helpers ─────────────────────────────────────────────────────

type DateRange = "7d" | "30d" | "90d" | "all";

function getDateRange(range: DateRange): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);

  if (range === "all") {
    return { startDate: "2020-01-01", endDate };
  }

  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  return { startDate: start.toISOString().slice(0, 10), endDate };
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function formatPercent(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

interface TrafficDashboardProps {
  postId: Id<"posts">;
}

export function TrafficDashboard({ postId }: TrafficDashboardProps) {
  const [range, setRange] = useState<DateRange>("30d");
  const { startDate, endDate } = useMemo(() => getDateRange(range), [range]);

  const traffic = useQuery(api.analytics.queries.getTrafficSummary, {
    postId,
    startDate,
    endDate,
  });

  // Loading state
  if (traffic === undefined) {
    return <TrafficSkeleton />;
  }

  // No data / no permission
  if (traffic === null) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">
          No analytics data available yet, or you do not have permission to view analytics.
        </p>
      </div>
    );
  }

  const hasData = traffic.totalPageviews > 0;

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="flex items-center gap-2">
        {(["7d", "30d", "90d", "all"] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              range === r
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {r === "7d" ? "7 Days" : r === "30d" ? "30 Days" : r === "90d" ? "90 Days" : "All Time"}
          </button>
        ))}
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          icon={BarChart3}
          label="Pageviews"
          value={hasData ? formatNumber(traffic.totalPageviews) : "--"}
        />
        <MetricCard
          icon={Users}
          label="Unique Visitors"
          value={hasData ? formatNumber(traffic.totalUniqueVisitors) : "--"}
        />
        <MetricCard
          icon={TrendingUp}
          label="Bounce Rate"
          value={hasData ? formatPercent(traffic.avgBounceRate) : "--"}
        />
        <MetricCard
          icon={Clock}
          label="Sessions"
          value={hasData ? formatNumber(traffic.totalSessions) : "--"}
        />
      </div>

      {!hasData && (
        <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/40 px-4 py-3">
          <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No traffic data recorded yet for this {range === "7d" ? "7-day" : range === "30d" ? "30-day" : range === "90d" ? "90-day" : ""} period.
            Data will appear once the tracking script captures pageviews.
          </p>
        </div>
      )}

      {hasData && (
        <>
          {/* Daily Trend Chart (bar chart using CSS) */}
          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-3 text-sm font-medium text-foreground">Daily Pageviews</h3>
            <div className="flex h-40 items-end gap-1">
              {traffic.dailyBreakdown.map((day) => {
                const maxPv = Math.max(
                  ...traffic.dailyBreakdown.map((d) => d.pageviews),
                  1,
                );
                const heightPct = (day.pageviews / maxPv) * 100;
                return (
                  <div
                    key={day.date}
                    className="group relative flex flex-1 flex-col items-center"
                  >
                    <div
                      className="w-full rounded-t bg-primary/70 transition-colors group-hover:bg-primary"
                      style={{ height: `${Math.max(heightPct, 2)}%` }}
                    />
                    {/* Tooltip on hover */}
                    <div className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 rounded bg-popover px-2 py-1 text-[10px] text-popover-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                      {day.date}: {day.pageviews}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>{traffic.dailyBreakdown[0]?.date ?? ""}</span>
              <span>
                {traffic.dailyBreakdown[traffic.dailyBreakdown.length - 1]?.date ?? ""}
              </span>
            </div>
          </div>

          {/* Referrers + Devices + Countries */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Top Referrers */}
            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                <ExternalLink className="h-3.5 w-3.5" />
                Top Referrers
              </h3>
              <div className="space-y-2">
                {traffic.topReferrers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No referrer data</p>
                ) : (
                  traffic.topReferrers.map((ref) => (
                    <div key={ref.domain} className="flex items-center justify-between text-xs">
                      <span className="truncate text-foreground">{ref.domain}</span>
                      <span className="text-muted-foreground">{formatNumber(ref.pageviews)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Device Breakdown */}
            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                <Monitor className="h-3.5 w-3.5" />
                Devices
              </h3>
              <div className="space-y-2">
                <DeviceRow
                  icon={Monitor}
                  label="Desktop"
                  count={traffic.deviceBreakdown.desktop}
                  total={traffic.totalPageviews}
                />
                <DeviceRow
                  icon={Smartphone}
                  label="Mobile"
                  count={traffic.deviceBreakdown.mobile}
                  total={traffic.totalPageviews}
                />
                <DeviceRow
                  icon={Tablet}
                  label="Tablet"
                  count={traffic.deviceBreakdown.tablet}
                  total={traffic.totalPageviews}
                />
              </div>
            </div>

            {/* Top Countries */}
            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                <Globe className="h-3.5 w-3.5" />
                Top Countries
              </h3>
              <div className="space-y-2">
                {traffic.topCountries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No country data</p>
                ) : (
                  traffic.topCountries.map((c) => (
                    <div key={c.country} className="flex items-center justify-between text-xs">
                      <span className="text-foreground">{c.country}</span>
                      <span className="text-muted-foreground">{formatNumber(c.pageviews)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <span className="text-2xl font-semibold text-foreground">{value}</span>
    </div>
  );
}

function DeviceRow({
  icon: Icon,
  label,
  count,
  total,
}: {
  icon: typeof Monitor;
  label: string;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3 w-3 text-muted-foreground" />
          <span className="text-foreground">{label}</span>
        </div>
        <span className="text-muted-foreground">
          {formatNumber(count)} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary/60"
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
    </div>
  );
}

function TrafficSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 w-16 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
```

- [ ] **Step 2: Replace post traffic tab placeholder**

Replace the entire contents of `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/$postId/traffic.lazy.tsx`:

```typescript
/**
 * Post Traffic Tab - Lazy-loaded component
 *
 * Renders the TrafficDashboard with real analytics data for this post.
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import type { Id } from "@backend/convex/_generated/dataModel";
import { TrafficDashboard } from "@/components/analytics/TrafficDashboard";

export const Route = createLazyFileRoute(
  "/_authenticated/_admin/posts/$postId/traffic",
)({
  component: TrafficTab,
});

function TrafficTab() {
  const { postId } = Route.useParams();
  return <TrafficDashboard postId={postId as Id<"posts">} />;
}
```

- [ ] **Step 3: Replace page traffic tab placeholder**

Replace the entire contents of `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/$pageId/traffic.lazy.tsx`:

```typescript
/**
 * Page Traffic Tab - Lazy-loaded component
 *
 * Renders the TrafficDashboard with real analytics data for this page.
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import type { Id } from "@backend/convex/_generated/dataModel";
import { TrafficDashboard } from "@/components/analytics/TrafficDashboard";

export const Route = createLazyFileRoute(
  "/_authenticated/_admin/pages/$pageId/traffic",
)({
  component: TrafficTab,
});

function TrafficTab() {
  const { pageId } = Route.useParams();
  return <TrafficDashboard postId={pageId as Id<"posts">} />;
}
```

**Commit:** `feat(analytics): wire real TrafficDashboard into post and page traffic tabs`

---

## Task 8: Wire Engagement Tab Dashboard

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/components/analytics/EngagementDashboard.tsx`
- Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/$postId/engagement.lazy.tsx`
- Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/$pageId/engagement.lazy.tsx`

Replace the placeholder "coming soon" engagement UI with a real dashboard that queries `getEngagementSummary`. Includes scroll depth funnel, time on page, and internal link clicks.

- [ ] **Step 1: Create shared EngagementDashboard component**

Create `ConvexPress-Admin/apps/web/src/components/analytics/EngagementDashboard.tsx`:

```typescript
/**
 * EngagementDashboard - Shared engagement analytics dashboard component.
 *
 * Used by both the post and page engagement tabs. Receives a postId and
 * renders scroll depth funnel, time on page, and internal link click metrics.
 */

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import {
  Activity,
  ArrowDownToLine,
  MousePointerClick,
  Target,
  Link as LinkIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Date Range Helpers ─────────────────────────────────────────────────────

type DateRange = "7d" | "30d" | "90d" | "all";

function getDateRange(range: DateRange): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);

  if (range === "all") {
    return { startDate: "2020-01-01", endDate };
  }

  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  return { startDate: start.toISOString().slice(0, 10), endDate };
}

function formatDuration(ms: number): string {
  if (ms === 0) return "--";
  const seconds = Math.round(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatPercent(n: number): string {
  return (n * 100).toFixed(0) + "%";
}

// Section labels for display
const SECTION_CONFIG: Array<{
  key: keyof ReturnType<typeof getDefaultScrollDepth>;
  label: string;
  shortLabel: string;
}> = [
  { key: "hero", label: "Hero / Title", shortLabel: "Hero" },
  { key: "topic1", label: "Topic 1", shortLabel: "T1" },
  { key: "topic2", label: "Topic 2", shortLabel: "T2" },
  { key: "topic3", label: "Topic 3", shortLabel: "T3" },
  { key: "topic4", label: "Topic 4", shortLabel: "T4" },
  { key: "topic5", label: "Topic 5", shortLabel: "T5" },
  { key: "summary", label: "Summary", shortLabel: "Sum" },
  { key: "sources", label: "Sources", shortLabel: "Src" },
  { key: "comments", label: "Comments", shortLabel: "Cmt" },
];

function getDefaultScrollDepth() {
  return {
    hero: 0,
    topic1: 0,
    topic2: 0,
    topic3: 0,
    topic4: 0,
    topic5: 0,
    summary: 0,
    sources: 0,
    comments: 0,
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

interface EngagementDashboardProps {
  postId: Id<"posts">;
}

export function EngagementDashboard({ postId }: EngagementDashboardProps) {
  const [range, setRange] = useState<DateRange>("30d");
  const { startDate, endDate } = useMemo(() => getDateRange(range), [range]);

  const engagement = useQuery(api.analytics.queries.getEngagementSummary, {
    postId,
    startDate,
    endDate,
  });

  // Loading state
  if (engagement === undefined) {
    return <EngagementSkeleton />;
  }

  // No data / no permission
  if (engagement === null) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">
          No engagement data available yet, or you do not have permission to view analytics.
        </p>
      </div>
    );
  }

  const hasData = engagement.avgTimeOnPage > 0 || engagement.totalInternalClicks > 0;

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="flex items-center gap-2">
        {(["7d", "30d", "90d", "all"] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              range === r
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {r === "7d" ? "7 Days" : r === "30d" ? "30 Days" : r === "90d" ? "90 Days" : "All Time"}
          </button>
        ))}
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          icon={Activity}
          label="Avg Time on Page"
          value={hasData ? formatDuration(engagement.avgTimeOnPage) : "--"}
        />
        <MetricCard
          icon={Target}
          label="Avg Engaged Time"
          value={hasData ? formatDuration(engagement.avgEngagedTime) : "--"}
        />
        <MetricCard
          icon={MousePointerClick}
          label="Internal Clicks"
          value={hasData ? String(engagement.totalInternalClicks) : "--"}
        />
        <MetricCard
          icon={ArrowDownToLine}
          label="Deepest Section"
          value={
            hasData
              ? getDeepestSection(engagement.scrollDepthDistribution)
              : "--"
          }
        />
      </div>

      {!hasData && (
        <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/40 px-4 py-3">
          <Target className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No engagement data recorded yet for this period. Data will appear
            once the tracking script captures scroll depth and click events.
          </p>
        </div>
      )}

      {hasData && (
        <>
          {/* Scroll Depth Funnel */}
          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
              <ArrowDownToLine className="h-3.5 w-3.5" />
              Section Scroll Depth
            </h3>
            <p className="mb-4 text-xs text-muted-foreground">
              Percentage of visitors who scrolled to each content section.
            </p>
            <div className="space-y-2">
              {SECTION_CONFIG.map(({ key, label }) => {
                const pct = engagement.scrollDepthDistribution[key] ?? 0;
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-foreground">{label}</span>
                      <span className="text-muted-foreground">{formatPercent(pct)}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/60 transition-all"
                        style={{ width: `${Math.max(pct * 100, 1)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Internal Link Clicks */}
          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
              <LinkIcon className="h-3.5 w-3.5" />
              Top Internal Link Clicks
            </h3>
            <div className="space-y-2">
              {engagement.topInternalLinks.length === 0 ? (
                <p className="text-xs text-muted-foreground">No internal link clicks recorded</p>
              ) : (
                engagement.topInternalLinks.map((link) => (
                  <div key={link.targetPath} className="flex items-center justify-between text-xs">
                    <span className="truncate text-foreground">{link.targetPath}</span>
                    <span className="text-muted-foreground">{link.clicks} clicks</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <span className="text-2xl font-semibold text-foreground">{value}</span>
    </div>
  );
}

function getDeepestSection(
  distribution: Record<string, number>,
): string {
  // Find the deepest section where >=50% of visitors reach
  const orderedKeys = [
    "hero",
    "topic1",
    "topic2",
    "topic3",
    "topic4",
    "topic5",
    "summary",
    "sources",
    "comments",
  ];
  const labels = [
    "Hero",
    "Topic 1",
    "Topic 2",
    "Topic 3",
    "Topic 4",
    "Topic 5",
    "Summary",
    "Sources",
    "Comments",
  ];

  let deepest = "Hero";
  for (let i = 0; i < orderedKeys.length; i++) {
    if ((distribution[orderedKeys[i]] ?? 0) >= 0.5) {
      deepest = labels[i];
    }
  }
  return deepest;
}

function EngagementSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 w-16 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
```

- [ ] **Step 2: Replace post engagement tab placeholder**

Replace the entire contents of `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/$postId/engagement.lazy.tsx`:

```typescript
/**
 * Post Engagement Tab - Lazy-loaded component
 *
 * Renders the EngagementDashboard with real analytics data for this post.
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import type { Id } from "@backend/convex/_generated/dataModel";
import { EngagementDashboard } from "@/components/analytics/EngagementDashboard";

export const Route = createLazyFileRoute(
  "/_authenticated/_admin/posts/$postId/engagement",
)({
  component: EngagementTab,
});

function EngagementTab() {
  const { postId } = Route.useParams();
  return <EngagementDashboard postId={postId as Id<"posts">} />;
}
```

- [ ] **Step 3: Replace page engagement tab placeholder**

Replace the entire contents of `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/$pageId/engagement.lazy.tsx`:

```typescript
/**
 * Page Engagement Tab - Lazy-loaded component
 *
 * Renders the EngagementDashboard with real analytics data for this page.
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import type { Id } from "@backend/convex/_generated/dataModel";
import { EngagementDashboard } from "@/components/analytics/EngagementDashboard";

export const Route = createLazyFileRoute(
  "/_authenticated/_admin/pages/$pageId/engagement",
)({
  component: EngagementTab,
});

function EngagementTab() {
  const { pageId } = Route.useParams();
  return <EngagementDashboard postId={pageId as Id<"posts">} />;
}
```

**Commit:** `feat(analytics): wire real EngagementDashboard into post and page engagement tabs`

---

## Task 9: Create Website Tracking Script

**Files:**
- Create: `ConvexPress-Website/apps/web/src/lib/analytics/tracker.ts`

A lightweight (~2KB minified) tracking module that runs on every public page. Tracks pageviews, section-level scroll depth via IntersectionObserver, internal link clicks, and time on page. Batches events and sends them to the Convex HTTP endpoint. No cookies, no PII, respects Do Not Track.

- [ ] **Step 1: Create the tracker module**

Create `ConvexPress-Website/apps/web/src/lib/analytics/tracker.ts`:

```typescript
/**
 * ConvexPress Analytics Tracker
 *
 * Lightweight client-side tracking script (~2KB minified + gzipped).
 * Fires events to the /api/analytics/track HTTP endpoint on the Convex backend.
 *
 * Tracks:
 *   - pageview: on page load
 *   - scroll_depth: when content sections enter the viewport (IntersectionObserver)
 *   - click: on internal link clicks (delegated handler)
 *   - exit: on page hide/unload (time on page via sendBeacon)
 *
 * Privacy:
 *   - visitorId: anonymous UUID in localStorage (no cookie)
 *   - sessionId: random UUID in sessionStorage (dies on tab close)
 *   - Respects navigator.doNotTrack === "1"
 *   - User agent sent to server for parsing; raw UA string is never stored
 *   - No fingerprinting, no cross-site tracking, no PII
 */

// ─── Types ──────────────────────────────────────────────────────────────────

interface TrackingEvent {
  eventType: "pageview" | "scroll_depth" | "click" | "exit";
  path: string;
  visitorId: string;
  sessionId: string;
  timestamp: number;
  referrer?: string;
  userAgent?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  payload?: {
    section?: string;
    sectionIndex?: number;
    maxSections?: number;
    targetPath?: string;
    targetLabel?: string;
    timeOnPageMs?: number;
    engagedTimeMs?: number;
  };
}

// ─── ID Generation ──────────────────────────────────────────────────────────

function generateId(): string {
  // Crypto.randomUUID is available in all modern browsers
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getVisitorId(): string {
  const key = "_cp_vid";
  let id = localStorage.getItem(key);
  if (!id) {
    id = generateId();
    localStorage.setItem(key, id);
  }
  return id;
}

function getSessionId(): string {
  const key = "_cp_sid";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = generateId();
    sessionStorage.setItem(key, id);
  }
  return id;
}

// ─── UTM Extraction ─────────────────────────────────────────────────────────

function getUtmParams(): {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
} {
  const params = new URLSearchParams(window.location.search);
  return {
    utmSource: params.get("utm_source") ?? undefined,
    utmMedium: params.get("utm_medium") ?? undefined,
    utmCampaign: params.get("utm_campaign") ?? undefined,
  };
}

// ─── Event Queue ────────────────────────────────────────────────────────────

let eventQueue: TrackingEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let endpointUrl = "";

function queueEvent(event: TrackingEvent) {
  eventQueue.push(event);

  // Flush after 2 seconds or when queue reaches 10 events
  if (eventQueue.length >= 10) {
    flush();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flush, 2000);
  }
}

function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (eventQueue.length === 0 || !endpointUrl) return;

  const events = eventQueue.splice(0, 20); // Max 20 per request
  const payload = JSON.stringify({ events });

  // Prefer sendBeacon for reliability (works during page unload)
  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: "application/json" });
    const sent = navigator.sendBeacon(endpointUrl, blob);
    if (!sent) {
      // Fallback to fetch if sendBeacon fails
      fetchSend(payload);
    }
  } else {
    fetchSend(payload);
  }
}

function fetchSend(payload: string) {
  fetch(endpointUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // Silently ignore network errors -- analytics should never break the site
  });
}

// ─── Scroll Depth Tracking ──────────────────────────────────────────────────

let deepestSectionIndex = -1;
let scrollObserver: IntersectionObserver | null = null;

function setupScrollTracking(visitorId: string, sessionId: string) {
  const sentinels = document.querySelectorAll("[data-analytics-section]");
  if (sentinels.length === 0) return;

  const sectionOrder = Array.from(sentinels).map((el) =>
    (el as HTMLElement).dataset.analyticsSection!,
  );

  scrollObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;

        const section = (entry.target as HTMLElement).dataset.analyticsSection!;
        const index = sectionOrder.indexOf(section);

        if (index > deepestSectionIndex) {
          deepestSectionIndex = index;
          queueEvent({
            eventType: "scroll_depth",
            path: window.location.pathname,
            visitorId,
            sessionId,
            timestamp: Date.now(),
            payload: {
              section,
              sectionIndex: index,
              maxSections: sectionOrder.length,
            },
          });
        }
      }
    },
    { threshold: 0.5 },
  );

  sentinels.forEach((el) => scrollObserver!.observe(el));
}

// ─── Click Tracking ─────────────────────────────────────────────────────────

function setupClickTracking(visitorId: string, sessionId: string) {
  document.addEventListener("click", (e) => {
    const anchor = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
    if (!anchor) return;

    const href = anchor.getAttribute("href");
    if (!href) return;

    // Only track internal links (same origin or relative)
    try {
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return;

      queueEvent({
        eventType: "click",
        path: window.location.pathname,
        visitorId,
        sessionId,
        timestamp: Date.now(),
        payload: {
          targetPath: url.pathname,
          targetLabel: (anchor.textContent ?? anchor.getAttribute("aria-label") ?? "").trim().slice(0, 100),
        },
      });
    } catch {
      // Invalid URL, skip
    }
  });
}

// ─── Time on Page Tracking ──────────────────────────────────────────────────

let pageLoadTime = 0;
let engagedTime = 0;
let lastVisibleTime = 0;
let isPageVisible = true;

function setupTimeTracking(visitorId: string, sessionId: string) {
  pageLoadTime = Date.now();
  lastVisibleTime = pageLoadTime;
  isPageVisible = true;

  // Track visibility changes to compute engaged time
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (isPageVisible) {
        engagedTime += Date.now() - lastVisibleTime;
        isPageVisible = false;
      }
      // Fire exit event when page becomes hidden
      sendExitEvent(visitorId, sessionId);
    } else {
      lastVisibleTime = Date.now();
      isPageVisible = true;
    }
  });

  // Also send on beforeunload as a fallback
  window.addEventListener("beforeunload", () => {
    sendExitEvent(visitorId, sessionId);
  });
}

function sendExitEvent(visitorId: string, sessionId: string) {
  const now = Date.now();
  const totalTime = now - pageLoadTime;
  const totalEngaged = engagedTime + (isPageVisible ? now - lastVisibleTime : 0);

  // Add exit event directly to queue and flush immediately
  eventQueue.push({
    eventType: "exit",
    path: window.location.pathname,
    visitorId,
    sessionId,
    timestamp: now,
    payload: {
      timeOnPageMs: totalTime,
      engagedTimeMs: totalEngaged,
    },
  });

  flush();
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Initialize the analytics tracker.
 *
 * @param convexUrl - The Convex deployment URL (e.g., "https://xxx.convex.cloud")
 *                    The tracking endpoint will be `${convexUrl}/api/analytics/track`
 */
export function initAnalytics(convexUrl: string): void {
  // Respect Do Not Track
  if (navigator.doNotTrack === "1") return;

  // Set endpoint
  endpointUrl = convexUrl.replace(/\/$/, "") + "/api/analytics/track";

  // Get or create anonymous IDs
  const visitorId = getVisitorId();
  const sessionId = getSessionId();

  // Extract UTM params from URL
  const utm = getUtmParams();

  // Fire pageview event
  queueEvent({
    eventType: "pageview",
    path: window.location.pathname,
    visitorId,
    sessionId,
    timestamp: Date.now(),
    referrer: document.referrer || undefined,
    userAgent: navigator.userAgent,
    ...utm,
  });

  // Setup tracking
  setupScrollTracking(visitorId, sessionId);
  setupClickTracking(visitorId, sessionId);
  setupTimeTracking(visitorId, sessionId);
}

/**
 * Track a client-side navigation (for SPAs using TanStack Router).
 * Call this on route change to fire a new pageview event.
 */
export function trackPageview(): void {
  if (navigator.doNotTrack === "1") return;
  if (!endpointUrl) return;

  const visitorId = getVisitorId();
  const sessionId = getSessionId();

  // Reset scroll tracking for new page
  deepestSectionIndex = -1;
  if (scrollObserver) {
    scrollObserver.disconnect();
    scrollObserver = null;
  }

  // Reset time tracking
  pageLoadTime = Date.now();
  engagedTime = 0;
  lastVisibleTime = Date.now();
  isPageVisible = true;

  // Fire pageview
  queueEvent({
    eventType: "pageview",
    path: window.location.pathname,
    visitorId,
    sessionId,
    timestamp: Date.now(),
    userAgent: navigator.userAgent,
  });

  // Re-setup scroll tracking for new page content (slight delay for DOM render)
  setTimeout(() => {
    setupScrollTracking(visitorId, sessionId);
  }, 100);
}

/**
 * Clean up the tracker (disconnect observers, clear timers).
 */
export function destroyAnalytics(): void {
  if (scrollObserver) {
    scrollObserver.disconnect();
    scrollObserver = null;
  }
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flush(); // Final flush
}
```

**Commit:** `feat(analytics): create lightweight website tracking script (~2KB)`

---

## Task 10: Inject Tracking Script in Website

**Files:**
- Create: `ConvexPress-Website/apps/web/src/components/analytics/AnalyticsProvider.tsx`
- Modify: `ConvexPress-Website/apps/web/src/routes/_marketing.tsx`

Add the tracker to the website's marketing layout so it runs on every public page. The `AnalyticsProvider` React component initializes the tracker on mount and tracks client-side navigations.

- [ ] **Step 1: Create the AnalyticsProvider component**

Create `ConvexPress-Website/apps/web/src/components/analytics/AnalyticsProvider.tsx`:

```typescript
/**
 * AnalyticsProvider - Initializes the ConvexPress analytics tracker.
 *
 * Placed in the marketing layout to track all public pages.
 * Initializes the tracker on mount and tracks client-side navigations
 * via TanStack Router's useLocation hook.
 *
 * The VITE_CONVEX_URL environment variable provides the Convex deployment
 * URL, which is used to construct the tracking endpoint URL.
 */

import { useEffect, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import {
  initAnalytics,
  trackPageview,
  destroyAnalytics,
} from "@/lib/analytics/tracker";

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string;

export function AnalyticsProvider() {
  const location = useLocation();
  const initializedRef = useRef(false);
  const prevPathRef = useRef<string>("");

  // Initialize tracker on mount
  useEffect(() => {
    if (!CONVEX_URL || initializedRef.current) return;
    initAnalytics(CONVEX_URL);
    initializedRef.current = true;
    prevPathRef.current = location.pathname;

    return () => {
      destroyAnalytics();
      initializedRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Track client-side navigations
  useEffect(() => {
    if (!initializedRef.current) return;
    if (location.pathname === prevPathRef.current) return;
    prevPathRef.current = location.pathname;
    trackPageview();
  }, [location.pathname]);

  // This component renders nothing
  return null;
}
```

- [ ] **Step 2: Add AnalyticsProvider to the marketing layout**

Modify `ConvexPress-Website/apps/web/src/routes/_marketing.tsx`. Add the import and render the component.

Add this import near the top of the file:

```typescript
import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
```

Inside the `MarketingLayoutInner` function, add `<AnalyticsProvider />` right after the opening `<>` fragment:

```tsx
function MarketingLayoutInner() {
  // ... existing code ...

  return (
    <>
      <AnalyticsProvider />
      <ThemeStyleInjector />
      {/* ... rest of existing layout ... */}
    </>
  );
}
```

This ensures the tracker initializes once when the marketing layout mounts and tracks all subsequent navigations within the marketing section.

- [ ] **Step 3: Verify** -- Start the website dev server (`cd /Users/worsin/Development/ConvexPress/ConvexPress-Website && bun dev`) and open a page. Confirm in the browser's Network tab that a POST request is made to `/api/analytics/track` on the Convex backend URL with a pageview event in the payload. If the Convex backend is not running yet, the request will 404 -- that is expected and fine for this step.

**Commit:** `feat(analytics): inject tracking script into website marketing layout`

---

## Task Dependency Graph

```
Task 1 (Schema)
  |
  v
Task 2 (Validators) ───────────────┐
  |                                 |
  v                                 v
Task 3 (Mutations)            Task 6 (Internals + Crons)
                                    |
                                    v
                              Task 4 (HTTP Endpoint)
                                    |
                                    v
                              Task 5 (Queries)
                                    |
                          ┌─────────┴─────────┐
                          v                   v
                    Task 7 (Traffic Tab) Task 8 (Engagement Tab)
                          |                   |
                          └─────────┬─────────┘
                                    v
                              Task 9 (Tracking Script)
                                    |
                                    v
                              Task 10 (Inject in Website)
```

**Parallel execution opportunities:**
- Tasks 3 and 6 can run in parallel (both depend on Task 2)
- Tasks 7 and 8 can run in parallel (both depend on Task 5)
- Task 9 can run in parallel with Tasks 7/8 (depends only on Task 4's endpoint URL)

---

## Post-Implementation: Deploy

After all tasks are complete, run the Convex deployment:

```bash
cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend
npx convex deploy --typecheck=disable
```

This deploys the schema, all functions, HTTP routes, and cron jobs in one shot. Use `--typecheck=disable` during incremental development per the project conventions.

---

## Post-Implementation: Wire Tab Badges

After the analytics queries are live, the `PostDetailLayout` component should be updated to show real badge data instead of `--` placeholders. The Traffic tab badge should show `views7d` from `getTabBadges`, and the Engagement tab badge should show `avgTimeOnPage` formatted as `mm:ss`. This is a small follow-up change to the `PostDetailLayout.tsx` component created by the Tabbed Editor Shell plan -- update the `tabs` memo to call `useQuery(api.analytics.queries.getTabBadges, { postId })` and render the results.

This is intentionally left as a follow-up task rather than included in this plan, because it modifies a file owned by the Tabbed Editor Shell and should be coordinated with that expert.
