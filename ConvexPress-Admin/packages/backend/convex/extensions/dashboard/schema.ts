/**
 * Dashboard extension — schema (v2 Layer 1).
 *
 * Merged into the schema hub by scripts/generate-extension-index.mjs.
 *
 *   dashboard_layouts       – admin-designed default home layouts, one per
 *                             scope ("default", "role:<slug>", "plan:<slug>").
 *   dashboard_user_layouts  – a member's own arrangement, layered over the
 *                             scope layout they inherit; "reset" deletes it.
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

export const dashboardLayoutItemValidator = v.object({
  key: v.string(),
  widgetId: v.string(),
  x: v.number(),
  y: v.number(),
  w: v.number(),
  h: v.number(),
  settings: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
  hidden: v.optional(v.boolean()),
});

export const tables = {
  dashboard_layouts: defineTable({
    /** "default" | "role:<roleSlug>" | "plan:<planSlug>" */
    scope: v.string(),
    title: v.string(),
    items: v.array(dashboardLayoutItemValidator),
    /** Members may rearrange their own copy of this layout. */
    membersCanEdit: v.boolean(),
    updatedBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_scope", ["scope"]),

  dashboard_user_layouts: defineTable({
    userId: v.id("users"),
    /** Scope this arrangement was derived from, so a changed default can be offered. */
    baseScope: v.string(),
    items: v.array(dashboardLayoutItemValidator),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
};
