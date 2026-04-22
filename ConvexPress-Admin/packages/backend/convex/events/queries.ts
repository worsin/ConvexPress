/**
 * Event Dispatcher System - Queries
 *
 * Read operations for events, listeners, and execution history.
 *
 * Access control:
 *   - list, get, countByCode, listListeners: Require "audit.view" capability
 *     (Administrator-only). Event data can contain sensitive information
 *     (IP addresses, email addresses, user actions).
 *   - hasListener: Authentication only (no capability check).
 *     Used internally by systems to check if listeners exist.
 *
 * Queries:
 *   list          - List events with filtering and pagination
 *   get           - Get a single event with execution details
 *   countByCode   - Count events matching a code (optionally since a timestamp)
 *   listListeners - List registered listeners with optional filters
 *   hasListener   - Check if any active listener exists for an event code
 */

import { v } from "convex/values";
import { query } from "../_generated/server";
import { getCurrentUser, requireCan } from "../helpers/permissions";
import {
  listEventsArgs,
  getEventArgs,
  countByCodeArgs,
  listListenersArgs,
  hasListenerArgs,
} from "./validators";
import { matchesEventCode } from "./constants";

// ─── List Events ───────────────────────────────────────────────────────────

/**
 * List events with optional filtering and offset-based pagination.
 *
 * Supports filtering by:
 *   - code: exact event code
 *   - system: originating system
 *   - status: processing status
 *   - actorId: user identifier
 *   - correlationId: correlation chain
 *   - dateFrom: events emitted at or after this timestamp (inclusive)
 *   - dateTo: events emitted at or before this timestamp (inclusive)
 *
 * Returns a paginated response with events ordered by emittedAt descending.
 * Default perPage: 50, max: 200.
 *
 * When `code` is provided with `dateFrom`/`dateTo`, the `by_code_emitted`
 * composite index is used for efficient range queries. When only date range
 * is provided, the `by_emitted` index is used.
 *
 * Requires "audit.view" capability (Administrator only).
 */
export const list = query({
  args: listEventsArgs,
  handler: async (ctx, args) => {
    try {
      await requireCan(ctx, "audit.view");
    } catch {
      return { events: [], total: 0, page: 1, perPage: 50, totalPages: 0 };
    }

    const page = Math.max(args.page ?? 1, 1);
    const perPage = Math.min(Math.max(args.perPage ?? 50, 1), 200);
    const hasDateFilter = args.dateFrom !== undefined || args.dateTo !== undefined;

    // Choose the most selective index based on provided filters.
    // Use index-level date range queries where possible to avoid full table scans.
    let indexedEvents;

    if (args.code && hasDateFilter) {
      // Best case: code + date range can use by_code_emitted composite index
      indexedEvents = await ctx.db
        .query("events")
        .withIndex("by_code_emitted", (q) => {
          const byCode = q.eq("code", args.code!);
          if (args.dateFrom !== undefined && args.dateTo !== undefined) {
            return byCode.gte("emittedAt", args.dateFrom).lte("emittedAt", args.dateTo);
          }
          if (args.dateFrom !== undefined) return byCode.gte("emittedAt", args.dateFrom);
          if (args.dateTo !== undefined) return byCode.lte("emittedAt", args.dateTo);
          return byCode;
        })
        .order("desc")
        .collect();
    } else if (args.code) {
      indexedEvents = await ctx.db
        .query("events")
        .withIndex("by_code_emitted", (q) => q.eq("code", args.code!))
        .order("desc")
        .collect();
    } else if (hasDateFilter && !args.system && !args.status && !args.actorId && !args.correlationId) {
      // Date-only filter: use by_emitted index for range query
      indexedEvents = await ctx.db
        .query("events")
        .withIndex("by_emitted", (q) => {
          if (args.dateFrom !== undefined && args.dateTo !== undefined) {
            return q.gte("emittedAt", args.dateFrom).lte("emittedAt", args.dateTo);
          }
          if (args.dateFrom !== undefined) return q.gte("emittedAt", args.dateFrom);
          if (args.dateTo !== undefined) return q.lte("emittedAt", args.dateTo);
          return q;
        })
        .order("desc")
        .collect();
    } else if (args.system) {
      indexedEvents = await ctx.db
        .query("events")
        .withIndex("by_system", (q) => q.eq("system", args.system!))
        .order("desc")
        .collect();
    } else if (args.status) {
      indexedEvents = await ctx.db
        .query("events")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect();
    } else if (args.actorId) {
      indexedEvents = await ctx.db
        .query("events")
        .withIndex("by_actor", (q) => q.eq("actorId", args.actorId!))
        .order("desc")
        .collect();
    } else if (args.correlationId) {
      indexedEvents = await ctx.db
        .query("events")
        .withIndex("by_correlation", (q) =>
          q.eq("correlationId", args.correlationId!),
        )
        .order("desc")
        .collect();
    } else {
      indexedEvents = await ctx.db
        .query("events")
        .withIndex("by_emitted")
        .order("desc")
        .collect();
    }

    // Apply any additional cross-filters in memory.
    // These cover filter combinations not expressible via a single index.
    let filtered = indexedEvents;

    if (args.system && args.code) {
      filtered = filtered.filter((e) => e.system === args.system);
    }
    if (args.status && (args.code || args.system || args.actorId || args.correlationId)) {
      filtered = filtered.filter((e) => e.status === args.status);
    }
    // Apply date range in memory when not already handled by the index
    if (hasDateFilter && !args.code && (args.system || args.status || args.actorId || args.correlationId)) {
      if (args.dateFrom !== undefined) {
        filtered = filtered.filter((e) => e.emittedAt >= args.dateFrom!);
      }
      if (args.dateTo !== undefined) {
        filtered = filtered.filter((e) => e.emittedAt <= args.dateTo!);
      }
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / perPage);

    // Apply offset-based pagination
    const offset = (page - 1) * perPage;
    const paginatedEvents = filtered.slice(offset, offset + perPage);

    return {
      events: paginatedEvents,
      total,
      page,
      perPage,
      totalPages,
    };
  },
});

// ─── Get Event ─────────────────────────────────────────────────────────────

/**
 * Get a single event by ID, enriched with its execution details.
 *
 * Returns the event document plus an array of execution records,
 * each enriched with the listener's name and event code.
 *
 * Requires "audit.view" capability (Administrator only).
 */
export const get = query({
  args: getEventArgs,
  handler: async (ctx, args) => {
    try {
      await requireCan(ctx, "audit.view");
    } catch {
      return null;
    }

    const event = await ctx.db.get("events", args.eventId);
    if (!event) return null;

    // Fetch all executions for this event
    const executions = await ctx.db
      .query("eventListenerExecutions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    // Enrich executions with listener details
    const enrichedExecutions = await Promise.all(
      executions.map(async (exec) => {
        const listener = await ctx.db.get("eventListeners", exec.listenerId);
        return {
          ...exec,
          listenerName: listener?.name ?? "Unknown",
          listenerEventCode: listener?.eventCode ?? "Unknown",
          listenerSystem: listener?.system ?? "Unknown",
        };
      }),
    );

    // Sort executions by listener priority (pending/running first, then completed/failed)
    enrichedExecutions.sort((a, b) => {
      const statusOrder: Record<string, number> = {
        running: 0,
        pending: 1,
        retrying: 2,
        completed: 3,
        skipped: 4,
        failed: 5,
      };
      return (statusOrder[a.status] ?? 6) - (statusOrder[b.status] ?? 6);
    });

    return {
      ...event,
      executions: enrichedExecutions,
    };
  },
});

// ─── Count By Code ─────────────────────────────────────────────────────────

/**
 * Count events matching a specific event code.
 * Optionally filtered to events emitted since a given timestamp.
 *
 * Useful for dashboard widgets and rate monitoring.
 * Equivalent to WordPress's `did_action()`.
 *
 * Note: Convex does not provide a native count aggregation.
 * We use index-narrowed queries to minimize the working set, but
 * still collect documents to count them. For very high-volume event
 * codes, consider adding a dedicated counter table in the future.
 *
 * Requires "audit.view" capability (Administrator only).
 */
export const countByCode = query({
  args: countByCodeArgs,
  handler: async (ctx, args) => {
    try {
      await requireCan(ctx, "audit.view");
    } catch {
      return { count: 0 };
    }

    let q;
    if (args.since) {
      // Use the composite index for code + emittedAt range query.
      // This is as efficient as Convex allows: the index narrows to
      // only events matching (code, emittedAt >= since).
      q = ctx.db
        .query("events")
        .withIndex("by_code_emitted", (idx) =>
          idx.eq("code", args.code).gte("emittedAt", args.since!),
        );
    } else {
      q = ctx.db
        .query("events")
        .withIndex("by_code", (idx) => idx.eq("code", args.code));
    }

    // Collect only the _id field would be ideal, but Convex returns
    // full documents. The index still constrains the scan to the
    // matching key range, so this is O(matching events), not O(all events).
    const events = await q.collect();

    return { count: events.length };
  },
});

// ─── List Listeners ────────────────────────────────────────────────────────

/**
 * List registered event listeners with optional filters.
 *
 * Supports filtering by:
 *   - eventCode: exact event code
 *   - system: owning system
 *   - activeOnly: only active listeners (default: true)
 *
 * Returns listeners sorted by event code, then priority.
 *
 * Requires "audit.view" capability (Administrator only).
 */
export const listListeners = query({
  args: listListenersArgs,
  handler: async (ctx, args) => {
    try {
      await requireCan(ctx, "audit.view");
    } catch {
      return [];
    }

    const activeOnly = args.activeOnly ?? true;

    let listeners;

    if (args.eventCode) {
      listeners = await ctx.db
        .query("eventListeners")
        .withIndex("by_event_code", (q) => {
          const q1 = q.eq("eventCode", args.eventCode!);
          if (activeOnly) return q1.eq("isActive", true);
          return q1;
        })
        .collect();
    } else if (args.system) {
      listeners = await ctx.db
        .query("eventListeners")
        .withIndex("by_system", (q) => q.eq("system", args.system!))
        .collect();

      // Apply activeOnly filter in memory if needed
      if (activeOnly) {
        listeners = listeners.filter((l) => l.isActive);
      }
    } else if (activeOnly) {
      listeners = await ctx.db
        .query("eventListeners")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect();
    } else {
      listeners = await ctx.db.query("eventListeners").collect();
    }

    // Sort by eventCode, then priority
    listeners.sort((a, b) => {
      if (a.eventCode !== b.eventCode) {
        return a.eventCode.localeCompare(b.eventCode);
      }
      return a.priority - b.priority;
    });

    return listeners;
  },
});

// ─── Has Listener ──────────────────────────────────────────────────────────

/**
 * Check if any active listener exists that would handle a given event code.
 *
 * This checks exact matches, system wildcards, and the global wildcard.
 * Useful for systems that want to skip expensive payload construction
 * when no listeners would process the event anyway.
 */
export const hasListener = query({
  args: hasListenerArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return false;

    // Check for exact match first (most common case)
    const exactMatch = await ctx.db
      .query("eventListeners")
      .withIndex("by_event_code", (q) =>
        q.eq("eventCode", args.eventCode).eq("isActive", true),
      )
      .first();

    if (exactMatch) return true;

    // Check for wildcard matches (system.* and *)
    // This requires scanning active listeners, but the table is small
    const activeListeners = await ctx.db
      .query("eventListeners")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    return activeListeners.some(
      (listener) =>
        listener.eventCode !== args.eventCode &&
        matchesEventCode(args.eventCode, listener.eventCode),
    );
  },
});
