# Audit Log System - Expert Knowledge Document

**System:** Audit Log System
**Status:** Complete (100%)
**Priority:** P2 - Medium
**Complexity:** Medium
**Category:** Admin & Operations
**Layer:** Backend
**WordPress Equivalent:** WP Activity Log plugin (200,000+ installs), Simple History, Stream
**Last Analyzed:** 2026-02-13

---

## Quick Reference

### What This System Does

The Audit Log System provides an immutable, searchable record of every action taken within ConvexPress. It answers four questions: **who** did it, **what** was done, **when** it happened, and **where** in the system it occurred. This is the ConvexPress equivalent of the WP Activity Log plugin -- WordPress has no built-in audit log; ConvexPress makes it a first-class system.

Unlike most systems that maintain their own Convex table independently, the Audit Log is a **view layer** over the `events` table owned by the Event Dispatcher System, enriched with human-readable descriptions, severity classifications, and actor context via its own `auditEntries` table.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **auditEntries** | Enrichment table -- references an event and adds human-readable descriptions, severity, actor snapshot, object labels |
| **Global Wildcard Listener** | Single `*` listener registered in Event Dispatcher that captures all 63 CMS events |
| **Severity Levels** | critical, high, medium, low, informational (5 levels, mapped from WordPress's 6) |
| **Object Types** | post, page, comment, media, user, role, taxonomy, menu, settings, seo, api, notification, system |
| **Actor Snapshot** | Name, email, role stored at action time (immutable even if user changes later) |
| **Immutability** | Audit entries are append-only. No update mutation exists. Only retention cleanup or manual clear can remove. |
| **Priority 99** | Audit handler runs last among all event listeners |
| **Deduplication** | `by_event` index prevents duplicate entries when events are retried |
| **Correlation** | `correlationId` groups bulk operations for display |

### ConvexPress vs WordPress (WP Activity Log)

| Aspect | WordPress (WP Activity Log) | ConvexPress |
|--------|---------------------------|-------------|
| **Architecture** | Separate plugin table (`wp_wsal_occurrences`) | `auditEntries` enrichment + shared `events` table |
| **Event Capture** | Hook into `do_action()` per event | Global wildcard listener `*` |
| **Data Model** | Flat log rows + metadata table | Rich typed event payloads with per-event schemas |
| **Reactivity** | Page refresh required | Real-time Convex subscriptions |
| **Immutability** | Plugin data can be deleted by admins | Append-only; clear actions are self-audited |
| **Performance** | Custom MySQL queries, often slow | Convex indexes optimized for time-range, actor, system filtering |
| **Export** | CSV (JSON in premium) | CSV + JSON, both free |
| **Severity** | 6 levels (includes Debug) | 5 levels (no Debug -- not needed in production audit) |
| **Search** | Premium-only full-text | Built-in free-text search |
| **Alerting** | Email alerts for critical (premium) | Handled by Email/Site Notification Systems (separation of concerns) |
| **Paper Trail** | Can be disabled/deleted | Self-auditing (clear actions create permanent entries) |

---

## Architecture Overview

### Data Flow

```
User Action
    |
    v
System Mutation (e.g., post.publish)
    |
    v
Event Dispatcher emits event (writes to `events` table)
    |
    v
Event Dispatcher dispatches to listeners
    |
    v  (priority: 99 -- runs LAST)
Audit Log handler `onAnyEvent`:
  1. Dedup check (by_event index)
  2. Parse event payload
  3. Resolve actor (name, email, role from users table)
  4. Classify severity (SEVERITY_MAP)
  5. Derive objectType (SYSTEM_TO_OBJECT_TYPE)
  6. Extract objectId + objectLabel (OBJECT_EXTRACTORS)
  7. Generate description (DESCRIPTION_TEMPLATES)
  8. Insert auditEntries record
    |
    v
Convex subscription notifies admin UI (real-time)
```

### Relationship to Events Table

```
events (owned by Event Dispatcher)          auditEntries (owned by Audit Log)
+----------------------------------+       +----------------------------------+
| _id                              |<------| eventId (FK)                     |
| code: "post.published"           |       | eventCode: "post.published"      |
| system: "post"                   |       | description: "Published post..." |
| payload: '{"postId":"abc",...}'  |       | severity: "medium"               |
| actorId: "user_xyz"             |       | actorName: "John Smith"          |
| status: "completed"             |       | actorRole: "editor"              |
| emittedAt: 1707350400000        |       | objectType: "post"               |
|                                  |       | objectId: "abc"                  |
+----------------------------------+       | objectLabel: "Hello World"       |
                                           | occurredAt: 1707350400000        |
                                           +----------------------------------+
```

### Real-Time Behavior

- **Activity Log page** (`/admin/activity`): Convex subscription on `auditLog.list` -- new entries appear at the top in real-time without page refresh. A subtle highlight animation marks new entries.
- **Audit Log page** (`/admin/audit-log`): Same reactive behavior with an optional "Pause live updates" toggle for reviewing historical data.
- **Concurrent operations**: If one admin views the log while another clears old entries, deleted entries disappear automatically via Convex subscription.

### Authentication & Authorization

- **Auth Provider:** Convex Auth
- **All routes/queries/mutations** require authenticated user via `ctx.auth.getUserIdentity()`
- **Three capabilities** (all Administrator-only):
  - `view_audit_log` -- View audit log pages, list entries, view details
  - `export_audit_log` -- Export audit log to CSV/JSON
  - `manage_audit_log` -- Clear old entries

---

## Database Schema

### `auditEntries` Table

```typescript
// convex/schema.ts (additions for Audit Log System)

import { defineTable } from "convex/server";
import { v } from "convex/values";

// Severity levels matching WP Activity Log conventions
const auditSeverity = v.union(
  v.literal("critical"),      // Security breaches, unauthorized access
  v.literal("high"),          // Role changes, settings, deletions
  v.literal("medium"),        // Publishing, registration, password changes
  v.literal("low"),           // Edits, updates, uploads
  v.literal("informational"), // Logins, logouts, routine actions
);

// Object type categories for filtering
const auditObjectType = v.union(
  v.literal("post"),
  v.literal("page"),
  v.literal("comment"),
  v.literal("media"),
  v.literal("user"),
  v.literal("role"),
  v.literal("taxonomy"),
  v.literal("menu"),
  v.literal("settings"),
  v.literal("seo"),
  v.literal("api"),
  v.literal("notification"),
  v.literal("system"),
);

// --- Audit Entries Table ---
auditEntries: defineTable({
  // --- Event Reference ---
  eventId: v.id("events"),                           // Reference to the source event
  eventCode: v.string(),                             // Denormalized for filtering (e.g., "post.published")

  // --- Actor Context ---
  actorId: v.optional(v.string()),                   // user identifier (denormalized from event)
  actorName: v.optional(v.string()),                 // Resolved display name at time of action
  actorEmail: v.optional(v.string()),                // Resolved email at time of action
  actorRole: v.optional(v.string()),                 // User's role at time of action
  actorIp: v.optional(v.string()),                   // IP address (when available)
  actorUserAgent: v.optional(v.string()),            // Browser/client user agent string

  // --- Action Description ---
  description: v.string(),                           // Human-readable description
  severity: auditSeverity,                           // Severity classification

  // --- Object Context ---
  objectType: auditObjectType,                       // What type of object was affected
  objectId: v.optional(v.string()),                  // ID of the affected object
  objectLabel: v.optional(v.string()),               // Human-readable label (post title, user email, etc.)

  // --- Change Details ---
  changes: v.optional(v.string()),                   // JSON: array of { field, oldValue, newValue }
  rawPayload: v.string(),                            // Full event payload (JSON string)

  // --- Grouping ---
  correlationId: v.optional(v.string()),             // For grouping bulk operations
  sessionId: v.optional(v.string()),                 // Groups actions in a single user session

  // --- Timestamps ---
  occurredAt: v.number(),                            // When the action occurred (from event.emittedAt)

  // --- Retention ---
  expiresAt: v.optional(v.number()),                 // When to auto-delete (mirrors event retention)
})
  .index("by_occurred", ["occurredAt"])                              // Chronological listing (primary view)
  .index("by_actor", ["actorId", "occurredAt"])                      // Filter by user + time
  .index("by_severity", ["severity", "occurredAt"])                  // Filter by severity + time
  .index("by_object_type", ["objectType", "occurredAt"])             // Filter by object type + time
  .index("by_event_code", ["eventCode", "occurredAt"])               // Filter by specific event code + time
  .index("by_object", ["objectType", "objectId", "occurredAt"])      // History for a specific object
  .index("by_correlation", ["correlationId"])                        // Grouped bulk operations
  .index("by_expires", ["expiresAt"])                                // Retention cleanup
  .index("by_event", ["eventId"]),                                   // Lookup by source event (dedup)
```

### Field Specifications

| Field | Type | Required | Max Length | Validation |
|-------|------|----------|-----------|------------|
| `eventId` | `Id<"events">` | Yes | -- | Valid reference. Unique (one audit entry per event). |
| `eventCode` | `string` | Yes | 100 | Denormalized from event. Pattern: `system.action` |
| `actorId` | `string` | No | -- | user identifier. Undefined for system-generated events. |
| `actorName` | `string` | No | 200 | Display name from the auth system at action time (immutable snapshot). |
| `actorEmail` | `string` | No | 254 | Email from the auth system at action time. |
| `actorRole` | `string` | No | 50 | Role slug at action time (e.g., "administrator"). |
| `actorIp` | `string` | No | 45 | IPv4 or IPv6. Only for auth-related events. |
| `actorUserAgent` | `string` | No | 500 | Browser/client UA string. |
| `description` | `string` | Yes | 500 | Human-readable action summary. |
| `severity` | `enum` | Yes | -- | critical/high/medium/low/informational |
| `objectType` | `enum` | Yes | -- | post/page/comment/media/user/role/taxonomy/menu/settings/seo/api/notification/system |
| `objectId` | `string` | No | 100 | ID of the primary object affected. |
| `objectLabel` | `string` | No | 300 | Human-readable label (post title, etc.). Stored at action time. |
| `changes` | `string` | No | 50KB | JSON array of `{ field, oldValue, newValue }`. Only for updates. |
| `rawPayload` | `string` | Yes | 100KB | Full event payload JSON string. |
| `correlationId` | `string` | No | -- | UUID linking bulk operation entries. |
| `sessionId` | `string` | No | -- | User session identifier. |
| `occurredAt` | `number` | Yes | -- | Unix timestamp (ms). Immutable. |
| `expiresAt` | `number` | No | -- | Retention timestamp. Mirrors event's expiresAt. |

### Indexes

| Index Name | Fields | Purpose |
|-----------|--------|---------|
| `by_occurred` | `[occurredAt]` | Default chronological listing (primary view) |
| `by_actor` | `[actorId, occurredAt]` | "Show me everything John did" |
| `by_severity` | `[severity, occurredAt]` | "Show me all critical events" |
| `by_object_type` | `[objectType, occurredAt]` | "Show me all post-related entries" |
| `by_event_code` | `[eventCode, occurredAt]` | "Show me all post.published events" |
| `by_object` | `[objectType, objectId, occurredAt]` | "Show me history of this specific post" |
| `by_correlation` | `[correlationId]` | "Show me all entries from this bulk delete" |
| `by_expires` | `[expiresAt]` | Retention cleanup: find expired entries |
| `by_event` | `[eventId]` | Dedup: prevent duplicate entries per event |

### Relationships

- **`eventId`** -> `events._id` (owned by Event Dispatcher System)
- **`actorId`** -> user identifier (resolved from `users` table at write time)
- No other system tables reference `auditEntries` -- this is a terminal consumer.

---

## Actions & Functions

### Queries

#### `auditLog.list` - List Audit Entries

- **Airtable Action:** `audit.view` (`[redacted-airtable-record-id]`)
- **Type:** query
- **File:** `convex/auditLog/queries.ts`
- **Auth:** Required
- **Capabilities:** `view_audit_log` (Administrator only)
- **Args:**
  ```typescript
  {
    // Filters
    actorId: v.optional(v.string()),
    severity: v.optional(auditSeverity),
    objectType: v.optional(auditObjectType),
    eventCode: v.optional(v.string()),
    objectId: v.optional(v.string()),
    search: v.optional(v.string()),
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
    correlationId: v.optional(v.string()),
    // Pagination
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),          // Default: 50, max: 200
    direction: v.optional(v.union(
      v.literal("newer"),
      v.literal("older"),
    )),                                      // Default: "older"
  }
  ```
- **Returns:**
  ```typescript
  {
    entries: Array<{
      _id: Id<"auditEntries">,
      eventId: Id<"events">,
      eventCode: string,
      actorId?: string,
      actorName?: string,
      actorEmail?: string,
      actorRole?: string,
      actorIp?: string,
      description: string,
      severity: AuditSeverity,
      objectType: AuditObjectType,
      objectId?: string,
      objectLabel?: string,
      correlationId?: string,
      occurredAt: number,
    }>,
    nextCursor?: string,
    prevCursor?: string,
    totalEstimate: number,
  }
  ```
- **Behavior:**
  1. Authenticate user via auth identity.
  2. Check capability: `view_audit_log`.
  3. Select index based on filters:
     - `actorId` set -> `by_actor` index
     - `severity` set -> `by_severity` index
     - `objectType` set (without `objectId`) -> `by_object_type` index
     - `objectType` + `objectId` set -> `by_object` index
     - `eventCode` set -> `by_event_code` index
     - `correlationId` set -> `by_correlation` index
     - Default -> `by_occurred` index
  4. Apply date range filter (`dateFrom`, `dateTo`) as secondary filter on `occurredAt`.
  5. Apply free-text `search` as post-filter on `description` and `objectLabel` (case-insensitive substring).
  6. Cursor-based pagination: start from cursor record's `occurredAt`.
  7. Fetch `limit + 1` to detect next page.
  8. Return newest-first by default.
- **Errors:**
  - `UNAUTHORIZED`: Not authenticated
  - `FORBIDDEN`: Lacks `view_audit_log`
  - `VALIDATION_ERROR`: Invalid cursor format
  - `VALIDATION_ERROR`: Limit exceeds 200

#### `auditLog.get` - Get Single Entry Detail

- **Type:** query
- **File:** `convex/auditLog/queries.ts`
- **Auth:** Required
- **Capabilities:** `view_audit_log`
- **Args:**
  ```typescript
  { entryId: v.id("auditEntries") }
  ```
- **Returns:**
  ```typescript
  {
    _id: Id<"auditEntries">,
    eventId: Id<"events">,
    eventCode: string,
    description: string,
    severity: AuditSeverity,
    objectType: AuditObjectType,
    objectId?: string,
    objectLabel?: string,
    occurredAt: number,
    actor: {
      id?: string,
      name?: string,
      email?: string,
      role?: string,
      ip?: string,
      userAgent?: string,
    },
    changes?: Array<{ field: string, oldValue: any, newValue: any }>,
    rawPayload: Record<string, any>,
    event: {
      status: EventStatus,
      listenersTotal: number,
      listenersCompleted: number,
      listenersFailed: number,
      processedAt?: number,
    },
    relatedEntries?: Array<{
      _id: Id<"auditEntries">,
      eventCode: string,
      description: string,
      occurredAt: number,
    }>,
  }
  ```
- **Behavior:**
  1. Authenticate and check `view_audit_log`.
  2. Fetch audit entry by ID.
  3. Fetch linked event record from `events` table for processing metadata.
  4. Parse `rawPayload` JSON.
  5. Parse `changes` JSON if present.
  6. If entry has `correlationId`, fetch up to 20 related entries from `by_correlation` index.
  7. Return full detail record.
- **Errors:**
  - `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`

#### `auditLog.getObjectHistory` - Object Audit History

- **Type:** query
- **File:** `convex/auditLog/queries.ts`
- **Auth:** Required
- **Capabilities:** `view_audit_log`
- **Args:**
  ```typescript
  {
    objectType: auditObjectType,
    objectId: v.string(),
    limit: v.optional(v.number()),     // Default: 25
  }
  ```
- **Returns:**
  ```typescript
  {
    entries: Array<{
      _id: Id<"auditEntries">,
      eventCode: string,
      description: string,
      severity: AuditSeverity,
      actorName?: string,
      occurredAt: number,
    }>,
  }
  ```
- **Behavior:**
  1. Authenticate and check `view_audit_log`.
  2. Query using `by_object` index with `objectType` + `objectId`.
  3. Return sorted by `occurredAt` descending, limited to `limit`.
- **Usage:** "History" tab on post editor, user profile, etc.

#### `auditLog.getStats` - Audit Log Statistics

- **Type:** query
- **File:** `convex/auditLog/queries.ts`
- **Auth:** Required
- **Capabilities:** `view_audit_log`
- **Args:**
  ```typescript
  {
    period: v.optional(v.union(
      v.literal("today"),
      v.literal("week"),
      v.literal("month"),
    )),                                // Default: "today"
  }
  ```
- **Returns:**
  ```typescript
  {
    total: number,
    bySeverity: {
      critical: number,
      high: number,
      medium: number,
      low: number,
      informational: number,
    },
    byObjectType: Record<string, number>,
    topActors: Array<{ actorId: string, actorName: string, count: number }>,
    recentCritical: Array<{
      _id: Id<"auditEntries">,
      description: string,
      severity: AuditSeverity,
      actorName?: string,
      occurredAt: number,
    }>,
  }
  ```
- **Behavior:**
  1. Authenticate and check `view_audit_log`.
  2. Calculate period start timestamp.
  3. Query `by_occurred` index within time range.
  4. Aggregate by severity and object type.
  5. Calculate top actors by `actorId` grouping.
  6. Fetch last 5 critical/high entries.
- **Usage:** Dashboard widget + stats bar on audit log page.

### Mutations

#### `auditLog.clear` - Clear Old Entries

- **Airtable Action:** `audit.clear` (`[redacted-airtable-record-id]`)
- **Type:** mutation
- **File:** `convex/auditLog/mutations.ts`
- **Auth:** Required
- **Capabilities:** `manage_audit_log` (Administrator only)
- **Args:**
  ```typescript
  {
    mode: v.union(
      v.literal("before_date"),
      v.literal("by_severity"),
      v.literal("expired"),
    ),
    beforeDate: v.optional(v.number()),    // Required if mode "before_date"
    severity: v.optional(auditSeverity),   // Required if mode "by_severity"
    dryRun: v.optional(v.boolean()),       // Default: false
    confirmPhrase: v.optional(v.string()), // Must be "CONFIRM DELETE"
  }
  ```
- **Returns:**
  ```typescript
  {
    deletedCount: number,
    oldestRemaining?: number,
    isDryRun: boolean,
  }
  ```
- **Behavior:**
  1. Authenticate and check `manage_audit_log`.
  2. Validate:
     - `before_date` mode: `beforeDate` required, must be at least 30 days in the past.
     - `by_severity` mode: `severity` required. Only `informational` and `low` can be cleared.
     - `expired` mode: uses `by_expires` index.
  3. If `dryRun=true`: count and return without deleting.
  4. If `dryRun=false`:
     - Require `confirmPhrase === "CONFIRM DELETE"`.
     - Delete in batches of 100.
     - Schedule continuation via `ctx.scheduler.runAfter(0, ...)` if more remain.
  5. Emit `audit.cleared` event.
- **Events:** `audit.cleared`
- **Errors:**
  - `UNAUTHORIZED`, `FORBIDDEN`
  - `VALIDATION_ERROR`: Missing required field for mode
  - `VALIDATION_ERROR`: `beforeDate` less than 30 days ago
  - `VALIDATION_ERROR`: Attempting to clear critical/high/medium severity
  - `VALIDATION_ERROR`: `confirmPhrase` mismatch

### Actions

#### `auditLog.export` - Export Audit Log

- **Airtable Action:** `audit.export` (`[redacted-airtable-record-id]`)
- **Type:** action (file generation)
- **File:** `convex/auditLog/actions.ts`
- **Auth:** Required
- **Capabilities:** `export_audit_log` (Administrator only)
- **Args:**
  ```typescript
  {
    actorId: v.optional(v.string()),
    severity: v.optional(auditSeverity),
    objectType: v.optional(auditObjectType),
    eventCode: v.optional(v.string()),
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
    format: v.union(v.literal("csv"), v.literal("json")),
    maxRecords: v.optional(v.number()),       // Default: 10000, max: 50000
    includePayload: v.optional(v.boolean()),  // Default: false
  }
  ```
- **Returns:**
  ```typescript
  {
    url: string,           // Convex storage URL
    fileName: string,      // e.g., "audit-log-2026-02-08.csv"
    recordCount: number,
    fileSize: number,
  }
  ```
- **Behavior:**
  1. Authenticate and check `export_audit_log`.
  2. Query entries with filters, streaming in batches of 500.
  3. CSV columns: `Timestamp, Event Code, Severity, Actor Name, Actor Email, Actor Role, Actor IP, Description, Object Type, Object ID, Object Label, Changes, Payload (optional)`
  4. JSON: array of objects matching same fields.
  5. Upload to Convex storage via `ctx.storage.store()`.
  6. Emit `audit.exported` event.
  7. Return download URL via `ctx.storage.getUrl()`.
- **Events:** `audit.exported`
- **Errors:**
  - `UNAUTHORIZED`, `FORBIDDEN`
  - `VALIDATION_ERROR`: `maxRecords` exceeds 50,000
  - `VALIDATION_ERROR`: `dateFrom` after `dateTo`
  - `EXPORT_EMPTY`: No records match filters

### Internal Functions

#### `internal.auditLog.onEvent` - Global Event Listener Handler

- **Type:** Internal mutation
- **File:** `convex/auditLog/handlers.ts`
- **Registration:** Global wildcard listener `*` at priority 99
- **Input:** Event object from Event Dispatcher
- **Behavior:**
  1. Dedup check via `by_event` index.
  2. Parse event payload JSON.
  3. Resolve actor from users table (name, email, role).
  4. Classify severity via `SEVERITY_MAP`.
  5. Derive objectType via `SYSTEM_TO_OBJECT_TYPE`.
  6. Extract objectId + objectLabel via `OBJECT_EXTRACTORS`.
  7. Generate description via `DESCRIPTION_TEMPLATES`.
  8. Extract changes from payload if present.
  9. Insert `auditEntries` record.

#### `internal.auditLog.cleanup` - Retention Cleanup

- **Type:** Cron function (daily)
- **File:** `convex/crons/auditLogCleanup.ts`
- **Behavior:**
  1. Query `by_expires` index for `expiresAt < Date.now()`.
  2. Delete in batches of 100.
  3. Schedule continuation if more remain.
  4. Log count (do NOT emit event -- avoids infinite recursion).

---

## Helper Functions

### Severity Classification (`convex/helpers/auditClassification.ts`)

```typescript
export const SEVERITY_MAP: Record<string, AuditSeverity> = {
  // Critical
  "auth.login_failed":           "critical",
  "profile.deleted":             "critical",
  "role.capability_granted":     "critical",

  // High
  "role.assigned":               "high",
  "role.created":                "high",
  "role.updated":                "high",
  "role.deleted":                "high",
  "settings.updated":            "high",
  "settings.permalinks_changed": "high",
  "post.deleted":                "high",
  "page.deleted":                "high",
  "comment.deleted":             "high",
  "media.deleted":               "high",
  "api.key_created":             "high",
  "api.key_revoked":             "high",
  "profile.deactivated":         "high",
  "registration.user_invited":   "high",

  // Medium
  "post.published":              "medium",
  "post.unpublished":            "medium",
  "post.trashed":                "medium",
  "post.restored":               "medium",
  "page.published":              "medium",
  "registration.user_registered":"medium",
  "password.changed":            "medium",
  "password.reset_requested":    "medium",
  "password.reset_completed":    "medium",
  "revision.restored":           "medium",
  "api.webhook_triggered":       "medium",

  // Low
  "post.created":                "low",
  "post.updated":                "low",
  "post.scheduled":              "low",
  "page.created":                "low",
  "page.updated":                "low",
  "comment.created":             "low",
  "comment.approved":            "low",
  "comment.rejected":            "low",
  "comment.replied":             "low",
  "comment.flagged":             "low",
  "comment.spammed":             "low",
  "media.uploaded":              "low",
  "media.updated":               "low",
  "taxonomy.category_created":   "low",
  "taxonomy.category_updated":   "low",
  "taxonomy.category_deleted":   "low",
  "taxonomy.tag_created":        "low",
  "taxonomy.tag_deleted":        "low",
  "taxonomy.term_assigned":      "low",
  "menu.created":                "low",
  "menu.updated":                "low",
  "menu.deleted":                "low",
  "menu.location_assigned":      "low",
  "profile.updated":             "low",
  "profile.avatar_changed":      "low",
  "revision.created":            "low",
  "seo.updated":                 "low",
  "seo.sitemap_generated":       "low",

  // Informational
  "auth.logged_in":              "informational",
  "auth.logged_out":             "informational",
  "auth.email_verified":         "informational",
  "auth.oauth_completed":        "informational",
  "notification.email_sent":     "informational",
  "notification.email_failed":   "informational",
  "notification.site_sent":      "informational",
};

export function getSeverity(eventCode: string): AuditSeverity {
  return SEVERITY_MAP[eventCode] ?? "informational";
}
```

### Object Type Derivation (`convex/helpers/auditClassification.ts`)

```typescript
export const SYSTEM_TO_OBJECT_TYPE: Record<string, AuditObjectType> = {
  "post": "post",
  "page": "page",
  "comment": "comment",
  "media": "media",
  "auth": "user",
  "registration": "user",
  "profile": "user",
  "role": "role",
  "taxonomy": "taxonomy",
  "menu": "menu",
  "settings": "settings",
  "seo": "seo",
  "api": "api",
  "notification": "notification",
  "password": "user",
  "revision": "post",
  "event-dispatcher": "system",
  "audit-log": "system",
};

export function getObjectType(system: string): AuditObjectType {
  return SYSTEM_TO_OBJECT_TYPE[system] ?? "system";
}
```

### Object Extractors (`convex/helpers/auditObjectExtractors.ts`)

Maps each event code to a function extracting `objectId` and `objectLabel` from the payload:

- **Post events:** `objectId = p.postId`, `objectLabel = p.title`
- **Page events:** `objectId = p.pageId`, `objectLabel = p.title`
- **Comment events:** `objectId = p.commentId`
- **Media events:** `objectId = p.mediaId`, `objectLabel = p.fileName`
- **Auth events:** `objectId = p.userId` (or `objectLabel = p.email` for failures)
- **Registration events:** `objectId = p.userId`, `objectLabel = p.email`
- **Profile events:** `objectId = p.userId`
- **Role events:** `objectId = p.roleId`, `objectLabel = p.name` (or transition labels)
- **Password events:** `objectLabel = p.email` or `objectId = p.userId`
- **Taxonomy events:** `objectId = p.termId`, `objectLabel = p.name`
- **Menu events:** `objectId = p.menuId`, `objectLabel = p.name`
- **Settings events:** `objectLabel = p.section`
- **SEO events:** `objectId = p.postId` or `objectLabel = p.url`
- **API events:** `objectId = p.keyId` or `p.endpointId`
- **Notification events:** `objectLabel = p.subject` or `p.type`
- **Revision events:** `objectId = p.postId`, `objectLabel = revision info`

### Description Templates (`convex/helpers/auditDescriptions.ts`)

Generates human-readable descriptions per event code. Pattern: `"{verb} {object type} '{label}'"`. Actor name is prepended by the caller.

Full mapping for all 63 events (see PRD section 4.5 for complete list).

---

## Events

### Events Consumed (All 63 CMS Events)

The global wildcard listener receives every event from the Event Dispatcher:

| Source System | Count | Prefix | Examples |
|--------------|-------|--------|----------|
| Post System | 8 | `post.*` | created, updated, published, unpublished, scheduled, trashed, restored, deleted |
| Page System | 4 | `page.*` | created, updated, published, deleted |
| Comment System | 7 | `comment.*` | created, approved, rejected, replied, flagged, spammed, deleted |
| Media System | 3 | `media.*` | uploaded, updated, deleted |
| Taxonomy System | 6 | `taxonomy.*` | category_created/updated/deleted, tag_created/deleted, term_assigned |
| Auth System | 5 | `auth.*` | logged_in, login_failed, logged_out, email_verified, oauth_completed |
| Registration System | 2 | `registration.*` | user_registered, user_invited |
| User Profile System | 4 | `profile.*` | updated, avatar_changed, deactivated, deleted |
| Role & Capability System | 5 | `role.*` | created, updated, deleted, assigned, capability_granted |
| Password Management System | 3 | `password.*` | changed, reset_requested, reset_completed |
| Menu System | 4 | `menu.*` | created, updated, deleted, location_assigned |
| Settings System | 2 | `settings.*` | updated, permalinks_changed |
| SEO/Sitemap System | 2 | `seo.*` | updated, sitemap_generated |
| API System | 3 | `api.*` | key_created, key_revoked, webhook_triggered |
| Revision System | 2 | `revision.*` | created, restored |
| Email Notification System | 2 | `notification.email_*` | email_sent, email_failed |
| Site Notification System | 1 | `notification.site_*` | site_sent |
| **Total** | **63** | | |

### Events Produced

| Event Code | Payload | Trigger |
|------------|---------|---------|
| `audit.exported` | `{ format, recordCount, filters, exportedBy }` | Administrator exports audit log |
| `audit.cleared` | `{ mode, count, clearedBy }` | Administrator clears old entries |

These self-auditing events are logged back through the global listener (creating audit entries about audit actions).

---

## Admin Routes & UI

### Activity Log (`/admin/activity`)

- **Airtable Record:** `[redacted-airtable-record-id]`
- **Purpose:** Simplified, timeline-style view of recent activity (Simple History equivalent)
- **WordPress Equivalent:** Dashboard Activity widget (extended)
- **Layout:** Full-width within admin layout
- **Key Components:**
  - `ActivityTimeline.tsx` -- Chronological timeline grouped by date (Today, Yesterday, dates)
  - `ActivityEntry.tsx` -- Single entry with severity badge, avatar, description, relative timestamp
- **Data Requirements:** `auditLog.list` query with default filters
- **User Interactions:**
  - Click entry to expand inline detail (changes, payload excerpt)
  - Filter dropdown: All, Content, Users, Security, System
  - "Load More" button for infinite scroll
- **Real-Time:** Convex subscription; new entries appear at top without refresh
- **Severity Indicators:** Color dots (red=critical, orange=high, yellow=medium, blue=low, gray=info)

### Audit Log (`/admin/audit-log`)

- **Airtable Record:** `[redacted-airtable-record-id]`
- **Purpose:** Full-featured, filterable, exportable audit interface (WP Activity Log equivalent)
- **Layout:** Full-width within admin layout
- **Key Components:**
  - `AuditStatsBar.tsx` -- Summary counts by severity, clickable badges to filter
  - `AuditFilterBar.tsx` -- Search, user dropdown, severity multi-select, type dropdown, date range, export button, clear button
  - `AuditTable.tsx` -- Data table with columns: Severity (dot), Timestamp, User (avatar+name), Description, Detail arrow
  - `AuditExportDialog.tsx` -- Export config: format (CSV/JSON), date range, filters, max records, payload inclusion
  - `AuditClearDialog.tsx` -- Clear confirmation: mode selection, dry run preview, "CONFIRM DELETE" safety phrase
- **Data Requirements:** `auditLog.list` + `auditLog.getStats`
- **User Interactions:**
  - Filter by severity, user, type, event code, date range, free-text search
  - Click row to navigate to detail view
  - Export to CSV/JSON
  - Clear old entries (with confirmation)
  - Toggle "Pause live updates"
- **Real-Time:** Convex subscription with optional pause
- **Pagination:** Cursor-based, "Prev/Next" buttons, page indicator

### Audit Entry Detail (`/admin/audit-log/:entryId`)

- **Purpose:** Full detail view for a single audit entry
- **Layout:** Slide-over panel or full page (configurable)
- **Key Components:**
  - `AuditEntryDetail.tsx` -- Header (severity, timestamp, description)
  - Actor section (avatar, name, email, role, IP, user agent)
  - Object section (type, ID, label, "View Object History" link)
  - `AuditChangesTable.tsx` -- Diff table (field, old value, new value)
  - `AuditPayloadViewer.tsx` -- JSON viewer with copy button
  - Event processing section (status, listener counts, processing time)
  - Related actions section (correlated entries)
- **Data Requirements:** `auditLog.get` query

---

## Website Routes

None. The Audit Log System is admin-only. There are no public-facing website routes.

---

## Notifications

The Audit Log System does not trigger any email or site notifications. It is a passive record consumer.

**Rationale:** Security alerting for critical events (failed logins, user deletions) is handled by the Email Notification System and Site Notification System, which have their own listeners for those events. The Audit Log avoids duplicating notification logic.

**Future:** A "Security Alerts" feature could monitor audit entries for suspicious patterns (e.g., 5+ failed logins from one IP in 10 minutes). This would be a separate system/enhancement.

---

## Role & Capability Matrix

| Capability | Action | Administrator | Editor | Author | Contributor | Subscriber |
|-----------|--------|:------------:|:------:|:------:|:-----------:|:----------:|
| `view_audit_log` | View audit log pages, list entries, view details | Yes | No | No | No | No |
| `export_audit_log` | Export audit log to CSV/JSON | Yes | No | No | No | No |
| `manage_audit_log` | Clear old entries | Yes | No | No | No | No |

**Notes:**
- All three capabilities are Administrator-only (matches WP Activity Log where only `manage_options` can view).
- No "view own activity" route. Users see their own activity via the Dashboard System's activity widget (reads from `events` table directly, not `auditEntries`).
- Editor role intentionally excluded to prevent sensitive data exposure.

---

## Dependencies

### Depends On

| System | Type | What Is Needed |
|--------|------|----------------|
| **Event Dispatcher System** | **Hard** (required) | The Audit Log registers a global wildcard listener (`*`) to receive all events. Without the Event Dispatcher, no audit entries are created. Also depends on the `events` table schema for `eventId` references. |
| **Auth System (Convex Auth)** | **Hard** (required) | Authentication for all admin routes/queries. Actor resolution (display names, emails, avatars). |
| **Role & Capability System** | **Medium** | Capability checks (`view_audit_log`, `export_audit_log`, `manage_audit_log`). Role resolution for actor snapshot. |
| **All 17 Event-Producing Systems** | **Soft** (data source) | The audit log indirectly depends on all event producers for data. Missing producers mean fewer audit entries, but the system still functions. |

### Depended On By

None. The Audit Log System is a **terminal consumer**. No other system depends on audit log data.

---

## Implementation Checklist

### Backend (`ConvexPress-Admin/packages/backend/convex/`)

- [ ] `schema.ts` -- Add `auditEntries` table definition (1 table, 9 indexes)
- [ ] `auditLog/queries.ts` -- 4 queries: `list`, `get`, `getObjectHistory`, `getStats`
- [ ] `auditLog/mutations.ts` -- 1 mutation: `clear`
- [ ] `auditLog/actions.ts` -- 1 action: `export` (CSV/JSON generation + storage upload)
- [ ] `auditLog/handlers.ts` -- `onAnyEvent` global wildcard listener handler
- [ ] `auditLog/validators.ts` -- Shared validators (`auditSeverity`, `auditObjectType`)
- [ ] `helpers/auditClassification.ts` -- `SEVERITY_MAP`, `SYSTEM_TO_OBJECT_TYPE`, `getSeverity()`, `getObjectType()`
- [ ] `helpers/auditDescriptions.ts` -- `DESCRIPTION_TEMPLATES`, `generateDescription()`, `formatFileSize()`
- [ ] `helpers/auditObjectExtractors.ts` -- `OBJECT_EXTRACTORS`, `extractObject()`
- [ ] `crons/auditLogCleanup.ts` -- Daily retention cleanup cron
- [ ] `bootstrap/registerListeners.ts` -- Add global wildcard listener registration

### Admin Frontend (`ConvexPress-Admin/apps/web/src/`)

- [ ] `routes/admin/activity.tsx` -- Activity Log page (timeline view)
- [ ] `routes/admin/audit-log/index.tsx` -- Audit Log main page (table + filters)
- [ ] `routes/admin/audit-log/$entryId.tsx` -- Entry detail page
- [ ] `components/audit/ActivityTimeline.tsx` -- Timeline component
- [ ] `components/audit/ActivityEntry.tsx` -- Single timeline entry
- [ ] `components/audit/AuditTable.tsx` -- Data table
- [ ] `components/audit/AuditFilterBar.tsx` -- Filter controls
- [ ] `components/audit/AuditStatsBar.tsx` -- Stats summary bar
- [ ] `components/audit/AuditEntryDetail.tsx` -- Detail view
- [ ] `components/audit/AuditChangesTable.tsx` -- Diff table
- [ ] `components/audit/AuditExportDialog.tsx` -- Export dialog
- [ ] `components/audit/AuditClearDialog.tsx` -- Clear confirmation dialog
- [ ] `components/audit/AuditPayloadViewer.tsx` -- JSON viewer
- [ ] `components/audit/SeverityBadge.tsx` -- Reusable severity indicator
- [ ] `lib/audit/types.ts` -- TypeScript types
- [ ] `lib/audit/constants.ts` -- Severity config, object type labels, filter options
- [ ] `lib/audit/formatters.ts` -- Date, relative time, severity label formatters

### Website Frontend (`ConvexPress-Website/apps/web/`)

- No files needed. Audit Log is admin-only.

---

## Edge Cases & Gotchas

1. **Actor resolution failure:** If Convex Auth user lookup fails (user deleted, API error), create the audit entry anyway with `actorId` populated but `actorName`/`actorEmail` as `undefined`. UI displays "Unknown User (user_xxx)".

2. **System-generated events (no actor):** Scheduled publishes (`post.published` from cron) have no `actorId`. Display "System" as actor with distinct system icon.

3. **Payload parsing failure:** If event payload is not valid JSON, store raw string in `rawPayload` and set description to generic `"Event: {eventCode}"`.

4. **Duplicate event processing:** Event Dispatcher may retry the audit listener. Handler MUST check `by_event` index for existing entry before inserting. Return silently if duplicate.

5. **High-volume ingestion (bulk operations):** During import of 500 posts, each event is processed individually. `correlationId` groups them for display. Priority 99 ensures audit handler does not slow higher-priority listeners.

6. **Export timeout:** Very large exports (approaching 50,000 records) have a 10-minute Convex action timeout. Fail gracefully suggesting narrower date range.

7. **Self-auditing loop:** `audit.exported` and `audit.cleared` events create new audit entries. The `audit.cleared` entry itself is never subject to the clear operation (it has a future `expiresAt`). The cleanup cron must NOT emit events (avoid infinite recursion).

8. **Concurrent clear and read:** Convex subscriptions handle this automatically. Deleted entries disappear in real-time for all viewers.

9. **Timezone handling:** All timestamps stored as Unix milliseconds (UTC). Admin UI converts to user's local timezone. Export includes both Unix timestamp and ISO 8601 string.

10. **IP address privacy:** IP addresses only captured for auth-related events (`auth.logged_in`, `auth.login_failed`). Content operations do not record IP by default (GDPR minimal data collection).

11. **Clear safety guards:**
    - `before_date` mode: date must be at least 30 days in the past.
    - `by_severity` mode: only `informational` and `low` can be cleared (critical/high/medium protected).
    - `confirmPhrase` must match exactly "CONFIRM DELETE".

12. **Batch processing:** Both cleanup cron and clear mutation delete in batches of 100 with scheduler continuation to avoid long-running mutations. Export reads in batches of 500.

13. **Free-text search performance:** Search on `description` and `objectLabel` is a post-filter (not indexed). May be slow for very broad queries on large datasets. Consider dedicated search index in V2 if needed.

14. **Total count estimation:** Exact count is expensive for large tables. `totalEstimate` uses lightweight approximation for unfiltered views; returns `undefined` for filtered views (UI shows "50+ results").

---

## Retention Policies

| Event Category | Retention | Impact |
|---------------|-----------|--------|
| Auth events (`auth.*`) | 365 days | Login history for 1 year |
| Deletion events (`*.deleted`) | 365 days | Deletion records for 1 year |
| Role changes (`role.*`) | 365 days | Permission changes for 1 year |
| Settings events (`settings.*`) | 180 days | Config changes for 6 months |
| Content events (`post.*`, `page.*`) | 90 days | Content lifecycle for 3 months |
| Comment events (`comment.*`) | 90 days | Moderation history for 3 months |
| Notification events (`notification.*`) | 30 days | Delivery logs for 1 month |
| All other events | 90 days | Default 3-month retention |
| **Audit system events** (`audit.*`) | **365 days** | Export/clear records always 1 year |

---

## Performance Considerations

| Metric | Value |
|--------|-------|
| Listener overhead per event | ~10ms |
| Storage growth (500 events/day) | ~91 MB/year |
| Steady-state entries (90-day retention) | ~45,000 entries (~22 MB) |
| CSV export (10,000 records) | ~2-3 seconds |
| JSON export (10,000 records) | ~3-5 seconds |
| Daily cleanup (500 expired entries) | Batches of 100 |

---

## WordPress Functions Reference

| WordPress (WP Activity Log) | ConvexPress Convex | Notes |
|-----|-------------|-------|
| `wsal_alert_manager->trigger_event()` | Event Dispatcher `emit()` | Events flow through Event Dispatcher, not directly |
| `WSAL_Occurrence` model (wp_wsal_occurrences) | `auditEntries` table | Enrichment layer over shared events table |
| `WSAL_Meta` model (wp_wsal_metadata) | Payload fields in `auditEntries` | No separate metadata table; all inline |
| `current_user_can('manage_options')` | `view_audit_log` capability check | Three separate capabilities vs one WP capability |
| `WSAL_Connector_MySQL::GetAdapter()` | Convex `ctx.db.query("auditEntries")` | Convex indexes replace MySQL queries |
| `wsal_freemius()->is_premium()` | N/A | No premium gating; all features included |
| `WSAL_Sensors` (event detection hooks) | Global wildcard listener `*` | Single listener vs per-subsystem sensors |
| `wp_wsal_set_excluded_users()` | Not implemented | Future: exclude specific users from audit trail |
| CSV Export (premium) | `auditLog.export` action | Both CSV and JSON, no premium gate |
| `wsal_get_alert_code()` severity lookup | `SEVERITY_MAP` + `getSeverity()` | Same concept, TypeScript Record |
