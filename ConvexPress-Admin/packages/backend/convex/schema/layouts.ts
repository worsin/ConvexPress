/**
 * @deprecated 2026-05-11 — Legacy in-admin Theme/Template Builder.
 *
 * STATUS:  Frozen. Hidden from active nav. Do NOT extend or fix issues here.
 * REASON:  A pre-built section enum + preset theme picker limits what each
 *          site can look like. Replaced by AI-generated React components,
 *          one per route, generated per site by the design:* skill kit.
 * REPLACEMENT:  See ConvexPress-Website/design-kit/README.md
 * REMOVAL:  Safe to delete once at least one site is fully shipped via the
 *           skill kit and nothing else references this file.
 */
/**
 * Layout System - Schema
 *
 * Stores layout configurations for knowledge base articles and pages.
 * Layouts define content width, section arrangement, and display variants.
 * Supports preset (built-in), custom (user-created), and AI-generated layouts.
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

export const layoutTables = {
  layouts: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    type: v.union(
      v.literal("preset"),
      v.literal("custom"),
      v.literal("ai"),
    ),
    config: v.object({
      contentWidth: v.union(
        v.literal("narrow"),
        v.literal("medium"),
        v.literal("wide"),
        v.literal("full"),
      ),
      sections: v.array(
        v.object({
          type: v.string(),
          enabled: v.boolean(),
          variant: v.optional(v.string()),
          options: v.optional(v.any()),
        }),
      ),
    }),
    isDefault: v.optional(v.boolean()),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_type", ["type"])
    .index("by_name", ["name"]),
};
