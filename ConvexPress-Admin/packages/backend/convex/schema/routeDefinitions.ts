/**
 * Route Definitions - Schema
 *
 * Stores route definitions synced from Airtable.
 * Each route represents a page/endpoint in the admin or website app
 * with its access control configuration.
 *
 * Source: Airtable table tblgdxTFKRbmuQ2qx (70 records)
 *
 * Note: This is the DEFINITION table (blueprint data).
 * The RUNTIME routing table is in schema/routing.ts (redirects, etc.).
 *
 * Owned by the Routing System.
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

export const routeDefinitionsTables = {
  routeDefinitions: defineTable({
    /** Human-readable name (e.g., "All Posts") */
    name: v.string(),
    /** Route path (e.g., "/admin/posts") */
    path: v.string(),
    /** Notes / description */
    notes: v.optional(v.string()),
    /** Layout: "_admin", "_marketing", "_dashboard" */
    layout: v.optional(v.string()),
    /** Whether authentication is required */
    authRequired: v.boolean(),
    /** Route type: "Page", "Layout", "API" */
    routeType: v.string(),
    /** Status: "Active", "Planned", "Inactive" */
    status: v.string(),
    /** Which app: "Website", "Admin" */
    app: v.optional(v.string()),
    /** Implementation completion (0-1) */
    completion: v.optional(v.number()),
    /** Role names that can access this route */
    roleNames: v.optional(v.array(v.string())),
    /** System name */
    systemName: v.optional(v.string()),
    /** Airtable record ID for sync tracking */
    airtableRecordId: v.string(),
    /** Timestamp of last sync */
    syncedAt: v.number(),
  })
    .index("by_path", ["path"])
    .index("by_airtable_id", ["airtableRecordId"])
    .index("by_status", ["status"])
    .index("by_app", ["app"])
    .index("by_layout", ["layout"]),
};
