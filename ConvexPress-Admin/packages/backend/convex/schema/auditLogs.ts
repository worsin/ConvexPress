/**
 * Audit Log System - Schema
 *
 * One table powering the immutable audit trail:
 *
 *   - auditEntries: Enriched view over the events table. Each entry references
 *     a source event and adds human-readable descriptions, severity classifications,
 *     actor snapshots (name, email, role at action time), and object context.
 *
 * The Audit Log System is a VIEW LAYER over the Event Dispatcher System's
 * `events` table. It does not emit its own events except for self-auditing
 * actions (clear, export).
 *
 * Entries are APPEND-ONLY. There is no update mutation. Only the clear
 * mutation (Administrator-only, self-auditing) and retention cleanup cron
 * can remove entries.
 *
 * Owned by the Audit Log System.
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

export const auditLogTables = {
  // ─── Audit Entries ──────────────────────────────────────────────────────────
  auditEntries: defineTable({
    // --- Event Reference ---
    /** Reference to the source event in the events table */
    eventId: v.id("events"),

    /** Denormalized event code for filtering (e.g., "post.published") */
    eventCode: v.string(),

    // --- Action Description ---
    /** Human-readable action label (e.g., "Published Post") */
    action: v.string(),

    /** Full human-readable description of the action */
    description: v.string(),

    /** Severity classification */
    severity: v.union(
      v.literal("critical"),
      v.literal("high"),
      v.literal("medium"),
      v.literal("low"),
      v.literal("informational"),
    ),

    /** Source system slug (e.g., "post", "role", "auth") */
    system: v.string(),

    // --- Actor Context (snapshot at action time) ---
    /** User identifier or "system" for system-generated events */
    actorId: v.optional(v.string()),

    /** Display name at time of action (immutable snapshot) */
    actorName: v.optional(v.string()),

    /** Email at time of action (immutable snapshot) */
    actorEmail: v.optional(v.string()),

    /** Role name at time of action (immutable snapshot) */
    actorRole: v.optional(v.string()),

    /** Client IP address (only for auth-related events) */
    actorIp: v.optional(v.string()),

    /** Client user agent string */
    actorUserAgent: v.optional(v.string()),

    // --- Object Context ---
    /** Type of object affected */
    objectType: v.union(
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
    ),

    /** ID of the affected object */
    objectId: v.optional(v.string()),

    /** Human-readable object label (e.g., post title, user email) */
    objectLabel: v.optional(v.string()),

    // --- Change Details ---
    /** JSON: array of { field, oldValue, newValue } - only for update events */
    changes: v.optional(v.string()),

    /** Full event payload (JSON string) */
    rawPayload: v.string(),

    // --- Grouping ---
    /** Groups bulk operations for display */
    correlationId: v.optional(v.string()),

    /** Groups actions in a single user session */
    sessionId: v.optional(v.string()),

    // --- Timestamps ---
    /** When the action occurred (from event.emittedAt) */
    occurredAt: v.number(),

    // --- Retention ---
    /** When to auto-delete (mirrors event retention) */
    expiresAt: v.optional(v.number()),
  })
    .index("by_occurred", ["occurredAt"])
    .index("by_actor", ["actorId", "occurredAt"])
    .index("by_severity", ["severity", "occurredAt"])
    .index("by_object_type", ["objectType", "occurredAt"])
    .index("by_event_code", ["eventCode", "occurredAt"])
    .index("by_object", ["objectType", "objectId", "occurredAt"])
    .index("by_correlation", ["correlationId"])
    .index("by_expires", ["expiresAt"])
    .index("by_event", ["eventId"])
    .index("by_system", ["system", "occurredAt"])
    .searchIndex("search_audit", {
      searchField: "description",
      filterFields: ["severity", "system", "actorId", "objectType"],
    }),
};
