/**
 * Site Notification Definitions - Schema
 *
 * Stores site notification definitions synced from Airtable.
 * Each definition represents a type of in-app notification
 * that can be triggered by system events.
 *
 * Source: Airtable table tblAQZWvnLT4ygl0j (30 records)
 *
 * Note: This is the DEFINITION table (blueprint data).
 * The RUNTIME notifications table is in schema/notifications.ts.
 *
 * Owned by the Site Notification System.
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

export const siteNotificationDefinitionsTables = {
  siteNotificationDefinitions: defineTable({
    /** Human-readable name (e.g., "New Comment on Post") */
    name: v.string(),
    /** Message template string */
    messageTemplate: v.optional(v.string()),
    /** Notification type: "Info", "Success", "Warning", "Error" */
    notificationType: v.string(),
    /** Status: "Active", "Draft", "Inactive" */
    status: v.string(),
    /** Whether notification persists until dismissed */
    persistent: v.boolean(),
    /** Recipient type: "Customer", "Admin", etc. */
    recipientType: v.optional(v.string()),
    /** URL to navigate to when notification is clicked */
    actionUrl: v.optional(v.string()),
    /** Notes / description */
    notes: v.optional(v.string()),
    /** Audit status: "Complete", "Incomplete" */
    auditStatus: v.optional(v.string()),
    /** Implementation completion (0-1) */
    completion: v.optional(v.number()),
    /** Event codes that trigger this notification */
    eventCodes: v.optional(v.array(v.string())),
    /** System name */
    systemName: v.optional(v.string()),
    /** Airtable record ID for sync tracking */
    airtableRecordId: v.string(),
    /** Timestamp of last sync */
    syncedAt: v.number(),
  })
    .index("by_airtable_id", ["airtableRecordId"])
    .index("by_status", ["status"])
    .index("by_type", ["notificationType"]),
};
