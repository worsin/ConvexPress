/**
 * Capabilities (Actions) - Schema
 *
 * Stores the capability/action definitions synced from Airtable.
 * Each capability represents a permission that can be assigned to roles.
 *
 * Source: Airtable table tblQTSboBXFiXSP3O (137 records)
 *
 * Capabilities follow the {system}.{verb} naming convention:
 *   - post.create, post.update, post.delete, post.publish
 *   - media.upload, media.delete
 *   - user.create, user.update, role.assign
 *   - settings.manage, audit.view
 *
 * Owned by the Role & Capability System.
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

export const capabilitiesTables = {
  capabilities: defineTable({
    /** Human-readable name (e.g., "Create Post") */
    name: v.string(),
    /** Action code (e.g., "post.create") - the capability string */
    actionCode: v.string(),
    /** Notes / description from Airtable */
    notes: v.optional(v.string()),
    /** Status: "Active", "Planned", "Inactive" */
    status: v.string(),
    /** Audit status: "Complete", "Incomplete" */
    auditStatus: v.optional(v.string()),
    /** Implementation completion (0-1) */
    completion: v.optional(v.number()),
    /** Category name (resolved from Action Types link) */
    category: v.optional(v.string()),
    /** Role names that have this capability */
    roleNames: v.optional(v.array(v.string())),
    /** Event codes this action triggers */
    eventCodes: v.optional(v.array(v.string())),
    /** System name (resolved from linked Systems) */
    systemName: v.optional(v.string()),
    /** Airtable record ID for sync tracking */
    airtableRecordId: v.string(),
    /** Timestamp of last sync */
    syncedAt: v.number(),
  })
    .index("by_action_code", ["actionCode"])
    .index("by_airtable_id", ["airtableRecordId"])
    .index("by_status", ["status"])
    .index("by_category", ["category"]),
};
