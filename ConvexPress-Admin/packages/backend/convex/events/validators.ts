/**
 * Event Dispatcher System - Shared Argument Validators
 *
 * Reusable Convex argument validators for event mutations and queries.
 * Centralizes validation logic to keep functions clean and consistent.
 */

import { v } from "convex/values";

// ─── Common Validators ─────────────────────────────────────────────────────

/** Event processing status validator */
export const eventStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("partial"),
);

/** Execution status validator */
export const executionStatusValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("retrying"),
  v.literal("skipped"),
);

/** Handler type validator */
export const handlerTypeValidator = v.union(
  v.literal("internal"),
  v.literal("action"),
  v.literal("scheduled"),
);

/** Retry backoff strategy validator */
export const retryBackoffValidator = v.union(
  v.literal("linear"),
  v.literal("exponential"),
);

// ─── Mutation Arg Shapes ───────────────────────────────────────────────────

/**
 * Arguments for emitting an event directly via mutation.
 */
export const emitEventArgs = {
  code: v.string(),
  system: v.string(),
  payload: v.string(),
  actorId: v.optional(v.string()),
  actorIp: v.optional(v.string()),
  correlationId: v.optional(v.string()),
  parentEventId: v.optional(v.id("events")),
};

/**
 * Arguments for registering a new event listener.
 */
export const registerListenerArgs = {
  eventCode: v.string(),
  name: v.string(),
  handlerModule: v.string(),
  handlerFunction: v.string(),
  handlerType: handlerTypeValidator,
  priority: v.optional(v.number()),
  maxRetries: v.optional(v.number()),
  retryDelayMs: v.optional(v.number()),
  retryBackoff: v.optional(retryBackoffValidator),
  filterCondition: v.optional(v.string()),
  system: v.string(),
  description: v.optional(v.string()),
};

/**
 * Arguments for removing a listener.
 * Supports two modes:
 *   - "deactivate" (default): Soft remove, sets isActive to false
 *   - "delete": Permanent deletion of listener and all related execution records
 */
export const removeListenerArgs = {
  listenerId: v.id("eventListeners"),
  mode: v.optional(
    v.union(v.literal("deactivate"), v.literal("delete")),
  ),
};

// ─── Query Arg Shapes ──────────────────────────────────────────────────────

/**
 * Arguments for listing events with filtering and offset-based pagination.
 */
export const listEventsArgs = {
  code: v.optional(v.string()),
  system: v.optional(v.string()),
  status: v.optional(eventStatusValidator),
  actorId: v.optional(v.string()),
  correlationId: v.optional(v.string()),
  dateFrom: v.optional(v.number()),
  dateTo: v.optional(v.number()),
  page: v.optional(v.number()),
  perPage: v.optional(v.number()),
};

/**
 * Arguments for getting a single event with execution details.
 */
export const getEventArgs = {
  eventId: v.id("events"),
};

/**
 * Arguments for counting events by code.
 */
export const countByCodeArgs = {
  code: v.string(),
  since: v.optional(v.number()),
};

/**
 * Arguments for listing registered listeners.
 */
export const listListenersArgs = {
  eventCode: v.optional(v.string()),
  system: v.optional(v.string()),
  activeOnly: v.optional(v.boolean()),
};

/**
 * Arguments for checking if a listener exists for an event code.
 */
export const hasListenerArgs = {
  eventCode: v.string(),
};

// ─── Internal Function Arg Shapes ──────────────────────────────────────────

/**
 * Arguments for the internal processEvent function.
 */
export const processEventArgs = {
  eventId: v.id("events"),
};

/**
 * Arguments for the internal retryExecution function.
 */
export const retryExecutionArgs = {
  executionId: v.id("eventListenerExecutions"),
};
