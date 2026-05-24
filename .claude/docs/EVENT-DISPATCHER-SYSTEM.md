# Event Dispatcher System - Expert Knowledge Document

**System:** Event Dispatcher System
**Status:** Implementation Ready
**Priority:** P0 - Critical
**WordPress Equivalent:** WordPress Hooks System (`do_action()` / `add_action()` / `$wp_filter`)
**Airtable System Record:** `rec1fnG6PNl4CPS77`
**Airtable Expert Record:** `recvDISZSeW4I99tm`
**Last Analyzed:** 2026-02-08

---

## Quick Reference

### What This System Does

The Event Dispatcher System is the central event bus and inter-system communication backbone of ConvexPress. It is the equivalent of WordPress's hooks system (`do_action()` / `add_action()` / `apply_filters()`), but built on Convex's persistent, reactive database rather than WordPress's ephemeral in-process `$wp_filter` global. Every mutation across every system emits structured events through the dispatcher, and registered listeners consume those events to trigger side effects: email notifications, site notifications, audit log entries, sitemap regeneration, search index updates, and any future subscriber logic.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Event** | A persisted record of something that happened (e.g., `post.published`). Stored in the `events` table. |
| **Event Code** | Dot-separated identifier: `{system}.{action}` (e.g., `comment.created`). 63 total event codes. |
| **Listener** | A registered handler that reacts to a specific event code. Stored in `eventListeners` table. |
| **Execution** | A single invocation of a listener for a specific event. Tracked in `eventListenerExecutions`. |
| **Priority** | Integer 1-100 (default 10). Lower = runs earlier. Same convention as WordPress. |
| **Wildcard** | Listeners can match `post.*` (system wildcard) or `*` (global wildcard). |
| **Filter Condition** | Optional JSON shallow-match condition to selectively process events. |
| **Correlation ID** | UUID linking related events from bulk operations (e.g., bulk publish). |
| **Retention** | Events auto-expire after configurable period (default 90 days). Auth/deletion events: 365 days. |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| **Mechanism** | Global `$wp_filter` array (in-process) | Convex `events` table (persisted, durable) |
| **Invocation** | `do_action('hook', ...$args)` | `emitEvent(ctx, code, system, payload)` helper |
| **Registration** | `add_action('hook', $callback, $priority)` | `eventListeners` table with handler function references |
| **Priority** | Any integer (negative allowed) | Integer 1-100 (positive only) |
| **Execution** | Synchronous (blocks request) | Async via Convex scheduled functions |
| **Filters** | `apply_filters()` for data transformation | Not implemented (Convex mutations handle transformations) |
| **Persistence** | None (fire-and-forget) | All events persisted for audit trail, replay, analytics |
| **Failure Handling** | Fatal error kills the request | Failed listeners retry with exponential backoff; failures logged |
| **Discovery** | `has_action()`, `did_action()` | `events.hasListener`, `events.countByCode` queries |
| **Removal** | `remove_action()`, `remove_all_actions()` | `events.removeListener` mutation (deactivate or delete) |
| **Global State** | `$wp_filter` array, `current_action()` | Database table, event data passed to handler args |

---

## Architecture Overview

### Data Flow

1. **User Action**: A user performs an action (e.g., publishes a post)
2. **System Mutation**: The owning system's mutation executes (e.g., `posts.publish`)
3. **Event Emission**: Within the same Convex transaction, `emitEvent()` is called
4. **Event Persistence**: Event record inserted into `events` table with `status: "pending"`
5. **Execution Records**: One `eventListenerExecutions` record created per matching listener
6. **Async Scheduling**: `ctx.scheduler.runAfter(0, internal.events.processEvent, { eventId })` fires
7. **Listener Dispatch**: `processEvent` iterates listeners by priority, invokes handlers
8. **Side Effects**: Handlers create notifications, send emails, update audit log, etc.
9. **Status Update**: Event marked `completed`, `failed`, or `partial`
10. **Cleanup**: Daily cron deletes events past their `expiresAt` timestamp

Because event emission happens within the same Convex mutation as the triggering action, if the mutation rolls back, the event is never persisted. This guarantees events represent actual state changes.

### Real-Time Behavior

- **Event Stream**: Admin users with the Event Monitor (future) can subscribe to the `events` table for a live event stream
- **Listener Status**: Processing status updates reactively via Convex subscriptions
- **No Website Subscriptions**: The Event Dispatcher is backend-only. Website app does not subscribe directly to events
- **Dependent Systems**: The Site Notification System subscribes to its own `siteNotifications` table -- the Event Dispatcher triggers writes to that table, which Convex reactivity then pushes to clients

### Authentication & Authorization

- **Event emission**: No direct auth check. `emitEvent()` is called from within authenticated mutations. The `actorId` is resolved from the auth identity of the user performing the original action.
- **Listener registration**: Requires `manage_options` capability (Administrator only). This is a system-level operation, typically performed during bootstrap.
- **Listener removal**: Requires `manage_options` capability (Administrator only).
- **Event queries**: Requires Administrator role (for audit/monitoring).
- **Actor resolution**: `actorId` defaults to `ctx.auth.getUserIdentity().subject` (user identifier). System-generated events (e.g., scheduled publishes, cron jobs) may have no actor.

---

## Database Schema

### `events` Table

The core event log. Every event emitted by any system is persisted here.

```typescript
events: defineTable({
  // --- Identity ---
  code: v.string(),                              // Event code (e.g., "post.published")
  system: v.string(),                            // Source system slug (e.g., "post", "comment", "auth")

  // --- Payload ---
  payload: v.string(),                           // JSON-serialized event payload (max 100KB)

  // --- Actor ---
  actorId: v.optional(v.string()),               // user identifier of the user who triggered the event
  actorIp: v.optional(v.string()),               // IP address (for auth events)

  // --- Processing ---
  status: v.union(
    v.literal("pending"),                        // Just emitted, not yet processed
    v.literal("processing"),                     // Currently being dispatched to listeners
    v.literal("completed"),                      // All listeners executed successfully
    v.literal("failed"),                         // One or more listeners failed (after retries)
    v.literal("partial"),                        // Some listeners succeeded, some failed
  ),
  listenersTotal: v.number(),                    // Total listeners registered at emission time
  listenersCompleted: v.number(),                // How many listeners completed successfully
  listenersFailed: v.number(),                   // How many listeners failed (after retries)

  // --- Metadata ---
  correlationId: v.optional(v.string()),         // Links related events (e.g., bulk operations)
  parentEventId: v.optional(v.id("events")),     // If this event was triggered by another event

  // --- Timestamps ---
  emittedAt: v.number(),                         // When the event was emitted (ms since epoch)
  processedAt: v.optional(v.number()),           // When processing completed (ms)
  expiresAt: v.optional(v.number()),             // When to auto-delete (retention policy)
})
  .index("by_code", ["code"])                                    // All events of a type
  .index("by_system", ["system"])                                // All events from a system
  .index("by_code_emitted", ["code", "emittedAt"])               // Events of a type, sorted by time
  .index("by_status", ["status"])                                // Pending/failed events for processing
  .index("by_actor", ["actorId", "emittedAt"])                   // Activity feed for a user
  .index("by_correlation", ["correlationId"])                    // Linked events
  .index("by_emitted", ["emittedAt"])                            // Chronological event log
  .index("by_expires", ["expiresAt"])                            // Retention cleanup
```

#### Field Specifications

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `code` | `string` | Yes | -- | Must match `system.action` pattern. Max 100 chars. |
| `system` | `string` | Yes | -- | Lowercase system slug. Max 50 chars. Must be known system. |
| `payload` | `string` | Yes | `"{}"` | Valid JSON string. Max 100KB. |
| `actorId` | `string` | No | Current user's Convex Auth ID | Valid user identifier or undefined for system events. |
| `actorIp` | `string` | No | undefined | IPv4 or IPv6 string. Only set for auth-related events. |
| `status` | `enum` | Yes | `"pending"` | One of: pending, processing, completed, failed, partial. |
| `listenersTotal` | `number` | Yes | `0` | Non-negative integer. Set at emission time. |
| `listenersCompleted` | `number` | Yes | `0` | Non-negative integer. Incremented as listeners complete. |
| `listenersFailed` | `number` | Yes | `0` | Non-negative integer. Incremented as listeners exhaust retries. |
| `correlationId` | `string` | No | undefined | UUID for linking related events. |
| `parentEventId` | `Id<"events">` | No | undefined | For cascading events (event A triggers event B). |
| `emittedAt` | `number` | Yes | `Date.now()` | Unix timestamp (ms). Immutable. |
| `processedAt` | `number` | No | undefined | Set when all listeners complete or fail. |
| `expiresAt` | `number` | No | Calculated from retention | Timestamp for auto-cleanup. |

### `eventListeners` Table

Registered handlers that process events. Analogous to WordPress's `add_action()` registrations.

```typescript
eventListeners: defineTable({
  // --- Identity ---
  eventCode: v.string(),                         // Event code to listen for (e.g., "post.published")
  name: v.string(),                              // Human-readable name (e.g., "Send publish email")

  // --- Handler ---
  handlerModule: v.string(),                     // Convex module path (e.g., "notifications/email")
  handlerFunction: v.string(),                   // Function name (e.g., "onPostPublished")
  handlerType: v.union(
    v.literal("internal"),                       // Convex internal function (sync within transaction)
    v.literal("action"),                         // Convex action (async, for external APIs)
    v.literal("scheduled"),                      // Scheduled for later execution
  ),

  // --- Configuration ---
  priority: v.number(),                          // Execution priority (lower = earlier, default 10)
  isActive: v.boolean(),                         // Whether this listener is active

  // --- Retry Configuration ---
  maxRetries: v.number(),                        // Max retry attempts (default 3)
  retryDelayMs: v.number(),                      // Base retry delay in ms (default 1000)
  retryBackoff: v.union(
    v.literal("linear"),                         // delay * attempt
    v.literal("exponential"),                    // delay * 2^attempt
  ),

  // --- Filtering ---
  filterCondition: v.optional(v.string()),       // Optional JSON condition to filter events

  // --- Metadata ---
  system: v.string(),                            // Which system owns this listener
  description: v.optional(v.string()),           // What this listener does

  // --- Timestamps ---
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_event_code", ["eventCode", "isActive", "priority"])  // Active listeners for event, by priority
  .index("by_system", ["system"])                                  // All listeners for a system
  .index("by_active", ["isActive"])                                // Active/inactive filter
```

#### Field Specifications

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `eventCode` | `string` | Yes | -- | Exact match, wildcard (`post.*`), or global (`*`). |
| `name` | `string` | Yes | -- | Max 200 chars. Unique per eventCode. |
| `handlerModule` | `string` | Yes | -- | Valid Convex module path. |
| `handlerFunction` | `string` | Yes | -- | Function name within the module. |
| `handlerType` | `enum` | Yes | `"action"` | One of: internal, action, scheduled. |
| `priority` | `number` | Yes | `10` | Integer, range 1-100. |
| `isActive` | `boolean` | Yes | `true` | Can be disabled without deletion. |
| `maxRetries` | `number` | Yes | `3` | Non-negative integer. 0 = no retries. |
| `retryDelayMs` | `number` | Yes | `1000` | Base delay in ms. Min 100, max 300000 (5 min). |
| `retryBackoff` | `enum` | Yes | `"exponential"` | One of: linear, exponential. |
| `filterCondition` | `string` | No | undefined | Valid JSON object for shallow matching. |
| `system` | `string` | Yes | -- | Owning system slug. |
| `description` | `string` | No | undefined | Max 500 chars. |
| `createdAt` | `number` | Yes | `Date.now()` | Immutable after creation. |
| `updatedAt` | `number` | Yes | `Date.now()` | Updated on any change. |

### `eventListenerExecutions` Table

Tracks individual listener invocations for an event. Enables retry tracking and debugging.

```typescript
eventListenerExecutions: defineTable({
  // --- References ---
  eventId: v.id("events"),                       // The event being processed
  listenerId: v.id("eventListeners"),            // The listener that processed it

  // --- Execution ---
  status: v.union(
    v.literal("pending"),
    v.literal("running"),
    v.literal("completed"),
    v.literal("failed"),
    v.literal("retrying"),
    v.literal("skipped"),                        // Skipped due to filter condition
  ),
  attempt: v.number(),                           // Current attempt number (1-based)

  // --- Result ---
  result: v.optional(v.string()),                // JSON-serialized result or error message
  error: v.optional(v.string()),                 // Error message if failed

  // --- Timing ---
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  duration: v.optional(v.number()),              // Execution duration in ms

  // --- Retry ---
  nextRetryAt: v.optional(v.number()),           // When to retry (if retrying)
  scheduledFunctionId: v.optional(v.string()),   // Convex scheduled function ID (for cancellation)
})
  .index("by_event", ["eventId"])                                // All executions for an event
  .index("by_listener", ["listenerId"])                          // Execution history for a listener
  .index("by_status", ["status"])                                // Find pending/retrying executions
  .index("by_retry", ["status", "nextRetryAt"])                  // Retries due for execution
```

#### Field Specifications

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `eventId` | `Id<"events">` | Yes | -- | Valid event reference. |
| `listenerId` | `Id<"eventListeners">` | Yes | -- | Valid listener reference. |
| `status` | `enum` | Yes | `"pending"` | One of: pending, running, completed, failed, retrying, skipped. |
| `attempt` | `number` | Yes | `1` | Positive integer. |
| `result` | `string` | No | undefined | JSON-serialized success result. Max 10KB. |
| `error` | `string` | No | undefined | Error message. Max 5KB. |
| `startedAt` | `number` | No | undefined | When execution began. |
| `completedAt` | `number` | No | undefined | When execution finished. |
| `duration` | `number` | No | undefined | Computed: completedAt - startedAt. |
| `nextRetryAt` | `number` | No | undefined | Scheduled retry time. |
| `scheduledFunctionId` | `string` | No | undefined | For cancelling scheduled retries. |

### Indexes

| Table | Index | Fields | Purpose |
|-------|-------|--------|---------|
| `events` | `by_code` | `[code]` | Look up all events of a specific type |
| `events` | `by_system` | `[system]` | All events from a source system |
| `events` | `by_code_emitted` | `[code, emittedAt]` | Time-sorted events of a type |
| `events` | `by_status` | `[status]` | Find pending/failed events for processing |
| `events` | `by_actor` | `[actorId, emittedAt]` | User activity feed |
| `events` | `by_correlation` | `[correlationId]` | Link bulk operation events |
| `events` | `by_emitted` | `[emittedAt]` | Chronological event log |
| `events` | `by_expires` | `[expiresAt]` | Retention cleanup queries |
| `eventListeners` | `by_event_code` | `[eventCode, isActive, priority]` | Fast listener lookup during emission |
| `eventListeners` | `by_system` | `[system]` | All listeners owned by a system |
| `eventListeners` | `by_active` | `[isActive]` | Active/inactive filter |
| `eventListenerExecutions` | `by_event` | `[eventId]` | All executions for an event |
| `eventListenerExecutions` | `by_listener` | `[listenerId]` | Execution history for a listener |
| `eventListenerExecutions` | `by_status` | `[status]` | Find pending/retrying executions |
| `eventListenerExecutions` | `by_retry` | `[status, nextRetryAt]` | Retries due for execution |

### Relationships

| This Table | Field | References | Description |
|-----------|-------|------------|-------------|
| `events` | `parentEventId` | `events._id` | Self-referential: cascading event chains |
| `events` | `actorId` | user identifier | Resolved from auth identity, not a Convex table |
| `eventListenerExecutions` | `eventId` | `events._id` | Which event triggered this execution |
| `eventListenerExecutions` | `listenerId` | `eventListeners._id` | Which listener was invoked |

---

## Actions & Functions

### Mutations

#### `event.emit` - Emit Event

- **Airtable Record:** `recsQ9Sze2m6vucNZ`
- **Type:** mutation
- **Convex Function:** `mutations/events.emit`
- **Auth:** System-level (called by other mutations, not directly by users)
- **Capabilities:** N/A (invoked internally via `emitEvent()` helper)
- **Args:**
  ```typescript
  {
    code: v.string(),                                 // Event code (e.g., "post.published")
    payload: v.string(),                              // JSON-serialized payload
    system: v.string(),                               // Source system slug
    actorId: v.optional(v.string()),                  // Override actor (default: current user)
    actorIp: v.optional(v.string()),                  // IP address (auth events)
    correlationId: v.optional(v.string()),            // For linking related events
    parentEventId: v.optional(v.id("events")),        // Cascading event parent
  }
  ```
- **Returns:** `Id<"events">` (the new event ID)
- **Behavior:**
  1. Validate event code format (`system.action` pattern, lowercase, dot-separated)
  2. Validate payload is valid JSON and under 100KB
  3. Validate system slug is a known system
  4. Resolve actor: use `actorId` if provided, else `ctx.auth.getUserIdentity().subject`
  5. Query `eventListeners` for all active listeners matching this `eventCode`:
     - Exact match query
     - System wildcard query (e.g., `post.*` for `post.published`)
     - Global wildcard query (`*`)
  6. Merge and sort listeners by priority ascending
  7. Calculate `expiresAt` based on retention policy (default: emittedAt + 90 days)
  8. Insert event record with `status: "pending"`, `listenersTotal: count`
  9. Create `eventListenerExecutions` records for each matching listener
  10. Schedule `internal.events.processEvent` via `ctx.scheduler.runAfter(0, ...)`
  11. If no listeners, mark event as `"completed"` immediately
  12. Return the new event ID
- **Events:** None (this IS the emission mechanism -- no recursive self-triggering)
- **Errors:**
  - `VALIDATION_ERROR`: Invalid event code format
  - `VALIDATION_ERROR`: Payload is not valid JSON
  - `VALIDATION_ERROR`: Payload exceeds 100KB
  - `VALIDATION_ERROR`: Unknown system slug

#### `event.register_listener` - Register Listener

- **Airtable Record:** `rec3ZGNg1oczJmWDd`
- **Type:** mutation
- **Convex Function:** `mutations/events.registerListener`
- **Auth:** Required
- **Capabilities:** `manage_options` (Administrator only)
- **Args:**
  ```typescript
  {
    eventCode: v.string(),                            // Event code or pattern (e.g., "post.*")
    name: v.string(),                                 // Human-readable listener name
    handlerModule: v.string(),                        // Convex module path
    handlerFunction: v.string(),                      // Function name
    handlerType: v.optional(v.union(
      v.literal("internal"),
      v.literal("action"),
      v.literal("scheduled"),
    )),                                                // Default: "action"
    priority: v.optional(v.number()),                 // Default: 10
    maxRetries: v.optional(v.number()),               // Default: 3
    retryDelayMs: v.optional(v.number()),             // Default: 1000
    retryBackoff: v.optional(v.union(
      v.literal("linear"),
      v.literal("exponential"),
    )),                                                // Default: "exponential"
    filterCondition: v.optional(v.string()),          // JSON filter
    system: v.string(),                               // Owning system slug
    description: v.optional(v.string()),
  }
  ```
- **Returns:** `Id<"eventListeners">`
- **Behavior:**
  1. Authenticate user via auth identity
  2. Check `manage_options` capability
  3. Validate `eventCode` format (exact: `post.published`, wildcard: `post.*`, global: `*`)
  4. Validate `handlerModule` is a valid Convex module path
  5. Validate `filterCondition` is valid JSON if provided
  6. Check for duplicate: no existing active listener with same `eventCode` + `name`
  7. Insert listener record with defaults applied
  8. Return new listener ID
- **Events:** None (bootstrap operation -- avoids circular dependency)
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated
  - `FORBIDDEN`: User lacks `manage_options` capability
  - `VALIDATION_ERROR`: Invalid event code format
  - `VALIDATION_ERROR`: Invalid filter condition JSON
  - `CONFLICT`: Duplicate listener name for same event code
  - `VALIDATION_ERROR`: Priority outside valid range (1-100)

#### `event.remove_listener` - Remove Listener

- **Airtable Record:** `recemC8jQXl6G4ANp`
- **Type:** mutation
- **Convex Function:** `mutations/events.removeListener`
- **Auth:** Required
- **Capabilities:** `manage_options` (Administrator only)
- **Args:**
  ```typescript
  {
    listenerId: v.id("eventListeners"),               // Listener to remove
    mode: v.optional(v.union(
      v.literal("deactivate"),                        // Set isActive = false (soft remove)
      v.literal("delete"),                            // Permanently delete the record
    )),                                                // Default: "deactivate"
  }
  ```
- **Returns:** `{ success: true }`
- **Behavior:**
  1. Authenticate user via auth identity
  2. Check `event.remove_listener` capability
  3. Fetch the listener record
  4. If `mode === "deactivate"` (default): set `isActive: false`, update `updatedAt`
  5. If `mode === "delete"`: delete all related `eventListenerExecutions`, then delete the listener record
  6. Return success with details (mode, name, eventCode, executionsDeleted for delete mode)
- **Events:** None
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated
  - `FORBIDDEN`: User lacks `manage_options` capability
  - `NOT_FOUND`: Listener ID does not exist

### Internal Functions

#### `internal.events.processEvent` - Process Event Listeners

- **Type:** Internal function (not callable from client)
- **Convex Function:** `internals/events.processEvent`
- **Args:** `{ eventId: v.id("events") }`
- **Behavior:**
  1. Fetch event record. If `status !== "pending"`, return (idempotency guard)
  2. Update event `status` to `"processing"`
  3. Fetch all `eventListenerExecutions` for this event, sorted by listener priority
  4. For each execution record:
     a. Fetch the listener
     b. If `filterCondition` exists, evaluate against event payload (shallow match). If no match, mark as `"skipped"`
     c. Update execution `status` to `"running"`, set `startedAt`
     d. Invoke handler by `handlerType`:
        - `"internal"`: `ctx.runMutation(internal[module][function], { event, payload })`
        - `"action"`: `ctx.runAction(internal[module][function], { event, payload })`
        - `"scheduled"`: `ctx.scheduler.runAfter(0, internal[module][function], { event, payload })`
     e. On success: mark `"completed"`, set `completedAt`, `duration`, increment `listenersCompleted`
     f. On failure: if `attempt < maxRetries`, calculate retry delay and schedule `retryExecution`; else mark `"failed"`, increment `listenersFailed`
  5. After all executions, update event status:
     - `listenersFailed === 0` -> `"completed"`
     - `listenersCompleted === 0 && listenersFailed > 0` -> `"failed"`
     - Both > 0 -> `"partial"`
  6. Set `processedAt` to `Date.now()`

#### `internal.events.retryExecution` - Retry Failed Listener

- **Type:** Internal scheduled function
- **Convex Function:** `internals/events.retryExecution`
- **Args:** `{ executionId: v.id("eventListenerExecutions") }`
- **Behavior:**
  1. Fetch execution record. If `status !== "retrying"`, return (cancelled or processed)
  2. Increment `attempt`
  3. Invoke handler (same logic as processEvent step 4d)
  4. On success: update to `"completed"`, update parent event counters
  5. On failure: if more retries available, schedule next retry; else mark `"failed"`

#### `internal.events.cleanup` - Event Retention Cleanup (Cron)

- **Type:** Cron function (runs daily)
- **Convex Function:** `crons/events.cleanup`
- **Behavior:**
  1. Query `events` table where `expiresAt < Date.now()` using `by_expires` index
  2. For each expired event: delete all related `eventListenerExecutions`, then delete the event
  3. Batch deletions in chunks of 100 to avoid long-running mutations
  4. Log cleanup count

### Queries

#### `events.list` - List Events

- **Type:** query
- **Convex Function:** `queries/events.list`
- **Auth:** Required
- **Capabilities:** Administrator
- **Args:**
  ```typescript
  {
    code: v.optional(v.string()),
    system: v.optional(v.string()),
    actorId: v.optional(v.string()),
    status: v.optional(eventStatus),
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
    correlationId: v.optional(v.string()),
    page: v.optional(v.number()),        // 1-based
    perPage: v.optional(v.number()),     // Default: 50
  }
  ```
- **Returns:**
  ```typescript
  {
    events: Array<{
      _id: Id<"events">,
      code: string,
      system: string,
      payload: Record<string, any>,     // Parsed JSON
      actorId?: string,
      actorName?: string,               // Resolved from the auth system
      status: EventStatus,
      listenersTotal: number,
      listenersCompleted: number,
      listenersFailed: number,
      emittedAt: number,
      processedAt?: number,
    }>,
    total: number,
    page: number,
    perPage: number,
    totalPages: number,
  }
  ```
- **Behavior:** Query events with optional filtering. Resolve actor names from the auth system. Offset-based pagination.
- **Pagination:** Offset-based (page + perPage)
- **Filters:** code, system, actorId, status, dateRange, correlationId

#### `events.get` - Get Single Event

- **Type:** query
- **Convex Function:** `queries/events.get`
- **Auth:** Required
- **Capabilities:** Administrator
- **Args:** `{ eventId: v.id("events") }`
- **Returns:** Full event record with parsed payload, resolved actor name, and all listener execution details
- **Behavior:** Fetch event by ID, parse payload JSON, resolve actor name, join with all `eventListenerExecutions` for the event

#### `events.countByCode` - Count Events by Code

- **Type:** query
- **Convex Function:** `queries/events.countByCode`
- **Auth:** Required
- **Capabilities:** Administrator
- **Args:** `{ code: v.string(), since: v.optional(v.number()) }`
- **Returns:** `{ count: number }`
- **Behavior:** Count events matching code, optionally filtered by `since` timestamp. Equivalent to WordPress `did_action()`.

#### `events.listListeners` - List Registered Listeners

- **Type:** query
- **Convex Function:** `queries/events.listListeners`
- **Auth:** Required
- **Capabilities:** Administrator
- **Args:**
  ```typescript
  {
    eventCode: v.optional(v.string()),
    system: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  }
  ```
- **Returns:** Array of listener records
- **Behavior:** List all registered listeners with optional filtering by event code, system, or active status

#### `events.hasListener` - Check if Listener Exists

- **Type:** query
- **Convex Function:** `queries/events.hasListener`
- **Auth:** Not required (can be called internally)
- **Args:** `{ eventCode: v.string(), name: v.optional(v.string()) }`
- **Returns:** `{ exists: boolean, count: number }`
- **Behavior:** Check if any listeners are registered for the given event code. Equivalent to WordPress `has_action()`.

### Helper Functions

#### `emitEvent()` - Universal Event Emission Helper

**File:** `convex/helpers/events.ts`

This is the primary API that all other systems use to emit events. Called from within mutations.

```typescript
export async function emitEvent(
  ctx: MutationCtx,
  code: string,          // "post.published"
  system: string,        // "post"
  payload: Record<string, any>,
  options?: {
    actorId?: string;
    actorIp?: string;
    correlationId?: string;
    parentEventId?: string;
  },
): Promise<string>       // Returns event ID
```

**Usage pattern (in any system's mutation):**
```typescript
await emitEvent(ctx, "post.published", "post", {
  postId: args.postId,
  title: post.title,
  authorId: post.authorId,
  url: `/blog/${post.slug}`,
  publishedAt: Date.now(),
});
```

#### `evaluateFilter()` - Filter Condition Evaluator

**File:** `convex/helpers/eventFilter.ts`

Shallow JSON comparison. Every key in the filter must match the corresponding payload key.

```typescript
export function evaluateFilter(
  filterCondition: string | undefined,
  payload: Record<string, any>,
): boolean
```

Examples:
- `'{"status":"publish"}'` -- only fire if `payload.status === "publish"`
- `'{"status":"publish","type":"post"}'` -- both must match
- `undefined` or `'{}'` -- always matches

#### `calculateRetryDelay()` - Retry Delay Calculator

**File:** `convex/helpers/eventRetry.ts`

```typescript
export function calculateRetryDelay(
  baseDelayMs: number,
  attempt: number,
  backoff: "linear" | "exponential",
): number    // Capped at 300,000ms (5 minutes)
```

- Exponential: `min(baseDelayMs * 2^attempt, 300000)`
- Linear: `min(baseDelayMs * attempt, 300000)`

---

## Events

### Event Catalog

The Event Dispatcher itself does NOT emit events (to avoid circular dependency). However, it manages the complete catalog of **63 events** emitted by all other systems. Below is the full catalog organized by source system.

### Content Events (14 total)

#### `post.created`
- **Type:** Content
- **System:** Post System
- **Payload:** `{ postId: string, title: string, authorId: string, postType: "post", status: string }`
- **Subscribers:** Audit Log, Dashboard

#### `post.updated`
- **Type:** Content
- **System:** Post System
- **Payload:** `{ postId: string, title: string, authorId: string, changes: Array<{ field: string, oldValue: any, newValue: any }> }`
- **Subscribers:** Audit Log, Revision System, Dashboard

#### `post.published`
- **Type:** Content
- **System:** Post System
- **Payload:** `{ postId: string, title: string, authorId: string, url: string, publishedAt: number }`
- **Subscribers:** Email (Author), Email (Subscribers), Site Notification, Audit Log, Sitemap, RSS, SEO, Dashboard

#### `post.unpublished`
- **Type:** Content
- **System:** Post System
- **Payload:** `{ postId: string, title: string, authorId: string }`
- **Subscribers:** Audit Log, Sitemap, RSS, Dashboard

#### `post.scheduled`
- **Type:** Content
- **System:** Post System
- **Payload:** `{ postId: string, title: string, authorId: string, scheduledFor: number }`
- **Subscribers:** Email (Scheduled Reminder), Site Notification, Audit Log, Dashboard

#### `post.trashed`
- **Type:** Content
- **System:** Post System
- **Payload:** `{ postId: string, title: string, authorId: string }`
- **Subscribers:** Site Notification, Audit Log, Sitemap, Dashboard

#### `post.restored`
- **Type:** Content
- **System:** Post System
- **Payload:** `{ postId: string, title: string, authorId: string }`
- **Subscribers:** Site Notification, Audit Log, Sitemap, Dashboard

#### `post.deleted`
- **Type:** Content
- **System:** Post System
- **Payload:** `{ postId: string, title: string, authorId: string }`
- **Subscribers:** Audit Log, Search, Dashboard

#### `page.created`
- **Type:** Content
- **System:** Page System
- **Payload:** `{ pageId: string, title: string, authorId: string }`
- **Subscribers:** Audit Log

#### `page.updated`
- **Type:** Content
- **System:** Page System
- **Payload:** `{ pageId: string, title: string, authorId: string, changes: string[] }`
- **Subscribers:** Audit Log

#### `page.published`
- **Type:** Content
- **System:** Page System
- **Payload:** `{ pageId: string, title: string, authorId: string, url: string }`
- **Subscribers:** Audit Log, Sitemap

#### `page.deleted`
- **Type:** Content
- **System:** Page System
- **Payload:** `{ pageId: string, title: string, authorId: string }`
- **Subscribers:** Audit Log, Sitemap

#### `revision.created`
- **Type:** Content
- **System:** Revision System
- **Payload:** `{ revisionId: string, postId: string, authorId: string, revisionNumber: number }`
- **Subscribers:** Site Notification, Audit Log

#### `revision.restored`
- **Type:** Content
- **System:** Revision System
- **Payload:** `{ revisionId: string, postId: string, restoredBy: string }`
- **Subscribers:** Email (Alert), Site Notification, Audit Log

### Comment Events (7 total)

#### `comment.created`
- **Type:** Comment
- **System:** Comment System
- **Payload:** `{ commentId: string, postId: string, authorId: string, content: string }`
- **Subscribers:** Email (Post Author), Email (Pending Moderation), Site Notification (Post Author), Site Notification (Admin)

#### `comment.approved`
- **Type:** Comment
- **System:** Comment System
- **Payload:** `{ commentId: string, postId: string, approvedBy: string }`
- **Subscribers:** Email (Comment Author), Site Notification (Comment Author)

#### `comment.rejected`
- **Type:** Comment
- **System:** Comment System
- **Payload:** `{ commentId: string, postId: string, rejectedBy: string }`
- **Subscribers:** Site Notification (Comment Author)

#### `comment.replied`
- **Type:** Comment
- **System:** Comment System
- **Payload:** `{ commentId: string, parentCommentId: string, postId: string, authorId: string }`
- **Subscribers:** Email (Parent Comment Author), Site Notification (Parent Comment Author)

#### `comment.flagged`
- **Type:** Comment
- **System:** Comment System
- **Payload:** `{ commentId: string, postId: string, flaggedBy: string, reason: string }`
- **Subscribers:** Site Notification (Admin)

#### `comment.spammed`
- **Type:** Comment
- **System:** Comment System
- **Payload:** `{ commentId: string, postId: string }`
- **Subscribers:** Audit Log

#### `comment.deleted`
- **Type:** Comment
- **System:** Comment System
- **Payload:** `{ commentId: string, postId: string, deletedBy: string }`
- **Subscribers:** Audit Log

### Media Events (3 total)

#### `media.uploaded`
- **Type:** Media
- **System:** Media System
- **Payload:** `{ mediaId: string, fileName: string, mimeType: string, size: number, uploadedBy: string }`
- **Subscribers:** Email (Storage Warning), Site Notification, Audit Log

#### `media.updated`
- **Type:** Media
- **System:** Media System
- **Payload:** `{ mediaId: string, changes: string[] }`
- **Subscribers:** Audit Log

#### `media.deleted`
- **Type:** Media
- **System:** Media System
- **Payload:** `{ mediaId: string, fileName: string, deletedBy: string }`
- **Subscribers:** Site Notification, Audit Log

### Taxonomy Events (6 total)

#### `taxonomy.category_created`
- **Type:** Taxonomy
- **System:** Taxonomy System
- **Payload:** `{ termId: string, name: string, parentId: string }`
- **Subscribers:** Audit Log

#### `taxonomy.category_updated`
- **Type:** Taxonomy
- **System:** Taxonomy System
- **Payload:** `{ termId: string, name: string, changes: string[] }`
- **Subscribers:** Audit Log

#### `taxonomy.category_deleted`
- **Type:** Taxonomy
- **System:** Taxonomy System
- **Payload:** `{ termId: string, name: string }`
- **Subscribers:** Audit Log

#### `taxonomy.tag_created`
- **Type:** Taxonomy
- **System:** Taxonomy System
- **Payload:** `{ termId: string, name: string }`
- **Subscribers:** Audit Log

#### `taxonomy.tag_deleted`
- **Type:** Taxonomy
- **System:** Taxonomy System
- **Payload:** `{ termId: string, name: string }`
- **Subscribers:** Audit Log

#### `taxonomy.term_assigned`
- **Type:** Taxonomy
- **System:** Taxonomy System
- **Payload:** `{ postId: string, termId: string, taxonomyType: string }`
- **Subscribers:** Audit Log

### Auth & User Events (12 total)

#### `auth.login`
- **Type:** Auth
- **System:** Auth System
- **Payload:** `{ userId: string, method: string, ip: string, userAgent: string }`
- **Subscribers:** Email (New Device Login), Site Notification (New Location), Audit Log

#### `auth.login_failed`
- **Type:** Auth
- **System:** Auth System
- **Payload:** `{ email: string, ip: string, reason: string }`
- **Subscribers:** Email (Admin Alert), Site Notification (User Alert), Audit Log

#### `auth.logout`
- **Type:** Auth
- **System:** Auth System
- **Payload:** `{ userId: string }`
- **Subscribers:** Audit Log

#### `auth.email_verified`
- **Type:** Auth
- **System:** Auth System
- **Payload:** `{ userId: string, email: string }`
- **Subscribers:** Audit Log

#### `auth.oauth_completed`
- **Type:** Auth
- **System:** Auth System
- **Payload:** `{ userId: string, provider: string }`
- **Subscribers:** Audit Log

#### `registration.user_registered`
- **Type:** User
- **System:** Registration System
- **Payload:** `{ userId: string, email: string, role: string }`
- **Subscribers:** Email (Welcome), Email (Verification), Email (Admin New User), Site Notification (Admin), Audit Log

#### `registration.user_invited`
- **Type:** User
- **System:** Registration System
- **Payload:** `{ email: string, role: string, invitedBy: string }`
- **Subscribers:** Email (Invitation), Site Notification (Admin), Audit Log

#### `profile.updated`
- **Type:** User
- **System:** User Profile System
- **Payload:** `{ userId: string, changes: string[] }`
- **Subscribers:** Site Notification, Audit Log

#### `profile.avatar_changed`
- **Type:** User
- **System:** User Profile System
- **Payload:** `{ userId: string, avatarUrl: string }`
- **Subscribers:** Site Notification, Audit Log

#### `profile.deactivated`
- **Type:** User
- **System:** User Profile System
- **Payload:** `{ userId: string, deactivatedBy: string }`
- **Subscribers:** Email (Confirmation), Audit Log

#### `profile.deleted`
- **Type:** User
- **System:** User Profile System
- **Payload:** `{ userId: string, deletedBy: string }`
- **Subscribers:** Email (Confirmation), Audit Log

#### `role.assigned`
- **Type:** User
- **System:** Role & Capability System
- **Payload:** `{ userId: string, oldRole: string, newRole: string, assignedBy: string }`
- **Subscribers:** Email (Role Changed), Site Notification, Audit Log

### Role & Capability Events (5 total)

#### `role.created`
- **Type:** System
- **System:** Role & Capability System
- **Payload:** `{ roleId: string, name: string }`
- **Subscribers:** Audit Log

#### `role.updated`
- **Type:** System
- **System:** Role & Capability System
- **Payload:** `{ roleId: string, name: string, changes: string[] }`
- **Subscribers:** Audit Log

#### `role.deleted`
- **Type:** System
- **System:** Role & Capability System
- **Payload:** `{ roleId: string, name: string }`
- **Subscribers:** Audit Log

#### `role.capability_granted`
- **Type:** System
- **System:** Role & Capability System
- **Payload:** `{ userId: string, capability: string }`
- **Subscribers:** Audit Log

### Password Events (3 total)

#### `password.reset_requested`
- **Type:** Auth
- **System:** Password Management System
- **Payload:** `{ email: string }`
- **Subscribers:** Email (Reset Link), Audit Log

#### `password.reset_completed`
- **Type:** Auth
- **System:** Password Management System
- **Payload:** `{ userId: string }`
- **Subscribers:** Audit Log

#### `password.changed`
- **Type:** Auth
- **System:** Password Management System
- **Payload:** `{ userId: string }`
- **Subscribers:** Email (Confirmation), Site Notification, Audit Log

### Menu Events (4 total)

#### `menu.created`
- **Type:** System
- **System:** Menu System
- **Payload:** `{ menuId: string, name: string }`
- **Subscribers:** Audit Log

#### `menu.updated`
- **Type:** System
- **System:** Menu System
- **Payload:** `{ menuId: string, changes: string[] }`
- **Subscribers:** Site Notification (Admin), Audit Log

#### `menu.deleted`
- **Type:** System
- **System:** Menu System
- **Payload:** `{ menuId: string, name: string }`
- **Subscribers:** Audit Log

#### `menu.location_assigned`
- **Type:** System
- **System:** Menu System
- **Payload:** `{ menuId: string, location: string }`
- **Subscribers:** Site Notification (Admin), Audit Log

### Settings Events (2 total)

#### `settings.updated`
- **Type:** System
- **System:** Settings System
- **Payload:** `{ section: string, changes: string[], updatedBy: string }`
- **Subscribers:** Email (Admin Alert), Site Notification (Admin), Audit Log

#### `settings.permalinks_changed`
- **Type:** System
- **System:** Settings System
- **Payload:** `{ oldStructure: string, newStructure: string }`
- **Subscribers:** Site Notification (Admin), Audit Log

### SEO Events (2 total)

#### `seo.meta_updated`
- **Type:** System
- **System:** SEO System
- **Payload:** `{ postId: string, changes: string[] }`
- **Subscribers:** Site Notification, Audit Log

#### `seo.sitemap_generated`
- **Type:** System
- **System:** SEO/Sitemap System
- **Payload:** `{ url: string, pageCount: number }`
- **Subscribers:** Email (Admin), Site Notification (Admin), Audit Log

### API Events (3 total)

#### `api.key_created`
- **Type:** System
- **System:** API System
- **Payload:** `{ keyId: string, createdBy: string }`
- **Subscribers:** Site Notification (Admin), Audit Log

#### `api.key_revoked`
- **Type:** System
- **System:** API System
- **Payload:** `{ keyId: string, revokedBy: string }`
- **Subscribers:** Audit Log

#### `api.webhook_triggered`
- **Type:** System
- **System:** API System
- **Payload:** `{ endpointId: string, event: string, statusCode: number }`
- **Subscribers:** Email (Failure Alert), Site Notification (Failure), Audit Log

### Notification Events (3 total, self-referential)

#### `notification.email_sent`
- **Type:** Notification
- **System:** Email Notification System
- **Payload:** `{ to: string, subject: string, template: string }`
- **Subscribers:** Audit Log

#### `notification.email_failed`
- **Type:** Notification
- **System:** Email Notification System
- **Payload:** `{ to: string, subject: string, error: string }`
- **Subscribers:** Audit Log, Site Notification (Admin)

#### `notification.site_sent`
- **Type:** Notification
- **System:** Site Notification System
- **Payload:** `{ userId: string, type: string, message: string }`
- **Subscribers:** Audit Log

---

## Admin Routes & UI

The Event Dispatcher System is a **backend-only system** with no dedicated admin routes or UI pages. However, it provides data to pages owned by dependent systems.

### Related Admin Routes (Owned by Other Systems)

#### Activity Log (`/admin/activity`)
- **Owner:** Audit Log System
- **How Event Dispatcher is Used:** Reads `events` table for activity feed
- **Data Requirements:** `events.list` query with `actorId` filter

#### Audit Log (`/admin/audit-log`)
- **Owner:** Audit Log System
- **How Event Dispatcher is Used:** Reads `events` table with full filtering
- **Data Requirements:** `events.list` query with all filters

#### Notification Settings (`/admin/settings/notifications`)
- **Owner:** Site Notification System
- **How Event Dispatcher is Used:** Configures which events trigger notifications
- **Data Requirements:** `events.listListeners` query filtered by notification systems

#### Email Settings (`/admin/settings/email`)
- **Owner:** Email Notification System
- **How Event Dispatcher is Used:** Configures email templates and delivery
- **Data Requirements:** `events.listListeners` query filtered by email notification system

#### My Notifications (`/dashboard/notifications`)
- **Owner:** Site Notification System
- **How Event Dispatcher is Used:** Shows user's notifications (triggered by events)
- **Data Requirements:** Site Notification System's own queries (not Event Dispatcher queries)

### Future: Event Monitor (`/admin/developer/events`)

A developer tool (not V1) that would provide:
- Real-time event stream (Convex subscription on `events` table)
- Event detail inspector (click to view payload, listeners, execution status)
- Listener management UI (register, deactivate, delete listeners)
- Event replay (re-emit a historical event for testing)
- Failure dashboard (events with failed listeners)
- Event statistics (counts by code, by system, over time)

---

## Website Routes

The Event Dispatcher System has **no website-facing routes**. It is entirely a backend infrastructure system. Website features that appear to be "event-driven" (e.g., a user's notification bell) are served by the Site Notification System, which registers listeners with the Event Dispatcher.

---

## Notifications

### Email Notifications (25 templates via Resend)

| Name | Event | Recipients | Priority | Subject |
|------|-------|------------|----------|---------|
| Post Published (Author) | `post.published` | Employee | Immediate | Your post "{title}" is now live! |
| Post Published (Subscribers) | `post.published` | Customer | Batched | New post: {title} |
| Post Scheduled Reminder | `post.scheduled` | Employee | Batched | Your post "{title}" publishes on {date} |
| New Comment on Your Post | `comment.created` | Employee | Immediate | New comment on "{post_title}" |
| Comment Pending Moderation | `comment.created` | Admin | Batched | New comment awaiting moderation |
| Comment Approved | `comment.approved` | Customer | Batched | Your comment was approved |
| Comment Reply Notification | `comment.replied` | Customer | Immediate | Someone replied to your comment |
| Comment Digest | *(digest)* | Employee | Digest | Comments this week on your posts |
| Welcome Email | `registration.user_registered` | Customer | Immediate | Welcome to {site_name}! |
| Email Verification | `registration.user_registered` | Customer | Immediate | Verify your email for {site_name} |
| New User Notification (Admin) | `registration.user_registered` | Admin | Batched | New user registered: {user_email} |
| User Invitation | `registration.user_invited` | Customer | Immediate | You've been invited to {site_name} |
| Login from New Device | `auth.login` | Customer | Immediate | New login detected from {device} |
| Failed Login Attempts | `auth.login_failed` | Admin | Immediate | Multiple failed login attempts detected |
| Password Reset Request | `password.reset_requested` | Customer | Immediate | Reset your password for {site_name} |
| Password Changed Confirmation | `password.changed` | Customer | Immediate | Your password was changed |
| Role Changed | `role.assigned` | Customer | Immediate | Your role has been updated to {role} |
| Revision Restored Alert | `revision.restored` | Employee | Immediate | Post revision restored by {user} |
| Media Storage Warning | `media.uploaded` | Admin | Batched | Storage usage approaching limit |
| Settings Changed Alert | `settings.updated` | Admin | Batched | Site settings were updated |
| Sitemap Generated | `seo.sitemap_generated` | Admin | Batched | Sitemap updated successfully |
| Webhook Failure Alert | `api.webhook_triggered` | Admin | Immediate | Webhook delivery failed: {endpoint} |
| Account Deactivated | `profile.deactivated` | Customer | Immediate | Your account has been deactivated |
| User Deletion Confirmation | `profile.deleted` | Customer | Immediate | Your account has been deleted |
| Weekly Content Digest | *(digest)* | Customer | Digest | Your weekly content summary |

### Site Notifications (30 notification types)

| Name | Event | Type | Persistent | Recipients |
|------|-------|------|-----------|------------|
| Post Published | `post.published` | Success | No | Employee |
| Post Scheduled | `post.scheduled` | Info | Yes | Employee |
| Post Trashed | `post.trashed` | Warning | No | Employee |
| Post Restored | `post.restored` | Success | No | Employee |
| New Comment | `comment.created` | Info | Yes | Employee |
| Pending Comments | `comment.created` | Info | Yes | Admin |
| Comment Approved | `comment.approved` | Success | No | Customer |
| Comment Rejected | `comment.rejected` | Warning | No | Customer |
| Comment Reply | `comment.replied` | Info | Yes | Customer |
| Comment Flagged | `comment.flagged` | Warning | Yes | Admin |
| Media Uploaded | `media.uploaded` | Success | No | Employee |
| Media Deleted | `media.deleted` | Info | No | Employee |
| Revision Created | `revision.created` | Info | No | Employee |
| Revision Restored | `revision.restored` | Warning | Yes | Employee |
| New User Registered | `registration.user_registered` | Info | No | Admin |
| User Invited | `registration.user_invited` | Success | No | Admin |
| Login from New Location | `auth.login` | Warning | Yes | Customer |
| Failed Login Alert | `auth.login_failed` | Error | Yes | Customer |
| Password Changed | `password.changed` | Success | No | Customer |
| Profile Updated | `profile.updated` | Success | No | Customer |
| Avatar Changed | `profile.avatar_changed` | Success | No | Customer |
| Role Changed | `role.assigned` | Info | Yes | Customer |
| Menu Updated | `menu.updated` | Success | No | Admin |
| Menu Location Assigned | `menu.location_assigned` | Info | No | Admin |
| Settings Updated | `settings.updated` | Info | No | Admin |
| Permalink Changed | `settings.permalinks_changed` | Warning | Yes | Admin |
| SEO Updated | `seo.updated` | Info | No | Employee |
| Sitemap Regenerated | `seo.sitemap_generated` | Success | No | Admin |
| API Key Created | `api.key_created` | Info | Yes | Admin |
| Webhook Failed | `api.webhook_triggered` | Error | Yes | Admin |

---

## Role & Capability Matrix

| Action | Administrator | Editor | Author | Contributor | Subscriber |
|--------|:------------:|:------:|:------:|:-----------:|:----------:|
| `event.emit` | System | System | System | System | System |
| `event.register_listener` | Yes | No | No | No | No |
| `event.remove_listener` | Yes | No | No | No | No |
| View event log (via Audit Log) | Yes | Yes | No | No | No |
| View own activity | Yes | Yes | Yes | Yes | Yes |

**Note:** `event.emit` is marked "System" because it is never called directly by users. It is called internally by other mutations. The auth identity of the user performing the original action is captured as the `actorId`.

---

## Dependencies

### Depends On

**None.** The Event Dispatcher is a foundational infrastructure system with zero dependencies. It must be implemented first so that all other systems can emit events from day one.

### Depended On By

| System | Airtable Record | Classification | What They Need |
|--------|----------------|----------------|----------------|
| **Email Notification System** | `recgEU3ehNLTNqWeU` | **Hard** | Registers listeners for events that trigger transactional emails via Resend. Cannot send any emails without the dispatcher routing events to it. |
| **Site Notification System** | `recblHHHRmSWHVImA` | **Hard** | Registers listeners for events that create in-app notifications (bell icon, toasts). No notifications without dispatcher. |
| **Audit Log System** | `recAyYkHacPBt38dI` | **Hard** | Registers a global wildcard listener (`*`) to record all events. The audit log reads directly from the `events` table. Without the dispatcher, there is no audit trail. |
| **Post System** | `rec...` | **Medium** | Calls `emitEvent()` to fire content lifecycle events. Posts work without events but lose all side effects. |
| **Page System** | `rec...` | **Medium** | Same as Post System for page lifecycle events. |
| **Comment System** | `rec...` | **Medium** | Calls `emitEvent()` for comment lifecycle. No notifications without events. |
| **Media System** | `rec...` | **Medium** | Calls `emitEvent()` for upload/delete events. |
| **Taxonomy System** | `rec...` | **Medium** | Calls `emitEvent()` for term CRUD events. |
| **Auth System** | `rec...` | **Medium** | Calls `emitEvent()` for login/logout/failure events. No security alerts without events. |
| **Registration System** | `rec...` | **Medium** | Calls `emitEvent()` for user registration/invitation. No welcome emails without events. |
| **User Profile System** | `rec...` | **Medium** | Calls `emitEvent()` for profile changes. |
| **Role & Capability System** | `rec...` | **Medium** | Calls `emitEvent()` for role changes. No role-change notifications without events. |
| **Password Management System** | `rec...` | **Medium** | Calls `emitEvent()` for password events. No reset emails without events. |
| **Menu System** | `rec...` | **Soft** | Calls `emitEvent()` for menu changes. Menus work fine without events. |
| **Settings System** | `rec...` | **Soft** | Calls `emitEvent()` for settings changes. Settings work fine without events. |
| **SEO/Sitemap System** | `rec...` | **Soft** | Calls `emitEvent()` for sitemap generation. SEO works without events. |
| **API System** | `rec...` | **Soft** | Calls `emitEvent()` for API key and webhook events. |
| **Revision System** | `rec...` | **Soft** | Calls `emitEvent()` for revision events. Revisions work without events. |

---

## Implementation Checklist

### Backend (ConvexPress-Admin/packages/backend/)

- [ ] `convex/schema.ts` - Add 3 tables: `events`, `eventListeners`, `eventListenerExecutions`
- [ ] `convex/events/mutations.ts` - 3 mutations: `emit`, `registerListener`, `removeListener`
- [ ] `convex/events/queries.ts` - 5 queries: `list`, `get`, `countByCode`, `listListeners`, `hasListener`
- [ ] `convex/events/internals.ts` - 2 internal functions: `processEvent`, `retryExecution`
- [ ] `convex/events/validators.ts` - Shared argument validators (eventStatus, handlerType, retryBackoff)
- [ ] `convex/helpers/events.ts` - `emitEvent()` universal helper
- [ ] `convex/helpers/eventFilter.ts` - `evaluateFilter()` filter condition matching
- [ ] `convex/helpers/eventRetry.ts` - `calculateRetryDelay()` retry delay calculation
- [ ] `convex/crons/eventCleanup.ts` - Daily retention cleanup cron
- [ ] `convex/bootstrap/registerListeners.ts` - One-time listener registration for all systems

### Admin Frontend (ConvexPress-Admin/apps/web/)

- [ ] `src/lib/events/types.ts` - TypeScript types for events, listeners, executions
- [ ] `src/lib/events/constants.ts` - Event code constants, system slugs, status enums

### Website Frontend (ConvexPress-Website/apps/web/)

- No files required. The Event Dispatcher has no website-facing UI.

---

## Edge Cases & Gotchas

1. **No listeners registered:** If an event is emitted with no matching listeners, it is still persisted in the `events` table for audit purposes. It is immediately marked as `"completed"` with `listenersTotal: 0`. Do NOT skip event creation.

2. **Listener function removed after registration:** If a handler module or function is removed from the codebase after a listener was registered, execution will fail gracefully and enter the retry loop. After exhausting retries, it will be marked failed with an error message. The listener should be deactivated to prevent continued failures.

3. **Circular event chains:** A listener for `post.published` could emit `notification.email_sent`, which itself has listeners. The `parentEventId` field tracks the chain. **MUST** guard against infinite loops by enforcing a maximum event depth of 5 levels. Check depth before emitting cascading events.

4. **High-volume bulk operations:** During bulk imports (1000+ posts), use `correlationId` to group events and consider: batching event processing in chunks of 50, rate-limiting email notifications (aggregate into digests), temporarily disabling low-priority listeners during bulk imports.

5. **Payload size limits:** Payloads are capped at 100KB of serialized JSON. For events involving large data (e.g., full post content), include only IDs and essential fields. Let listeners fetch full data themselves using the IDs from the payload.

6. **Same-priority listener order:** Two listeners with the same priority have no guaranteed execution order relative to each other. If order matters, use different priority values.

7. **Clock source:** `emittedAt` always uses Convex server's `Date.now()`. Client-provided timestamps are never trusted for event ordering.

8. **Transaction boundaries:** Event emission happens within the same Convex mutation as the triggering action. If the mutation fails, the event is never persisted. This is a feature, not a bug -- it guarantees events represent actual state changes.

9. **Retention policy enforcement:** The daily cleanup cron must batch deletions (100 at a time) to avoid long-running mutations that could time out. Use the `by_expires` index for efficient discovery. Events with longer retention (auth, deletion events) get a later `expiresAt` at emission time.

10. **Filter condition limitations:** Filter conditions only support shallow key-value matching. For complex conditions (e.g., "if media size > 10MB"), the handler function itself must perform the check and return early if the condition is not met.

11. **Wildcard listener performance:** Every `emitEvent()` call makes 3 index queries (exact match, system wildcard, global wildcard). This is efficient in Convex but adds up during bulk operations. Consider caching listener lookups for repeated emissions with the same event code within a single bulk operation.

12. **Event status as state machine:** Valid status transitions are: `pending -> processing -> completed|failed|partial`. Never transition backwards. A `completed` event should never become `failed`.

13. **Idempotency of processEvent:** The `processEvent` function checks `status !== "pending"` before processing. This prevents duplicate processing if the scheduler fires the function multiple times (which can happen under load).

14. **Scheduled function durability:** Convex scheduled functions survive server restarts. Failed retries scheduled via `ctx.scheduler.runAt()` will execute even after a brief outage.

---

## WordPress Functions Reference

| WordPress | ConvexPress | Notes |
|-----------|-------------|-------|
| `do_action($hook, ...$args)` | `emitEvent(ctx, code, system, payload)` | ConvexPress persists the event; WordPress is fire-and-forget |
| `add_action($hook, $callback, $priority)` | `events.registerListener` mutation | ConvexPress stores in DB; WordPress stores in `$wp_filter` array |
| `remove_action($hook, $callback)` | `events.removeListener` mutation | ConvexPress supports soft-delete (deactivate) |
| `has_action($hook)` | `events.hasListener` query | Both return boolean |
| `did_action($hook)` | `events.countByCode` query | ConvexPress persists count permanently; WordPress only within request |
| `current_action()` | Event data in handler args | ConvexPress passes event explicitly; WordPress uses global state |
| `apply_filters($hook, $value)` | Not implemented | Convex mutations handle transformations |
| `add_filter($hook, $callback)` | Not implemented | May be added as separate `eventFilters` system in future |
| `remove_filter($hook, $callback)` | Not implemented | N/A |
| `remove_all_actions($hook)` | Query listeners by code, deactivate each | No single function; iterate and deactivate |
| `doing_action($hook)` | Check event status === "processing" | Query events table |
| `$wp_filter` global | `eventListeners` table | Database replaces global array |

---

## Event Retention Policy

| Event Category | Retention | Rationale |
|---------------|-----------|-----------|
| Auth events (`auth.login`, `auth.logout`, `auth.login_failed`, etc.) | 365 days | Security audit trail |
| Deletion events (`*.deleted`, `profile.deactivated`, etc.) | 365 days | Compliance / recovery |
| Role changes (`role.*`) | 365 days | Access control audit |
| Password events (`password.*`) | 365 days | Security audit |
| Audit events (`audit.cleared`, `audit.exported`) | 365 days | Compliance |
| Settings events (`settings.*`) | 180 days | Configuration audit |
| Theme activation/config events | 180 days | Configuration audit |
| Content events (`post.*`, `page.*`) | 90 days | Standard activity (default) |
| Comment events (`comment.*`) | 90 days | Standard activity (default) |
| All other events | 90 days | Default |
| Notification events (`notification.*`, `email.*`) | 30 days | Operational data only |
| High-frequency noise (`editor.autosaved`, `auth.session_refreshed`) | 7 days | Low-value, high-volume |

---

## Event Code Constants

All event codes are defined as TypeScript constants in `convex/events/constants.ts` (backend) and re-exported in `src/lib/events/constants.ts` (frontend). The implementation expanded the original 63 codes to **101 event codes** across 24 systems.

**Note:** The following codes differ from the original PRD naming:
- `auth.login` (was: `auth.logged_in`)
- `auth.logout` (was: `auth.logged_out`)
- `seo.meta_updated` (was: `seo.updated`)
- `registration.registered` exists alongside `registration.user_registered`

The implementation codes are canonical. See `convex/events/constants.ts` for the full list organized by system (POST_EVENTS, PAGE_EVENTS, AUTH_EVENTS, etc.).

```typescript
// Example usage - import system-specific constants:
import { AUTH_EVENTS, POST_EVENTS } from "../events/constants";
// AUTH_EVENTS.LOGIN = "auth.login"
// POST_EVENTS.PUBLISHED = "post.published"

// System slugs - see convex/events/constants.ts SYSTEM export
// Includes all 28 system slugs: post, page, media, taxonomy, comment,
// role, profile, auth, password, registration, dashboard, editor,
// custom_field, revision, seo, search, menu, settings, email,
// notification, audit, api, event, routing, widget, theme, feed, sitemap
} as const;
```

---

## Listener Registration Strategy

Listeners are registered during system initialization via a bootstrap script, not at runtime. Each system owns its listener registrations. The bootstrap script uses an upsert pattern (check if listener exists by eventCode + name, update if so, insert if not).

**Key patterns for listener registration:**

| Handler Type | When to Use | Example |
|-------------|------------|---------|
| `"internal"` | Handler writes to Convex DB (notifications, audit log) | Site notification creation |
| `"action"` | Handler calls external APIs (Resend, webhooks) | Email sending via Resend |
| `"scheduled"` | Handler should run later (digest emails, batch processing) | Weekly content digest |

**Priority conventions:**
- `1-9`: Critical system handlers (e.g., security alerts)
- `10`: Default priority for most handlers
- `20-30`: Secondary effects (e.g., subscriber emails after author email)
- `50-80`: Low-priority handlers (e.g., analytics, search indexing)
- `99`: Audit log (always runs last, after all other handlers complete)

---

## Performance Considerations

1. **Event emission cost:** Each `emitEvent()` call: 1 payload validation + 3 listener queries (exact/wildcard/global) + 1 event insert + N execution inserts + 1 scheduled function. For 3 listeners: ~7 DB operations.

2. **Processing throughput:** Convex scheduled functions run concurrently. Multiple events process in parallel. Listeners within a single event run sequentially by priority.

3. **Retention cleanup:** Daily cron batches deletions (100 at a time) using `by_expires` index.

4. **Payload discipline:** Keep payloads small (IDs + essential fields only). Listeners fetch full data if needed.
