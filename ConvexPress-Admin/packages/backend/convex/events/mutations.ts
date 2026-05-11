/**
 * Event Dispatcher System - Mutations
 *
 * Public write operations for the event system.
 *
 * Mutations:
 *   emit             - Emit an event directly (for when the emitEvent helper can't be used)
 *   registerListener - Register a new event listener (requires event.register_listener)
 *   removeListener   - Deactivate a listener (requires event.remove_listener)
 *
 * Note: Most event emission happens via the emitEvent() helper called from
 * other system mutations. The `emit` mutation here is for edge cases where
 * a client or external system needs to trigger an event directly.
 */

import { ConvexError } from "convex/values";
import { mutation } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { isValidFilterCondition } from "../helpers/eventFilter";
import { LISTENER_DEFAULTS } from "./constants";
import {
  emitEventArgs,
  registerListenerArgs,
  removeListenerArgs,
} from "./validators";

// ─── Emit ──────────────────────────────────────────────────────────────────

/**
 * Emit an event directly via mutation.
 *
 * This is the public-facing mutation for event emission. It requires the
 * "event.emit" capability. For internal system-to-system event emission,
 * use the emitEvent() helper instead (which bypasses capability checks).
 *
 * @returns The ID of the newly created event
 */
export const emit = mutation({
  args: emitEventArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "event.emit");

    // Parse and re-validate the payload JSON
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(args.payload);
      if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        throw new Error("Payload must be a JSON object");
      }
    } catch (e) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Invalid payload JSON: ${e instanceof Error ? e.message : "parse error"}`,
      });
    }

    const eventId = await emitEvent(ctx, args.code, args.system, payload, {
      actorId: args.actorId,
      actorIp: args.actorIp,
      correlationId: args.correlationId,
      parentEventId: args.parentEventId,
    });

    return eventId;
  },
});

// ─── Register Listener ─────────────────────────────────────────────────────

/**
 * Register a new event listener.
 *
 * Requirements:
 *   - Caller must have "event.register_listener" capability
 *   - Listener name must be unique within its event code
 *   - If filterCondition is provided, it must be valid JSON
 *
 * @returns The ID of the newly registered listener
 */
export const registerListener = mutation({
  args: registerListenerArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "event.register_listener");

    // Validate eventCode format (must contain a dot or be a wildcard)
    if (args.eventCode !== "*" && !args.eventCode.includes(".")) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Invalid event code format: "${args.eventCode}". Must be "system.action", "system.*", or "*".`,
      });
    }

    // Validate filter condition if provided
    if (args.filterCondition) {
      if (!isValidFilterCondition(args.filterCondition)) {
        throw new ConvexError({
          code: "VALIDATION",
          message: "filterCondition must be a valid JSON object string",
        });
      }
    }

    // Check for duplicate listener name within same event code
    const existingListeners = await ctx.db
      .query("eventListeners")
      .withIndex("by_event_code", (q) => q.eq("eventCode", args.eventCode))
      .collect();

    const duplicate = existingListeners.find(
      (l) => l.name === args.name && l.isActive,
    );
    if (duplicate) {
      throw new ConvexError({
        code: "CONFLICT",
        message: `Active listener named "${args.name}" already exists for event code "${args.eventCode}"`,
      });
    }

    const now = Date.now();
    const listenerId = await ctx.db.insert("eventListeners", {
      eventCode: args.eventCode,
      name: args.name,
      handlerModule: args.handlerModule,
      handlerFunction: args.handlerFunction,
      handlerType: args.handlerType,
      priority: args.priority ?? LISTENER_DEFAULTS.PRIORITY,
      isActive: true,
      maxRetries: args.maxRetries ?? LISTENER_DEFAULTS.MAX_RETRIES,
      retryDelayMs: args.retryDelayMs ?? LISTENER_DEFAULTS.RETRY_DELAY_MS,
      retryBackoff: args.retryBackoff ?? LISTENER_DEFAULTS.RETRY_BACKOFF,
      filterCondition: args.filterCondition,
      system: args.system,
      description: args.description,
      createdAt: now,
      updatedAt: now,
    });

    return listenerId;
  },
});

// ─── Remove Listener ───────────────────────────────────────────────────────

/**
 * Remove an event listener via deactivation or permanent deletion.
 *
 * Modes:
 *   - "deactivate" (default): Soft remove. Sets isActive to false. Preserves
 *     execution history for debugging and audit purposes.
 *   - "delete": Permanently deletes the listener record AND all related
 *     execution records. Use for cleanup of orphaned/obsolete listeners.
 *
 * Requirements:
 *   - Caller must have "event.remove_listener" capability
 *   - Listener must exist
 *
 * @returns Success confirmation with the affected listener's details
 */
export const removeListener = mutation({
  args: removeListenerArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "event.remove_listener");

    const listener = await ctx.db.get("eventListeners", args.listenerId);
    if (!listener) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Event listener not found",
      });
    }

    const mode = args.mode ?? "deactivate";

    if (mode === "delete") {
      // Permanent deletion: remove all related execution records first
      const executions = await ctx.db
        .query("eventListenerExecutions")
        .withIndex("by_listener", (q) => q.eq("listenerId", args.listenerId))
        .collect();

      for (const exec of executions) {
        await ctx.db.delete("eventListenerExecutions", exec._id);
      }

      // Delete the listener record itself
      await ctx.db.delete("eventListeners", args.listenerId);

      return {
        success: true,
        mode: "delete" as const,
        listenerId: args.listenerId,
        name: listener.name,
        eventCode: listener.eventCode,
        executionsDeleted: executions.length,
      };
    }

    // Deactivate mode (default)
    if (!listener.isActive) {
      throw new ConvexError({
        code: "CONFLICT",
        message: `Listener "${listener.name}" is already deactivated`,
      });
    }

    const now = Date.now();
    await ctx.db.patch("eventListeners", args.listenerId, {
      isActive: false,
      updatedAt: now,
    });

    return {
      success: true,
      mode: "deactivate" as const,
      listenerId: args.listenerId,
      name: listener.name,
      eventCode: listener.eventCode,
    };
  },
});
