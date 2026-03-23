/**
 * Event Definitions - Schema
 *
 * Stores event definitions synced from Airtable.
 * Each event represents something that can happen in the system
 * and may trigger email/site notifications, audit log entries, etc.
 *
 * Source: Airtable table tblDQOlXXJO1aQapT (63 records)
 *
 * Events follow the {system}.{verb} naming convention:
 *   - post.created, post.updated, post.trashed
 *   - user.registered, user.role_changed
 *   - comment.created, comment.approved
 *
 * Note: This is the DEFINITION table (blueprint data).
 * The RUNTIME events table is in schema/events.ts.
 *
 * Owned by the Event Dispatcher System.
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

export const eventDefinitionsTables = {
  eventDefinitions: defineTable({
    /** Human-readable name (e.g., "Post Created") */
    name: v.string(),
    /** Event code (e.g., "post.created") */
    eventCode: v.string(),
    /** Notes / description */
    notes: v.optional(v.string()),
    /** Status: "Active", "Planned", "Inactive" */
    status: v.string(),
    /** Audit status: "Complete", "Incomplete" */
    auditStatus: v.optional(v.string()),
    /** Implementation completion (0-1) */
    completion: v.optional(v.number()),
    /** JSON schema for the event payload */
    payloadSchema: v.optional(v.string()),
    /** Category name (resolved from Event Types link) */
    category: v.optional(v.string()),
    /** Action codes that trigger this event */
    actionCodes: v.optional(v.array(v.string())),
    /** Linked email notification names */
    emailNotificationNames: v.optional(v.array(v.string())),
    /** Linked site notification names */
    siteNotificationNames: v.optional(v.array(v.string())),
    /** System name */
    systemName: v.optional(v.string()),
    /** Airtable record ID for sync tracking */
    airtableRecordId: v.string(),
    /** Timestamp of last sync */
    syncedAt: v.number(),
  })
    .index("by_event_code", ["eventCode"])
    .index("by_airtable_id", ["airtableRecordId"])
    .index("by_status", ["status"])
    .index("by_category", ["category"]),
};
