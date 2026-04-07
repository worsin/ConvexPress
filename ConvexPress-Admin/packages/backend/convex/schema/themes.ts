import { defineTable } from "convex/server";
import { v } from "convex/values";

export const themesTables = {
  themes: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    type: v.union(
      v.literal("preset"),
      v.literal("custom"),
    ),
    // Theme bundles all appearance settings together
    headerConfig: v.optional(v.any()),     // HeaderConfig shape
    footerConfig: v.optional(v.any()),     // FooterConfig shape
    layoutAssignments: v.optional(v.any()), // Which layout per content type
    colorPalette: v.optional(v.any()),     // Color overrides
    thumbnail: v.optional(v.string()),     // Preview image or SVG
    isActive: v.optional(v.boolean()),     // Currently active theme
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_type", ["type"])
    .index("by_active", ["isActive"]),
};
