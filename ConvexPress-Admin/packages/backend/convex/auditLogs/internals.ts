/**
 * Audit Log System - Internal Functions
 *
 * Functions that are NOT callable from clients. Used for:
 *   - Creating audit entries from events (global wildcard listener handler)
 *   - Batch continuation for clear operations
 *
 * Internal functions use internalMutation and are invoked by the
 * Event Dispatcher System's processEvent when the wildcard listener fires.
 *
 * CRITICAL: The createEntry handler is the ONLY way audit entries are created.
 * There is no public create mutation. Entries are immutable once written.
 */

import { lookupUserByIdentifier } from "../helpers/permissions";
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { getSeverity, getObjectType } from "../helpers/auditClassification";
import {
  getActionLabel,
  generateDescription,
} from "../helpers/auditDescriptions";
import { extractObject } from "../helpers/auditObjectExtractors";
import { emitEvent } from "../helpers/events";
import { SYSTEM } from "../events/constants";
import {
  createEntryArgs,
  clearBatchArgs,
  severityValidator,
  objectTypeValidator,
} from "./validators";

// ─── Audit Entry Retention Policies ─────────────────────────────────────────

/**
 * Retention durations for audit entries, by event code prefix.
 * More granular than the Event Dispatcher's retention since audit entries
 * serve compliance and security review purposes.
 */
const AUDIT_RETENTION_MS: Record<string, number> = {
  // Auth events: 365 days
  auth: 365 * 24 * 60 * 60 * 1000,
  // Deletion events: 365 days
  "post.deleted": 365 * 24 * 60 * 60 * 1000,
  "page.deleted": 365 * 24 * 60 * 60 * 1000,
  "comment.deleted": 365 * 24 * 60 * 60 * 1000,
  "media.deleted": 365 * 24 * 60 * 60 * 1000,
  "profile.deleted": 365 * 24 * 60 * 60 * 1000,
  // Role changes: 365 days
  role: 365 * 24 * 60 * 60 * 1000,
  // Settings events: 180 days
  settings: 180 * 24 * 60 * 60 * 1000,
  // Content events: 90 days
  post: 90 * 24 * 60 * 60 * 1000,
  page: 90 * 24 * 60 * 60 * 1000,
  // Comment events: 90 days
  comment: 90 * 24 * 60 * 60 * 1000,
  // Notification events: 30 days
  notification: 30 * 24 * 60 * 60 * 1000,
  email: 30 * 24 * 60 * 60 * 1000,
  // Audit system events: 365 days
  audit: 365 * 24 * 60 * 60 * 1000,
  // Password events: 365 days
  password: 365 * 24 * 60 * 60 * 1000,
  // Registration events: 365 days
  registration: 365 * 24 * 60 * 60 * 1000,
};

/** Default retention: 90 days */
const DEFAULT_AUDIT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Get the audit entry retention duration for an event code.
 * Checks exact event code first, then system prefix, then default.
 */
function getAuditRetentionMs(eventCode: string): number {
  // Check exact event code match (e.g., "post.deleted")
  if (AUDIT_RETENTION_MS[eventCode] !== undefined) {
    return AUDIT_RETENTION_MS[eventCode];
  }

  // Check system prefix match (e.g., "post" for "post.created")
  const dotIndex = eventCode.indexOf(".");
  const system = dotIndex > 0 ? eventCode.slice(0, dotIndex) : eventCode;
  if (AUDIT_RETENTION_MS[system] !== undefined) {
    return AUDIT_RETENTION_MS[system];
  }

  return DEFAULT_AUDIT_RETENTION_MS;
}

// ─── Create Entry ───────────────────────────────────────────────────────────

/**
 * Create an audit entry from an event.
 *
 * This is the global wildcard listener handler. Called by the Event Dispatcher
 * when ANY event fires (listener eventCode: "*", priority: 99).
 *
 * Flow:
 *   1. Dedup check via by_event index (prevent duplicate entries on retry)
 *   2. Load the source event record
 *   3. Parse the event payload
 *   4. Resolve actor info from the users table
 *   5. Classify severity, object type
 *   6. Extract object ID and label
 *   7. Generate human-readable description
 *   8. Insert the audit entry
 */
export const createEntry = internalMutation({
  args: createEntryArgs,
  handler: async (ctx, args) => {
    // ─── 1. Dedup check ──────────────────────────────────────────────────
    const existing = await ctx.db
      .query("auditEntries")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .unique();

    if (existing) {
      // Already processed this event. Return silently (idempotent).
      return;
    }

    // ─── 2. Load source event ────────────────────────────────────────────
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return; // Event was deleted before audit handler ran

    // ─── 3. Parse payload ────────────────────────────────────────────────
    let payload: Record<string, unknown> = {};
    let rawPayload = event.payload ?? "{}";
    try {
      payload = JSON.parse(event.payload);
    } catch {
      // If payload is unparseable, keep it as raw string and use empty object
      rawPayload = event.payload ?? "{}";
    }

    // ─── 4. Resolve actor info ───────────────────────────────────────────
    let actorName: string | undefined;
    let actorEmail: string | undefined;
    let actorRole: string | undefined;

    if (event.actorId) {
      // Look up user by identifier
      const user = await lookupUserByIdentifier(ctx, event.actorId!);

      if (user) {
        // Build display name from available fields
        actorName =
          user.displayName ??
          [user.firstName, user.lastName].filter(Boolean).join(" ") ??
          user.email;
        actorEmail = user.email;

        // Resolve role name
        if (user.roleId) {
          const role = await ctx.db.get("roles", user.roleId);
          if (role) {
            actorRole = role.name;
          }
        } else if (user.internalRole) {
          actorRole = user.internalRole;
        }
      }
    }

    // ─── 5. Classify severity and object type ────────────────────────────
    const severity = getSeverity(event.code);
    const objectType = getObjectType(event.system);

    // ─── 6. Extract object context ───────────────────────────────────────
    const { objectId, objectLabel } = extractObject(event.code, payload);

    // ─── 7. Generate description ─────────────────────────────────────────
    const action = getActionLabel(event.code);
    const description = generateDescription(
      event.code,
      payload,
      actorName,
    );

    // ─── 8. Extract changes if present in payload ────────────────────────
    let changes: string | undefined;
    if (payload.changes && Array.isArray(payload.changes)) {
      try {
        changes = JSON.stringify(payload.changes);
      } catch {
        // Skip changes if serialization fails
      }
    }

    // ─── 9. Calculate retention ──────────────────────────────────────────
    const now = Date.now();
    const retentionMs = getAuditRetentionMs(event.code);
    const expiresAt = now + retentionMs;

    // ─── 10. Insert audit entry ──────────────────────────────────────────
    await ctx.db.insert("auditEntries", {
      eventId: args.eventId,
      eventCode: event.code,
      action,
      description,
      severity,
      system: event.system,
      actorId: event.actorId,
      actorName,
      actorEmail,
      actorRole,
      actorIp: event.actorIp,
      actorUserAgent: undefined,
      objectType,
      objectId,
      objectLabel,
      changes,
      rawPayload,
      correlationId: event.correlationId,
      sessionId: undefined,
      occurredAt: event.emittedAt,
      expiresAt,
    });
  },
});

// ─── Clear Batch Continuation ───────────────────────────────────────────────

/**
 * Continuation function for batch deletion of audit entries.
 *
 * The clear mutation deletes in batches of 100 and schedules this
 * continuation to handle remaining entries. This prevents long-running
 * mutations that could time out.
 */
export const clearBatch = internalMutation({
  args: clearBatchArgs,
  handler: async (ctx, args) => {
    const BATCH_SIZE = 100;
    const now = Date.now();

    let entries;

    if (args.mode === "before_date" && args.beforeDate) {
      entries = await ctx.db
        .query("auditEntries")
        .withIndex("by_occurred", (q) =>
          q.lt("occurredAt", args.beforeDate!),
        )
        .take(BATCH_SIZE);
    } else if (args.mode === "by_severity" && args.severity) {
      entries = await ctx.db
        .query("auditEntries")
        .withIndex("by_severity", (q) =>
          q.eq("severity", args.severity!),
        )
        .take(BATCH_SIZE);
    } else if (args.mode === "expired") {
      entries = await ctx.db
        .query("auditEntries")
        .withIndex("by_expires", (q) => q.lt("expiresAt", now))
        .take(BATCH_SIZE);
    } else {
      return;
    }

    if (entries.length === 0) return;

    // Delete this batch
    for (const entry of entries) {
      await ctx.db.delete("auditEntries", entry._id);
    }

    const totalDeleted = args.deletedSoFar + entries.length;

    // If we got a full batch, schedule continuation
    if (entries.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.auditLogs.internals.clearBatch,
        {
          mode: args.mode,
          beforeDate: args.beforeDate,
          severity: args.severity,
          deletedSoFar: totalDeleted,
        },
      );
    }
  },
});

// ─── Retention Cleanup ──────────────────────────────────────────────────────

/**
 * Daily retention cleanup function.
 *
 * Queries the by_expires index for entries with expiresAt < now.
 * Deletes in batches of 100. Schedules continuation if more remain.
 *
 * NOTE: This function does NOT emit events (avoids infinite recursion
 * since the audit listener would process the event and potentially
 * create a new audit entry, which would need cleanup, etc.).
 */
export const retentionCleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const BATCH_SIZE = 100;
    const now = Date.now();

    const expiredEntries = await ctx.db
      .query("auditEntries")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .take(BATCH_SIZE);

    if (expiredEntries.length === 0) return;

    for (const entry of expiredEntries) {
      await ctx.db.delete("auditEntries", entry._id);
    }

    // If we got a full batch, there may be more to clean up
    if (expiredEntries.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.auditLogs.internals.clearBatch,
        {
          mode: "expired",
          deletedSoFar: expiredEntries.length,
        },
      );
    }
  },
});

// ─── Emit Export Event ─────────────────────────────────────────────────────

/**
 * Internal mutation to emit the audit.exported event.
 * Called from the export action after file generation.
 * Separated because actions cannot call emitEvent directly
 * (emitEvent requires a MutationCtx).
 */
export const emitExportEvent = internalMutation({
  args: {
    format: v.string(),
    recordCount: v.number(),
    filters: v.string(),
  },
  handler: async (ctx, args) => {
    await emitEvent(ctx, "audit.exported", SYSTEM.AUDIT, {
      format: args.format,
      recordCount: args.recordCount,
      filters: args.filters,
    });
  },
});

// ─── Check Export Permission ─────────────────────────────────────────────────

/**
 * Internal query to check if a user has the export_audit_log capability.
 * Called from the export action since actions cannot use requireCan() directly.
 */
export const checkExportPermission = internalQuery({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    // Look up user by identifier
    const user = await lookupUserByIdentifier(ctx, args.userId);

    if (!user) return false;

    // Resolve role and check for capability
    if (user.roleId) {
      const role = await ctx.db.get("roles", user.roleId);
      if (!role) return false;
      return (
        Array.isArray(role.capabilities) &&
        role.capabilities.includes("export_audit_log")
      );
    }

    // Legacy role fallback: administrators always have all capabilities
    if (user.internalRole === "administrator") return true;

    return false;
  },
});

// ─── List Internal ──────────────────────────────────────────────────────────

/**
 * Internal query to list audit entries without auth checks.
 * Used by the export action which has already validated authorization.
 * This avoids the action needing to pass auth context through.
 */
export const listInternal = internalQuery({
  args: {
    actorId: v.optional(v.string()),
    severity: v.optional(severityValidator),
    objectType: v.optional(objectTypeValidator),
    eventCode: v.optional(v.string()),
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    direction: v.optional(
      v.union(v.literal("newer"), v.literal("older")),
    ),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 500, 500);
    const direction = args.direction ?? "older";
    const fetchLimit = limit + 1;

    // Parse cursor
    let cursorTimestamp: number | undefined;
    if (args.cursor) {
      const parsed = Number(args.cursor);
      if (!isNaN(parsed)) {
        cursorTimestamp = parsed;
      }
    }

    // ─── Select the best index to minimize over-fetching ─────────────
    // Use targeted indexes when a primary filter is provided, rather than
    // always scanning by_occurred and post-filtering everything.
    let entries;

    if (args.severity) {
      entries = await ctx.db
        .query("auditEntries")
        .withIndex("by_severity", (q) => q.eq("severity", args.severity!))
        .order("desc")
        .take(fetchLimit * 2);
    } else if (args.actorId) {
      entries = await ctx.db
        .query("auditEntries")
        .withIndex("by_actor", (q) => q.eq("actorId", args.actorId!))
        .order("desc")
        .take(fetchLimit * 2);
    } else if (args.objectType) {
      entries = await ctx.db
        .query("auditEntries")
        .withIndex("by_object_type", (q) =>
          q.eq("objectType", args.objectType!),
        )
        .order("desc")
        .take(fetchLimit * 2);
    } else if (args.eventCode) {
      entries = await ctx.db
        .query("auditEntries")
        .withIndex("by_event_code", (q) =>
          q.eq("eventCode", args.eventCode!),
        )
        .order("desc")
        .take(fetchLimit * 2);
    } else {
      entries = await ctx.db
        .query("auditEntries")
        .withIndex("by_occurred")
        .order("desc")
        .take(fetchLimit * 2);
    }

    // Apply remaining filters as post-filters (only what the index didn't cover)
    entries = entries.filter((e) => {
      // Skip filters already handled by the selected index
      if (args.actorId && !args.severity && e.actorId !== args.actorId) return false;
      if (args.severity && e.severity !== args.severity) return false;
      if (args.objectType && e.objectType !== args.objectType) return false;
      if (args.eventCode && e.eventCode !== args.eventCode) return false;
      if (args.dateFrom && e.occurredAt < args.dateFrom) return false;
      if (args.dateTo && e.occurredAt > args.dateTo) return false;
      if (cursorTimestamp) {
        if (direction === "older" && e.occurredAt >= cursorTimestamp)
          return false;
        if (direction === "newer" && e.occurredAt <= cursorTimestamp)
          return false;
      }
      return true;
    });

    entries.sort((a, b) => b.occurredAt - a.occurredAt);
    entries = entries.slice(0, fetchLimit);

    const hasMore = entries.length > limit;
    const resultEntries = entries.slice(0, limit);

    const nextCursor =
      hasMore && resultEntries.length > 0
        ? String(resultEntries[resultEntries.length - 1].occurredAt)
        : undefined;

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
        changes: entry.changes,
        rawPayload: entry.rawPayload,
        correlationId: entry.correlationId,
        occurredAt: entry.occurredAt,
      })),
      nextCursor,
    };
  },
});
