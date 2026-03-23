import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Role & Capability System - Schema
 *
 * Two tables:
 *   - roles: Role definitions with capabilities and page access arrays
 *   - roleChanges: Audit trail of role assignments for compliance tracking
 *
 * Roles follow WordPress conventions:
 *   Administrator (100) > Editor (80) > Author (60) > Contributor (40) > Subscriber (20)
 *
 * Each role has:
 *   - capabilities[]: Array of capability strings (e.g., "post.create", "media.upload")
 *   - pageAccess[]: Array of admin routes the role can access (e.g., "/admin/posts")
 *   - isProtected: Built-in roles cannot be deleted
 *   - type: "internal" (team), "customer" (public), or "system" (system-reserved)
 */
export const rolesTables = {
  roles: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.string(),
    level: v.number(),
    type: v.union(
      v.literal("internal"),
      v.literal("customer"),
      v.literal("system"),
    ),
    isDefault: v.boolean(),
    isProtected: v.boolean(),
    capabilities: v.array(v.string()),
    pageAccess: v.array(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.optional(v.id("users")),
    /** Airtable record ID for sync tracking */
    airtableRecordId: v.optional(v.string()),
  })
    .index("by_slug", ["slug"])
    .index("by_airtable_id", ["airtableRecordId"])
    .index("by_level", ["level"])
    .index("by_status", ["status"])
    .index("by_isDefault", ["isDefault"]),

  /**
   * Role change audit trail.
   * Records every role assignment/change for compliance and debugging.
   */
  roleChanges: defineTable({
    userId: v.id("users"),
    oldRoleId: v.optional(v.id("roles")),
    newRoleId: v.id("roles"),
    changedBy: v.id("users"),
    reason: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_timestamp", ["timestamp"]),
};
