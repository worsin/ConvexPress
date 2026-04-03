/**
 * Event Dispatcher System - Schema
 *
 * Three tables powering the central event bus:
 *
 *   - events: Every emitted event in the system. Stores the event code,
 *     originating system, JSON-serialized payload, processing status, and
 *     listener completion tracking. Indexes support filtering by code,
 *     system, status, actor, correlation chain, and TTL expiration.
 *
 *   - eventListeners: Registered handlers that respond to specific event
 *     codes. Each listener points to a Convex function (module + export name),
 *     has a priority for ordering, and configurable retry behavior. Listeners
 *     can be active/inactive and optionally apply a JSON filter condition
 *     to skip irrelevant payloads.
 *
 *   - eventListenerExecutions: Per-event, per-listener execution records.
 *     Tracks status, attempt count, timing, error messages, and retry
 *     scheduling. This is the join table between events and eventListeners.
 *
 * All three tables are owned by the Event Dispatcher System.
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

export const eventsTables = {
  // ─── Events ──────────────────────────────────────────────────────────────
  events: defineTable({
    /** Event code in "system.action" format, e.g. "post.created" */
    code: v.string(),

    /** Originating system slug, e.g. "post", "role", "comment" */
    system: v.string(),

    /** JSON-serialized payload. Kept as string for schema stability. */
    payload: v.string(),

    /** User identifier of the actor who triggered the event (if user-initiated) */
    actorId: v.optional(v.string()),

    /** IP address of the actor (if available, for audit logging) */
    actorIp: v.optional(v.string()),

    /** Processing status of the event */
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("partial"),
    ),

    /** Total number of listeners matched at emit time */
    listenersTotal: v.number(),

    /** Number of listeners that completed successfully */
    listenersCompleted: v.number(),

    /** Number of listeners that failed all retry attempts */
    listenersFailed: v.number(),

    /** Number of listeners that were skipped (filter mismatch, deactivated, or deleted) */
    listenersSkipped: v.optional(v.number()),

    /** Optional correlation ID for tracing related events across systems */
    correlationId: v.optional(v.string()),

    /** Optional parent event ID for event chains (event A triggers event B) */
    parentEventId: v.optional(v.id("events")),

    /** Timestamp when the event was emitted */
    emittedAt: v.number(),

    /** Timestamp when processing completed (all listeners finished) */
    processedAt: v.optional(v.number()),

    /** TTL: when this event record can be garbage-collected */
    expiresAt: v.optional(v.number()),
  })
    .index("by_code", ["code"])
    .index("by_system", ["system"])
    .index("by_code_emitted", ["code", "emittedAt"])
    .index("by_code_and_actor", ["code", "actorId"])
    .index("by_status", ["status"])
    .index("by_actor", ["actorId", "emittedAt"])
    .index("by_correlation", ["correlationId"])
    .index("by_emitted", ["emittedAt"])
    .index("by_expires", ["expiresAt"]),

  // ─── Event Listeners ─────────────────────────────────────────────────────
  eventListeners: defineTable({
    /** The event code this listener responds to (e.g. "post.created") */
    eventCode: v.string(),

    /** Human-readable name for identification and debugging */
    name: v.string(),

    /**
     * Module path within the Convex backend where the handler lives.
     * Example: "notifications/internals" -> convex/notifications/internals.ts
     */
    handlerModule: v.string(),

    /** Exported function name within the handler module */
    handlerFunction: v.string(),

    /**
     * How the handler is invoked:
     *   - "internal": internalMutation/internalQuery (same-transaction-safe)
     *   - "action":   internalAction (for external calls, side effects)
     *   - "scheduled": ctx.scheduler.runAfter with delay
     */
    handlerType: v.union(
      v.literal("internal"),
      v.literal("action"),
      v.literal("scheduled"),
    ),

    /** Execution priority. Lower numbers run first. Default: 10 */
    priority: v.number(),

    /** Whether this listener is currently active */
    isActive: v.boolean(),

    /** Max retry attempts before marking as failed. Default: 3 */
    maxRetries: v.number(),

    /** Base delay between retries in milliseconds. Default: 1000 */
    retryDelayMs: v.number(),

    /** Retry backoff strategy */
    retryBackoff: v.union(v.literal("linear"), v.literal("exponential")),

    /**
     * Optional JSON filter condition. If set, the listener only fires
     * when the event payload matches this shallow condition.
     * Example: '{"postType":"page"}' -> only fires for page events.
     */
    filterCondition: v.optional(v.string()),

    /** System that owns this listener (e.g. "notification", "audit") */
    system: v.string(),

    /** Optional description for admin UI / documentation */
    description: v.optional(v.string()),

    /** Timestamps */
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_event_code", ["eventCode", "isActive", "priority"])
    .index("by_system", ["system"])
    .index("by_active", ["isActive"]),

  // ─── Event Listener Executions ───────────────────────────────────────────
  eventListenerExecutions: defineTable({
    /** The event that triggered this execution */
    eventId: v.id("events"),

    /** The listener being executed */
    listenerId: v.id("eventListeners"),

    /** Execution status */
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("retrying"),
      v.literal("skipped"),
    ),

    /** Current attempt number (starts at 1) */
    attempt: v.number(),

    /** JSON-serialized result from the handler (if successful) */
    result: v.optional(v.string()),

    /** Error message from the handler (if failed) */
    error: v.optional(v.string()),

    /** Timestamp when this execution attempt started */
    startedAt: v.optional(v.number()),

    /** Timestamp when this execution attempt completed */
    completedAt: v.optional(v.number()),

    /** Duration in ms of the last attempt */
    duration: v.optional(v.number()),

    /** Timestamp for the next retry (if status is "retrying") */
    nextRetryAt: v.optional(v.number()),

    /** Convex scheduled function ID (for tracking scheduled handlers) */
    scheduledFunctionId: v.optional(v.string()),
  })
    .index("by_event", ["eventId"])
    .index("by_listener", ["listenerId"])
    .index("by_status", ["status"])
    .index("by_retry", ["status", "nextRetryAt"]),
};
