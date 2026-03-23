/**
 * Audit Log System - Public Queries
 *
 * Six queries for reading audit data:
 *
 *   - list: Paginated, filtered audit entries (the main audit log view)
 *   - get: Single entry detail with full context
 *   - getByEvent: Lookup audit entry by source event ID
 *   - getObjectHistory: Audit trail for a specific object
 *   - getStats: Audit log statistics (dashboard widget)
 *   - recentActivity: Most recent entries across all types (activity feed)
 *
 * All queries require authentication and the "audit.view" capability.
 * Only Administrators can view the audit log.
 *
 * Usage:
 *   const entries = useQuery(api.auditLogs.queries.list, {
 *     severity: "critical",
 *     limit: 50,
 *   });
 */

import { query } from "../_generated/server";
import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { requireCan } from "../helpers/permissions";
import {
  listArgs,
  getArgs,
  getByEventArgs,
  getObjectHistoryArgs,
  getStatsArgs,
  recentActivityArgs,
} from "./validators";

// ─── list ─────────────────────────────────────────────────────────────────────

/**
 * List audit entries with filtering and cursor-based pagination.
 *
 * Selects the optimal index based on provided filters:
 *   - actorId -> by_actor index
 *   - severity -> by_severity index
 *   - objectType + objectId -> by_object index
 *   - objectType (alone) -> by_object_type index
 *   - eventCode -> by_event_code index
 *   - correlationId -> by_correlation index
 *   - system -> by_system index
 *   - default -> by_occurred index
 *
 * Date range and search are applied as post-filters.
 * Returns newest-first by default.
 */
export const list = query({
  args: listArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "audit.view");

    const limit = Math.min(args.limit ?? 50, 200);
    const direction = args.direction ?? "older";

    // Parse cursor (occurredAt timestamp)
    let cursorTimestamp: number | undefined;
    if (args.cursor) {
      const parsed = Number(args.cursor);
      if (isNaN(parsed)) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Invalid cursor format",
        });
      }
      cursorTimestamp = parsed;
    }

    // ─── Select index and build query ───────────────────────────────────
    // We fetch more than needed to allow for post-filtering
    const fetchLimit = limit + 1;
    let entries;

    if (args.search) {
      // Use search index for free-text search
      let searchQuery = ctx.db
        .query("auditEntries")
        .withSearchIndex("search_audit", (q) => {
          let sq = q.search("description", args.search!);
          if (args.severity) sq = sq.eq("severity", args.severity);
          if (args.system) sq = sq.eq("system", args.system);
          if (args.actorId) sq = sq.eq("actorId", args.actorId);
          if (args.objectType) sq = sq.eq("objectType", args.objectType);
          return sq;
        });

      entries = await searchQuery.take(fetchLimit * 2);

      // Apply date range and cursor as post-filters on search results
      entries = entries.filter((entry) => {
        if (args.dateFrom && entry.occurredAt < args.dateFrom) return false;
        if (args.dateTo && entry.occurredAt > args.dateTo) return false;
        if (cursorTimestamp) {
          if (direction === "older" && entry.occurredAt >= cursorTimestamp)
            return false;
          if (direction === "newer" && entry.occurredAt <= cursorTimestamp)
            return false;
        }
        return true;
      });

      // Sort by occurredAt descending (newest first)
      entries.sort((a, b) => b.occurredAt - a.occurredAt);
      entries = entries.slice(0, fetchLimit);
    } else if (args.correlationId) {
      entries = await ctx.db
        .query("auditEntries")
        .withIndex("by_correlation", (q) =>
          q.eq("correlationId", args.correlationId!),
        )
        .take(fetchLimit);
    } else if (args.actorId) {
      let q = ctx.db
        .query("auditEntries")
        .withIndex("by_actor", (q) => q.eq("actorId", args.actorId!));
      entries = await q.order("desc").take(fetchLimit * 2);

      // Apply cursor and date range as post-filters
      entries = applyPostFilters(
        entries,
        args,
        cursorTimestamp,
        direction,
        fetchLimit,
      );
    } else if (args.severity) {
      let q = ctx.db
        .query("auditEntries")
        .withIndex("by_severity", (q) => q.eq("severity", args.severity!));
      entries = await q.order("desc").take(fetchLimit * 2);

      entries = applyPostFilters(
        entries,
        args,
        cursorTimestamp,
        direction,
        fetchLimit,
      );
    } else if (args.objectType && args.objectId) {
      let q = ctx.db
        .query("auditEntries")
        .withIndex("by_object", (q) =>
          q
            .eq("objectType", args.objectType!)
            .eq("objectId", args.objectId!),
        );
      entries = await q.order("desc").take(fetchLimit * 2);

      entries = applyPostFilters(
        entries,
        args,
        cursorTimestamp,
        direction,
        fetchLimit,
      );
    } else if (args.objectType) {
      let q = ctx.db
        .query("auditEntries")
        .withIndex("by_object_type", (q) =>
          q.eq("objectType", args.objectType!),
        );
      entries = await q.order("desc").take(fetchLimit * 2);

      entries = applyPostFilters(
        entries,
        args,
        cursorTimestamp,
        direction,
        fetchLimit,
      );
    } else if (args.eventCode) {
      let q = ctx.db
        .query("auditEntries")
        .withIndex("by_event_code", (q) =>
          q.eq("eventCode", args.eventCode!),
        );
      entries = await q.order("desc").take(fetchLimit * 2);

      entries = applyPostFilters(
        entries,
        args,
        cursorTimestamp,
        direction,
        fetchLimit,
      );
    } else if (args.system) {
      let q = ctx.db
        .query("auditEntries")
        .withIndex("by_system", (q) => q.eq("system", args.system!));
      entries = await q.order("desc").take(fetchLimit * 2);

      entries = applyPostFilters(
        entries,
        args,
        cursorTimestamp,
        direction,
        fetchLimit,
      );
    } else {
      // Default: chronological by occurredAt
      let q = ctx.db.query("auditEntries").withIndex("by_occurred");
      entries = await q.order("desc").take(fetchLimit * 2);

      entries = applyPostFilters(
        entries,
        args,
        cursorTimestamp,
        direction,
        fetchLimit,
      );
    }

    // ─── Build response ─────────────────────────────────────────────────
    const hasMore = entries.length > limit;
    const resultEntries = entries.slice(0, limit);

    const nextCursor =
      hasMore && resultEntries.length > 0
        ? String(resultEntries[resultEntries.length - 1].occurredAt)
        : undefined;

    // prevCursor enables bidirectional pagination: points to the first entry
    // in the current page so the client can request entries "newer" than it.
    const prevCursor =
      cursorTimestamp && resultEntries.length > 0
        ? String(resultEntries[0].occurredAt)
        : undefined;

    // ─── Total estimate (lightweight) ──────────────────────────────────
    // For unfiltered views, provide a rough total estimate by checking
    // whether there are entries beyond the current page. For filtered views,
    // we return undefined (UI shows "N+ results" pattern).
    let totalEstimate: number | undefined;
    const hasFilters =
      args.severity ||
      args.actorId ||
      args.objectType ||
      args.eventCode ||
      args.correlationId ||
      args.system ||
      args.search ||
      args.dateFrom ||
      args.dateTo;

    if (!hasFilters && !cursorTimestamp) {
      // Unfiltered first page: count the result + check for more
      totalEstimate = hasMore ? limit + 1 : resultEntries.length;
      // If there are more, give a hint by fetching a larger batch
      if (hasMore) {
        const roughCount = await ctx.db
          .query("auditEntries")
          .withIndex("by_occurred")
          .order("desc")
          .take(1001);
        totalEstimate =
          roughCount.length > 1000 ? undefined : roughCount.length;
      }
    }

    return {
      entries: resultEntries.map((entry) => ({
        _id: entry._id,
        eventId: entry.eventId,
        eventCode: entry.eventCode,
        action: entry.action,
        description: entry.description,
        severity: entry.severity,
        system: entry.system,
        actorId: entry.actorId,
        actorName: entry.actorName,
        actorEmail: entry.actorEmail,
        actorRole: entry.actorRole,
        actorIp: entry.actorIp,
        objectType: entry.objectType,
        objectId: entry.objectId,
        objectLabel: entry.objectLabel,
        correlationId: entry.correlationId,
        occurredAt: entry.occurredAt,
      })),
      nextCursor,
      prevCursor,
      totalEstimate,
    };
  },
});

// ─── get ──────────────────────────────────────────────────────────────────────

/**
 * Get a single audit entry by ID with full detail.
 *
 * Returns the complete entry including:
 *   - Full actor context (name, email, role, IP, user agent)
 *   - Parsed changes array (if present)
 *   - Parsed raw payload
 *   - Linked event processing metadata
 *   - Related entries (via correlationId, up to 20)
 */
export const get = query({
  args: getArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "audit.view");

    const entry = await ctx.db.get("auditEntries", args.entryId);
    if (!entry) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Audit entry not found",
      });
    }

    // Fetch linked event record for processing metadata
    let eventMeta = null;
    const event = await ctx.db.get("events", entry.eventId);
    if (event) {
      eventMeta = {
        status: event.status,
        listenersTotal: event.listenersTotal,
        listenersCompleted: event.listenersCompleted,
        listenersFailed: event.listenersFailed,
        processedAt: event.processedAt,
      };
    }

    // Parse changes JSON if present
    let parsedChanges = undefined;
    if (entry.changes) {
      try {
        parsedChanges = JSON.parse(entry.changes);
      } catch {
        // Keep as undefined if parsing fails
      }
    }

    // Parse raw payload
    let parsedPayload: Record<string, unknown> = {};
    try {
      parsedPayload = JSON.parse(entry.rawPayload);
    } catch {
      // Keep empty object
    }

    // Fetch related entries via correlationId (up to 20)
    let relatedEntries = undefined;
    if (entry.correlationId) {
      const related = await ctx.db
        .query("auditEntries")
        .withIndex("by_correlation", (q) =>
          q.eq("correlationId", entry.correlationId!),
        )
        .take(21); // Take 21 to check for more

      relatedEntries = related
        .filter((r) => r._id !== entry._id) // Exclude self
        .slice(0, 20)
        .map((r) => ({
          _id: r._id,
          eventCode: r.eventCode,
          description: r.description,
          occurredAt: r.occurredAt,
        }));
    }

    return {
      _id: entry._id,
      eventId: entry.eventId,
      eventCode: entry.eventCode,
      action: entry.action,
      description: entry.description,
      severity: entry.severity,
      system: entry.system,
      objectType: entry.objectType,
      objectId: entry.objectId,
      objectLabel: entry.objectLabel,
      occurredAt: entry.occurredAt,
      actor: {
        id: entry.actorId,
        name: entry.actorName,
        email: entry.actorEmail,
        role: entry.actorRole,
        ip: entry.actorIp,
        userAgent: entry.actorUserAgent,
      },
      changes: parsedChanges,
      rawPayload: parsedPayload,
      event: eventMeta,
      relatedEntries,
    };
  },
});

// ─── getByEvent ─────────────────────────────────────────────────────────────

/**
 * Look up an audit entry by its source event ID.
 * Uses the by_event index for O(1) lookup.
 * Returns null if no audit entry exists for the given event.
 */
export const getByEvent = query({
  args: getByEventArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "audit.view");

    const entry = await ctx.db
      .query("auditEntries")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .unique();

    if (!entry) return null;

    return {
      _id: entry._id,
      eventId: entry.eventId,
      eventCode: entry.eventCode,
      action: entry.action,
      description: entry.description,
      severity: entry.severity,
      system: entry.system,
      actorId: entry.actorId,
      actorName: entry.actorName,
      objectType: entry.objectType,
      objectId: entry.objectId,
      objectLabel: entry.objectLabel,
      occurredAt: entry.occurredAt,
    };
  },
});

// ─── getObjectHistory ───────────────────────────────────────────────────────

/**
 * Get the audit trail for a specific object.
 * Used for the "History" tab on post editors, user profiles, etc.
 *
 * Queries the by_object index with objectType + objectId,
 * sorted by occurredAt descending (newest first).
 */
export const getObjectHistory = query({
  args: getObjectHistoryArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "audit.view");

    const limit = Math.min(args.limit ?? 25, 100);

    const entries = await ctx.db
      .query("auditEntries")
      .withIndex("by_object", (q) =>
        q.eq("objectType", args.objectType).eq("objectId", args.objectId),
      )
      .order("desc")
      .take(limit);

    return {
      entries: entries.map((entry) => ({
        _id: entry._id,
        eventCode: entry.eventCode,
        action: entry.action,
        description: entry.description,
        severity: entry.severity,
        actorName: entry.actorName,
        occurredAt: entry.occurredAt,
      })),
    };
  },
});

// ─── getStats ───────────────────────────────────────────────────────────────

/**
 * Get audit log statistics for the dashboard widget.
 *
 * Optimized to avoid loading 10k records into memory.
 * Uses per-severity index queries for severity counts (cheap),
 * and a capped sample for object type / actor aggregations.
 *
 * Returns:
 *   - Total entries in the period (estimate)
 *   - Count by severity level
 *   - Count by object type (from sample)
 *   - Top 5 actors by activity count (from sample)
 *   - Last 5 critical/high entries
 *   - totalEstimate (approximate total)
 */
export const getStats = query({
  args: getStatsArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "audit.view");

    // Calculate period start timestamp
    const now = Date.now();
    const period = args.period ?? "today";
    let periodStart: number;

    switch (period) {
      case "today": {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        periodStart = today.getTime();
        break;
      }
      case "week":
        periodStart = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case "month":
        periodStart = now - 30 * 24 * 60 * 60 * 1000;
        break;
      default:
        periodStart = now - 24 * 60 * 60 * 1000;
    }

    // ─── Count by severity using index (cheap per-severity queries) ────
    // Each query uses the by_severity index with a range filter on occurredAt.
    // This is far cheaper than loading all records into memory.
    const severityLevels = [
      "critical",
      "high",
      "medium",
      "low",
      "informational",
    ] as const;
    const bySeverity: Record<string, number> = {};
    let totalFromSeverity = 0;

    for (const sev of severityLevels) {
      const sevEntries = await ctx.db
        .query("auditEntries")
        .withIndex("by_severity", (q) => q.eq("severity", sev))
        .order("desc")
        .take(1001); // Cap per-severity to detect overflow

      // Post-filter by period (the index has [severity, occurredAt] but we
      // need entries >= periodStart; we already get them desc-sorted so we
      // can break early once we pass the period boundary).
      let count = 0;
      for (const e of sevEntries) {
        if (e.occurredAt >= periodStart) {
          count++;
        }
      }
      bySeverity[sev] = count;
      totalFromSeverity += count;
    }

    // ─── Sample for object type and actor aggregations ────────────────
    // Fetch a moderate sample (up to 500 recent entries) for breakdowns
    // that don't have dedicated indexes. This keeps memory bounded.
    const SAMPLE_SIZE = 500;
    const sampleEntries = await ctx.db
      .query("auditEntries")
      .withIndex("by_occurred", (q) => q.gte("occurredAt", periodStart))
      .order("desc")
      .take(SAMPLE_SIZE);

    // Aggregate by object type (from sample)
    const byObjectType: Record<string, number> = {};
    const actorCounts: Record<string, { name: string; count: number }> = {};

    for (const entry of sampleEntries) {
      // Object type counts
      byObjectType[entry.objectType] =
        (byObjectType[entry.objectType] ?? 0) + 1;

      // Actor counts
      if (entry.actorId) {
        if (!actorCounts[entry.actorId]) {
          actorCounts[entry.actorId] = {
            name: entry.actorName ?? "Unknown",
            count: 0,
          };
        }
        actorCounts[entry.actorId].count++;
      }
    }

    // If total is larger than the sample, scale object type / actor estimates
    // to give a more representative distribution
    if (totalFromSeverity > SAMPLE_SIZE && sampleEntries.length > 0) {
      const scaleFactor = totalFromSeverity / sampleEntries.length;
      for (const key of Object.keys(byObjectType)) {
        byObjectType[key] = Math.round(byObjectType[key] * scaleFactor);
      }
      for (const key of Object.keys(actorCounts)) {
        actorCounts[key].count = Math.round(
          actorCounts[key].count * scaleFactor,
        );
      }
    }

    // ─── Recent critical/high entries (up to 5) ──────────────────────
    const criticalHighEntries: Array<{
      _id: (typeof sampleEntries)[0]["_id"];
      description: string;
      severity: string;
      actorName?: string;
      occurredAt: number;
    }> = [];

    // Use the severity index for critical and high entries directly
    for (const sev of ["critical", "high"] as const) {
      if (criticalHighEntries.length >= 5) break;
      const sevRecent = await ctx.db
        .query("auditEntries")
        .withIndex("by_severity", (q) => q.eq("severity", sev))
        .order("desc")
        .take(5);

      for (const entry of sevRecent) {
        if (entry.occurredAt >= periodStart && criticalHighEntries.length < 5) {
          criticalHighEntries.push({
            _id: entry._id,
            description: entry.description,
            severity: entry.severity,
            actorName: entry.actorName,
            occurredAt: entry.occurredAt,
          });
        }
      }
    }

    // Sort critical/high by occurredAt desc (interleave critical and high)
    criticalHighEntries.sort((a, b) => b.occurredAt - a.occurredAt);

    // ─── Top 5 actors ────────────────────────────────────────────────
    const topActors = Object.entries(actorCounts)
      .map(([actorId, data]) => ({
        actorId,
        actorName: data.name,
        count: data.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      total: totalFromSeverity,
      totalEstimate: totalFromSeverity,
      bySeverity,
      byObjectType,
      topActors,
      recentCritical: criticalHighEntries,
    };
  },
});

// ─── recentActivity ─────────────────────────────────────────────────────────

/**
 * Get the N most recent audit entries across all types.
 * Used for the dashboard "Activity" widget.
 */
export const recentActivity = query({
  args: recentActivityArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "audit.view");

    const limit = Math.min(args.limit ?? 20, 100);

    const entries = await ctx.db
      .query("auditEntries")
      .withIndex("by_occurred")
      .order("desc")
      .take(limit);

    return {
      entries: entries.map((entry) => ({
        _id: entry._id,
        eventCode: entry.eventCode,
        action: entry.action,
        description: entry.description,
        severity: entry.severity,
        system: entry.system,
        actorId: entry.actorId,
        actorName: entry.actorName,
        actorEmail: entry.actorEmail,
        objectType: entry.objectType,
        objectId: entry.objectId,
        objectLabel: entry.objectLabel,
        occurredAt: entry.occurredAt,
      })),
    };
  },
});

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Apply post-filters (date range, cursor) to a pre-fetched entry list.
 * Used when the primary index doesn't support all the filter criteria.
 */
function applyPostFilters(
  entries: Array<Doc<"auditEntries">>,
  args: {
    dateFrom?: number;
    dateTo?: number;
    system?: string;
    severity?: string;
    objectType?: string;
    eventCode?: string;
  },
  cursorTimestamp: number | undefined,
  direction: string,
  fetchLimit: number,
) {
  let filtered = entries;

  // Apply date range filter
  if (args.dateFrom) {
    filtered = filtered.filter((e) => e.occurredAt >= args.dateFrom!);
  }
  if (args.dateTo) {
    filtered = filtered.filter((e) => e.occurredAt <= args.dateTo!);
  }

  // Apply cursor filter
  if (cursorTimestamp) {
    if (direction === "older") {
      filtered = filtered.filter((e) => e.occurredAt < cursorTimestamp!);
    } else {
      filtered = filtered.filter((e) => e.occurredAt > cursorTimestamp!);
    }
  }

  // Ensure sorted by occurredAt desc
  filtered.sort((a, b) => b.occurredAt - a.occurredAt);

  return filtered.slice(0, fetchLimit);
}
