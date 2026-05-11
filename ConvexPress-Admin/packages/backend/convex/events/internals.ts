/**
 * Event Dispatcher System - Internal Functions
 *
 * Functions that are NOT callable from clients. Used for:
 *   - Asynchronous event processing (scheduled by emitEvent)
 *   - Retry logic for failed listener executions
 *   - Retention cleanup (expired event garbage collection)
 *
 * Internal functions use internalMutation and are invoked via
 * ctx.scheduler.runAfter or from other server-side functions.
 *
 * Handler dispatch resolves the actual Convex internal function referenced
 * by each listener's handlerModule + handlerFunction fields and schedules
 * it via ctx.scheduler.runAfter(). All handlers receive { eventId } as args.
 */

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import type { SchedulableFunctionReference } from "convex/server";
import { v } from "convex/values";
import { evaluateFilter } from "../helpers/eventFilter";
import { shouldRetry, getNextRetryAt } from "../helpers/eventRetry";
import { processEventArgs, retryExecutionArgs } from "./validators";

// ─── Handler Resolution ───────────────────────────────────────────────────

/**
 * Resolve a handler function reference from the `internal` API object.
 *
 * Given a handlerModule like "notifications/internals" and handlerFunction
 * like "onEvent", this navigates the Convex `internal` API tree to find
 * the actual function reference.
 *
 * Module path convention:
 *   - "notifications/internals" -> internal.notifications.internals
 *   - "auditLogs/internals"    -> internal.auditLogs.internals
 *   - "emails/internals"       -> internal.emails.internals
 *
 * @returns The resolved function reference, or null if not found
 */
function resolveHandler(
  handlerModule: string,
  handlerFunction: string,
): SchedulableFunctionReference | null {
  try {
    // Split module path (e.g., "notifications/internals" -> ["notifications", "internals"])
    const parts = handlerModule.split("/");

    // Navigate the internal API tree
    let current: Record<string, unknown> = internal as unknown as Record<string, unknown>;
    for (const part of parts) {
      if (!current || typeof current !== "object" || !(part in current)) {
        return null;
      }
      current = current[part] as Record<string, unknown>;
    }

    // Resolve the function name
    if (!current || typeof current !== "object" || !(handlerFunction in current)) {
      return null;
    }

    return current[handlerFunction] as SchedulableFunctionReference;
  } catch {
    return null;
  }
}

// ─── Process Event ─────────────────────────────────────────────────────────

/**
 * Process all listener executions for an event.
 *
 * This is the core async processor scheduled by emitEvent(). It:
 *   1. Fetches the event and validates it's still pending
 *   2. Transitions event status to "processing"
 *   3. Fetches all execution records for this event
 *   4. For each execution (sorted by listener priority):
 *      a. Loads the listener definition
 *      b. Evaluates the filter condition against the payload
 *      c. If filter passes: resolves and schedules the handler function
 *      d. If filter fails: marks execution as "skipped"
 *   5. Updates event status to completed/failed/partial based on results
 *
 * Idempotency: If the event is no longer "pending" (e.g., already being
 * processed by a duplicate schedule), this function exits early.
 */
export const processEvent = internalMutation({
  args: processEventArgs,
  handler: async (ctx, args) => {
    // ─── 1. Load and validate event ───────────────────────────────────────
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return;

    // Idempotency guard: only process events in "pending" status
    if (event.status !== "pending") return;

    // ─── 2. Transition to "processing" ────────────────────────────────────
    await ctx.db.patch("events", args.eventId, { status: "processing" });

    // ─── 3. Load execution records ────────────────────────────────────────
    const executions = await ctx.db
      .query("eventListenerExecutions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    if (executions.length === 0) {
      // No executions found (edge case). Mark event as completed.
      await ctx.db.patch("events", args.eventId, {
        status: "completed",
        processedAt: Date.now(),
      });
      return;
    }

    // Parse the event payload once for filter evaluation
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(event.payload);
    } catch {
      // If payload is unparseable, filter evaluation will use empty object.
      // Listeners without filters will still execute.
    }

    // ─── 4. Process each execution ────────────────────────────────────────
    // Load all listeners first to sort executions by priority
    const executionsWithListeners = await Promise.all(
      executions.map(async (exec) => {
        const listener = await ctx.db.get("eventListeners", exec.listenerId);
        return { exec, listener };
      }),
    );

    // Sort by listener priority (lower number = higher priority = runs first)
    executionsWithListeners.sort((a, b) => {
      const priorityA = a.listener?.priority ?? 999;
      const priorityB = b.listener?.priority ?? 999;
      return priorityA - priorityB;
    });

    let completedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const { exec, listener } of executionsWithListeners) {
      if (!listener) {
        // Listener was deleted between emit and processing. Skip.
        await ctx.db.patch("eventListenerExecutions", exec._id, {
          status: "skipped",
          error: "Listener not found at processing time",
          completedAt: Date.now(),
        });
        skippedCount++;
        continue;
      }

      // Check if listener is still active
      if (!listener.isActive) {
        await ctx.db.patch("eventListenerExecutions", exec._id, {
          status: "skipped",
          error: "Listener deactivated before processing",
          completedAt: Date.now(),
        });
        skippedCount++;
        continue;
      }

      // ─── 4a. Evaluate filter condition ──────────────────────────────────
      if (listener.filterCondition) {
        const matches = evaluateFilter(payload, listener.filterCondition);
        if (!matches) {
          await ctx.db.patch("eventListenerExecutions", exec._id, {
            status: "skipped",
            error: "Filter condition did not match payload",
            completedAt: Date.now(),
          });
          skippedCount++;
          continue;
        }
      }

      // ─── 4b. Resolve and dispatch handler ─────────────────────────────
      const startedAt = Date.now();

      try {
        // Resolve the handler function from the internal API tree
        const handler = resolveHandler(
          listener.handlerModule,
          listener.handlerFunction,
        );

        if (!handler) {
          throw new Error(
            `Handler not found: internal.${listener.handlerModule.replace(/\//g, ".")}.${listener.handlerFunction}`,
          );
        }

        // All handler types are dispatched via scheduler.
        // The handler function receives { eventId } as its argument,
        // matching the convention used by all downstream system handlers
        // (notifications/internals.onEvent, auditLogs/internals.createEntry,
        // emails/internals.onPostPublished, etc.)
        const handlerArgs = { eventId: args.eventId };

        if (listener.handlerType === "scheduled") {
          // Scheduled handlers run after a delay (use retry delay as the schedule delay)
          await ctx.scheduler.runAfter(
            listener.retryDelayMs,
            handler,
            handlerArgs,
          );
        } else {
          // "internal" and "action" handlers run immediately via scheduler
          await ctx.scheduler.runAfter(0, handler, handlerArgs);
        }

        // Mark execution as completed (handler was successfully scheduled)
        const completedAt = Date.now();
        await ctx.db.patch("eventListenerExecutions", exec._id, {
          status: "completed",
          attempt: 1,
          startedAt,
          completedAt,
          duration: completedAt - startedAt,
          result: JSON.stringify({
            dispatched: true,
            handler: `${listener.handlerModule}.${listener.handlerFunction}`,
            handlerType: listener.handlerType,
          }),
        });

        completedCount++;
      } catch (error: unknown) {
        // Handle execution failure with retry logic
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const now = Date.now();
        const attempt = exec.attempt + 1;

        if (shouldRetry(attempt, listener.maxRetries)) {
          // Schedule retry
          const nextRetryAt = getNextRetryAt(
            now,
            attempt,
            listener.retryDelayMs,
            listener.retryBackoff,
          );

          await ctx.db.patch("eventListenerExecutions", exec._id, {
            status: "retrying",
            attempt,
            error: errorMessage,
            startedAt,
            completedAt: now,
            duration: now - startedAt,
            nextRetryAt,
          });

          // Schedule the retry
          const retryDelayMs = nextRetryAt - now;
          await ctx.scheduler.runAfter(
            retryDelayMs,
            internal.events.internals.retryExecution,
            { executionId: exec._id },
          );
        } else {
          // Max retries exhausted - mark as failed
          await ctx.db.patch("eventListenerExecutions", exec._id, {
            status: "failed",
            attempt,
            error: errorMessage,
            startedAt,
            completedAt: now,
            duration: now - startedAt,
          });
          failedCount++;
        }
      }
    }

    // ─── 5. Update event status based on results ──────────────────────────
    const now = Date.now();

    // Determine final event status
    const totalProcessed = completedCount + failedCount + skippedCount;
    const pendingRetries = executions.length - totalProcessed;

    let finalStatus: "completed" | "failed" | "partial" | "processing";

    if (pendingRetries > 0) {
      // Some executions are still retrying - keep as processing
      finalStatus = "processing";
    } else if (failedCount === 0) {
      finalStatus = "completed";
    } else if (completedCount === 0 && skippedCount === 0) {
      finalStatus = "failed";
    } else {
      finalStatus = "partial";
    }

    await ctx.db.patch("events", args.eventId, {
      status: finalStatus,
      listenersCompleted: completedCount,
      listenersFailed: failedCount,
      listenersSkipped: skippedCount,
      processedAt: finalStatus !== "processing" ? now : undefined,
    });
  },
});

// ─── Retry Execution ───────────────────────────────────────────────────────

/**
 * Retry a failed listener execution.
 *
 * Scheduled by processEvent when an execution fails but has retries remaining.
 * Re-resolves the handler and attempts dispatch again.
 * If it fails again and retries remain, schedules another retry.
 * If all retries are exhausted, marks the execution as permanently failed
 * and updates the parent event's status.
 */
export const retryExecution = internalMutation({
  args: retryExecutionArgs,
  handler: async (ctx, args) => {
    // ─── Load execution and validate ──────────────────────────────────────
    const execution = await ctx.db.get("eventListenerExecutions", args.executionId);
    if (!execution) return;

    // Only retry executions that are actually in "retrying" status
    if (execution.status !== "retrying") return;

    const listener = await ctx.db.get("eventListeners", execution.listenerId);
    if (!listener) {
      // Listener was deleted. Mark execution as failed.
      await ctx.db.patch("eventListenerExecutions", args.executionId, {
        status: "failed",
        error: "Listener deleted during retry",
        completedAt: Date.now(),
      });
      await updateEventAfterRetry(ctx, execution.eventId);
      return;
    }

    // Check if listener is still active
    if (!listener.isActive) {
      await ctx.db.patch("eventListenerExecutions", args.executionId, {
        status: "skipped",
        error: "Listener deactivated during retry",
        completedAt: Date.now(),
      });
      await updateEventAfterRetry(ctx, execution.eventId);
      return;
    }

    // ─── Attempt handler dispatch ─────────────────────────────────────────
    const startedAt = Date.now();
    const attempt = execution.attempt + 1;

    try {
      // Resolve the handler function from the internal API tree
      const handler = resolveHandler(
        listener.handlerModule,
        listener.handlerFunction,
      );

      if (!handler) {
        throw new Error(
          `Handler not found: internal.${listener.handlerModule.replace(/\//g, ".")}.${listener.handlerFunction}`,
        );
      }

      const handlerArgs = { eventId: execution.eventId };

      if (listener.handlerType === "scheduled") {
        await ctx.scheduler.runAfter(listener.retryDelayMs, handler, handlerArgs);
      } else {
        await ctx.scheduler.runAfter(0, handler, handlerArgs);
      }

      const completedAt = Date.now();

      await ctx.db.patch("eventListenerExecutions", args.executionId, {
        status: "completed",
        attempt,
        startedAt,
        completedAt,
        duration: completedAt - startedAt,
        result: JSON.stringify({
          dispatched: true,
          handler: `${listener.handlerModule}.${listener.handlerFunction}`,
          retryAttempt: attempt,
        }),
        error: undefined,
        nextRetryAt: undefined,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const now = Date.now();

      if (shouldRetry(attempt, listener.maxRetries)) {
        // Schedule another retry
        const nextRetryAt = getNextRetryAt(
          now,
          attempt,
          listener.retryDelayMs,
          listener.retryBackoff,
        );

        await ctx.db.patch("eventListenerExecutions", args.executionId, {
          status: "retrying",
          attempt,
          error: errorMessage,
          startedAt,
          completedAt: now,
          duration: now - startedAt,
          nextRetryAt,
        });

        const retryDelayMs = nextRetryAt - now;
        await ctx.scheduler.runAfter(
          retryDelayMs,
          internal.events.internals.retryExecution,
          { executionId: args.executionId },
        );

        return; // Don't update event status yet - still retrying
      } else {
        // Max retries exhausted
        await ctx.db.patch("eventListenerExecutions", args.executionId, {
          status: "failed",
          attempt,
          error: errorMessage,
          startedAt,
          completedAt: now,
          duration: now - startedAt,
          nextRetryAt: undefined,
        });
      }
    }

    // ─── Update parent event status ───────────────────────────────────────
    await updateEventAfterRetry(ctx, execution.eventId);
  },
});

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * After a retry completes (success or final failure), re-evaluate the
 * parent event's status based on all its execution records.
 */
async function updateEventAfterRetry(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<void> {
  const event = await ctx.db.get("events", eventId);
  if (!event) return;

  const executions = await ctx.db
    .query("eventListenerExecutions")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();

  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let pending = 0;

  for (const exec of executions) {
    switch (exec.status) {
      case "completed":
        completed++;
        break;
      case "failed":
        failed++;
        break;
      case "skipped":
        skipped++;
        break;
      case "pending":
      case "running":
      case "retrying":
        pending++;
        break;
    }
  }

  // If there are still pending/running/retrying executions, keep processing
  if (pending > 0) return;

  const now = Date.now();

  let finalStatus: "completed" | "failed" | "partial";
  if (failed === 0) {
    finalStatus = "completed";
  } else if (completed === 0 && skipped === 0) {
    finalStatus = "failed";
  } else {
    finalStatus = "partial";
  }

  await ctx.db.patch("events", eventId, {
    status: finalStatus,
    listenersCompleted: completed,
    listenersFailed: failed,
    listenersSkipped: skipped,
    processedAt: now,
  });
}

// ─── Retention Cleanup ────────────────────────────────────────────────────

/** Batch size for cleanup operations */
const CLEANUP_BATCH_SIZE = 100;

/**
 * Daily retention cleanup for expired events.
 *
 * Queries the `events` table via the `by_expires` index for events
 * with `expiresAt < Date.now()`. For each expired event:
 *   1. Deletes all related `eventListenerExecutions`
 *   2. Deletes the event record itself
 *
 * Processes in batches of 100 to avoid long-running mutations.
 * Schedules continuation if more expired events remain.
 *
 * This function is called by the daily cron job in `crons.ts`.
 * It does NOT emit events (avoids recursive cleanup).
 */
export const retentionCleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Query expired events (expiresAt is set and has passed)
    const expiredEvents = await ctx.db
      .query("events")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .take(CLEANUP_BATCH_SIZE);

    if (expiredEvents.length === 0) return;

    let deletedEvents = 0;
    let deletedExecutions = 0;

    for (const event of expiredEvents) {
      // Delete all execution records for this event
      const executions = await ctx.db
        .query("eventListenerExecutions")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .collect();

      for (const exec of executions) {
        await ctx.db.delete("eventListenerExecutions", exec._id);
        deletedExecutions++;
      }

      // Delete the event itself
      await ctx.db.delete("events", event._id);
      deletedEvents++;
    }

    // If we got a full batch, schedule continuation for more
    if (expiredEvents.length === CLEANUP_BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.events.internals.cleanupBatch,
        { deletedSoFar: deletedEvents },
      );
    }
  },
});

/**
 * Batch continuation for event retention cleanup.
 *
 * Scheduled by `retentionCleanup` when more than CLEANUP_BATCH_SIZE
 * expired events exist. Continues until all expired events are removed.
 */
export const cleanupBatch = internalMutation({
  args: {
    deletedSoFar: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const expiredEvents = await ctx.db
      .query("events")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .take(CLEANUP_BATCH_SIZE);

    if (expiredEvents.length === 0) return;

    let deletedInBatch = 0;

    for (const event of expiredEvents) {
      // Delete all execution records for this event
      const executions = await ctx.db
        .query("eventListenerExecutions")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .take(1000);

      for (const exec of executions) {
        await ctx.db.delete("eventListenerExecutions", exec._id);
      }

      // Delete the event itself
      await ctx.db.delete("events", event._id);
      deletedInBatch++;
    }

    const totalDeleted = args.deletedSoFar + deletedInBatch;

    // Continue if there may be more
    if (expiredEvents.length === CLEANUP_BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.events.internals.cleanupBatch,
        { deletedSoFar: totalDeleted },
      );
    }
  },
});
