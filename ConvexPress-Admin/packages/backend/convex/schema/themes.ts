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
