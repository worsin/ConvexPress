/**
 * Event Dispatcher System - Core emitEvent Helper
 *
 * THE universal event emission function. Every system in SmithHarper CMS
 * calls this to emit events. It is designed to be called from within
 * authenticated mutations (after the caller has already passed auth checks).
 *
 * emitEvent does NOT check capabilities itself - it trusts that the calling
 * mutation already validated authorization via requireCan(). This is by design:
 * the event system is infrastructure, not a user-facing feature.
 *
 * Flow:
 *   1. Validate the event code format (system.action, lowercase, known code)
 *   2. Check event chain depth guard (max 5 levels, prevents infinite loops)
 *   3. Resolve actor identity (from options or ctx.auth)
 *   4. Serialize payload and validate size (max 100KB)
 *   5. Query matching listeners (exact code + wildcard patterns)
 *   6. Calculate retention policy
 *   7. Insert the event record
 *   8. Create execution records for each matched listener
 *   9. Schedule async processing via ctx.scheduler
 *   10. Return the event ID
 *
 * Usage:
 *   import { emitEvent } from "../helpers/events";
 *
 *   // Inside a mutation handler:
 *   await emitEvent(ctx, "post.created", "post", {
 *     postId: newPostId,
 *     title: args.title,
 *     authorId: user._id,
 *   });
 */

import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import { matchesEventCode, getRetentionMs, isValidEventCode } from "../events/constants";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EmitEventOptions {
  /** WorkOS user ID of the actor. Auto-resolved from ctx.auth if omitted. */
  actorId?: string;

  /** IP address of the actor (for audit logging). */
  actorIp?: string;

  /** Correlation ID for tracing related events across systems. */
  correlationId?: string;

  /** Parent event ID for event chains (event A triggers event B). */
  parentEventId?: Id<"events">;
}

// ─── Constants ─────────────────────────────────────────────────────────────

/** Maximum allowed event chain depth to prevent circular/infinite loops. */
const MAX_EVENT_CHAIN_DEPTH = 5;

/** Maximum payload size in bytes (100KB). */
const MAX_PAYLOAD_SIZE = 102400;

// ─── Core Function ──────────────────────────────────────────────────────────

/**
 * Emit an event into the Event Dispatcher System.
 *
 * This is a synchronous (within the mutation transaction) operation that:
 *   - Inserts the event record
 *   - Creates execution records for matched listeners
 *   - Schedules async processing
 *
 * The actual listener execution happens asynchronously after the calling
 * mutation's transaction commits.
 *
 * @param ctx - Convex MutationCtx (must be a write context for inserts + scheduler)
 * @param code - Event code (e.g., "post.created"). Should be from events/constants.ts
 * @param system - System slug that originated the event (e.g., "post")
 * @param payload - Event payload object. Will be JSON-serialized.
 * @param options - Optional: actorId, actorIp, correlationId, parentEventId
 * @returns The ID of the newly created event document
 */
export async function emitEvent(
  ctx: MutationCtx,
  code: string,
  system: string,
  payload: Record<string, unknown>,
  options?: EmitEventOptions,
): Promise<Id<"events">> {
  // ─── 1. Validate event code format ──────────────────────────────────────
  if (!code.includes(".")) {
    throw new Error(
      `Invalid event code format: "${code}". Must be "system.action" (e.g., "post.created").`,
    );
  }

  // Validate two-segment system.action format and enforce lowercase
  const segments = code.split(".");
  if (segments.length !== 2 || code !== code.toLowerCase()) {
    throw new Error(
      `Invalid event code format: "${code}". Must be lowercase "system.action" (exactly two segments).`,
    );
  }

  // Warn (log) if the event code is not in the known catalog.
  // This is a warning, not an error, to allow incremental addition of new codes.
  if (!isValidEventCode(code)) {
    console.warn(
      `[EventDispatcher] Unrecognized event code "${code}". ` +
      `Consider adding it to events/constants.ts for type safety.`,
    );
  }

  // ─── 2. Check event chain depth (circular loop guard) ─────────────────
  if (options?.parentEventId) {
    let depth = 0;
    let currentId: Id<"events"> | undefined = options.parentEventId;
    while (currentId && depth < MAX_EVENT_CHAIN_DEPTH) {
      const parentEventDoc: Awaited<ReturnType<typeof ctx.db.get>> = await ctx.db.get("events", currentId);
      if (!parentEventDoc) break;
      currentId = parentEventDoc.parentEventId;
      depth++;
    }
    if (depth >= MAX_EVENT_CHAIN_DEPTH) {
      console.warn(
        `[EventDispatcher] Event chain depth exceeded (${MAX_EVENT_CHAIN_DEPTH}) for code "${code}". ` +
        `Skipping listener dispatch to prevent infinite recursion.`,
      );
      // Still insert the event for audit trail, but mark as completed
      // with 0 listeners to preserve the record without triggering processing.
      const now = Date.now();
      const retentionMs = getRetentionMs(code);
      const eventId = await ctx.db.insert("events", {
        code,
        system,
        payload: JSON.stringify(payload),
        actorId: options?.actorId,
        actorIp: options?.actorIp,
        status: "completed",
        listenersTotal: 0,
        listenersCompleted: 0,
        listenersFailed: 0,
        listenersSkipped: 0,
        correlationId: options?.correlationId,
        parentEventId: options.parentEventId,
        emittedAt: now,
        processedAt: now,
        expiresAt: now + retentionMs,
      });
      return eventId;
    }
  }

  // ─── 3. Resolve actor identity ──────────────────────────────────────────
  let actorId = options?.actorId;
  if (!actorId) {
    try {
      const identity = await ctx.auth.getUserIdentity();
      if (identity) {
        actorId = identity.subject;
      }
    } catch {
      // No auth context available (system-initiated event). This is fine.
    }
  }

  // ─── 4. Serialize payload and validate size ────────────────────────────
  const payloadJson = JSON.stringify(payload);
  if (payloadJson.length > MAX_PAYLOAD_SIZE) {
    throw new Error(
      `Event payload exceeds ${MAX_PAYLOAD_SIZE / 1024}KB limit ` +
      `(${payloadJson.length} bytes) for code "${code}". ` +
      `Include only IDs and essential fields; let listeners fetch full data.`,
    );
  }

  // ─── 5. Query matching listeners ────────────────────────────────────────
  // We need to find listeners that match this event code:
  //   a) Exact match: eventCode === code
  //   b) System wildcard: eventCode === "post.*" for code "post.created"
  //   c) Global wildcard: eventCode === "*"
  //
  // Convex doesn't support LIKE/pattern queries, so we query all active
  // listeners and filter in-memory. This is acceptable because the listener
  // table is small (typically < 200 records total across all systems).

  const activeListeners = await ctx.db
    .query("eventListeners")
    .withIndex("by_active", (q) => q.eq("isActive", true))
    .take(100);

  // Filter to those whose eventCode pattern matches this event code
  const matchedListeners = activeListeners
    .filter((listener) => matchesEventCode(code, listener.eventCode))
    .sort((a, b) => a.priority - b.priority); // Lower priority number = runs first

  // ─── 6. Calculate retention ─────────────────────────────────────────────
  const now = Date.now();
  const retentionMs = getRetentionMs(code);
  const expiresAt = now + retentionMs;

  // ─── 7. Insert event record ─────────────────────────────────────────────
  const eventId = await ctx.db.insert("events", {
    code,
    system,
    payload: payloadJson,
    actorId,
    actorIp: options?.actorIp,
    status: matchedListeners.length > 0 ? "pending" : "completed",
    listenersTotal: matchedListeners.length,
    listenersCompleted: 0,
    listenersFailed: 0,
    listenersSkipped: 0,
    correlationId: options?.correlationId,
    parentEventId: options?.parentEventId,
    emittedAt: now,
    processedAt: matchedListeners.length > 0 ? undefined : now,
    expiresAt,
  });

  // ─── 8. Create execution records ───────────────────────────────────────
  if (matchedListeners.length > 0) {
    for (const listener of matchedListeners) {
      await ctx.db.insert("eventListenerExecutions", {
        eventId,
        listenerId: listener._id,
        status: "pending",
        attempt: 0,
        startedAt: undefined,
        completedAt: undefined,
        duration: undefined,
        result: undefined,
        error: undefined,
        nextRetryAt: undefined,
        scheduledFunctionId: undefined,
      });
    }

    // ─── 9. Schedule async processing ───────────────────────────────────
    await ctx.scheduler.runAfter(
      0,
      internal.events.internals.processEvent,
      { eventId },
    );
  }

  return eventId;
}
