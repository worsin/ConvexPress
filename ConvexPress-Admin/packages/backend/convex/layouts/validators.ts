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
 * Layout System - Validators
 *
 * Shared Convex argument validators for layout mutations.
 */

import { v } from "convex/values";

/**
 * Section config validator — reused in create and update args.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const sectionValidator = v.object({
  type: v.string(),
  enabled: v.boolean(),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  variant: v.optional(v.string()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  options: v.optional(v.any()),
});

/**
 * Layout config validator — the full config object.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const configValidator = v.object({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  contentWidth: v.union(
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    v.literal("narrow"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    v.literal("medium"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    v.literal("wide"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    v.literal("full"),
  ),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  sections: v.array(sectionValidator),
});

/**
 * Arguments for creating a new layout.
 */
export const createArgs = {
  name: v.string(),
  slug: v.string(),
  description: v.optional(v.string()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  type: v.union(
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    v.literal("preset"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    v.literal("custom"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    v.literal("ai"),
  ),
  config: configValidator,
  isDefault: v.optional(v.boolean()),
};

/**
 * Arguments for updating an existing layout.
 * All fields except the ID are optional (patch semantics).
 */
export const updateArgs = {
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  id: v.id("layouts"),
  name: v.optional(v.string()),
  slug: v.optional(v.string()),
  description: v.optional(v.string()),
  config: v.optional(configValidator),
  isDefault: v.optional(v.boolean()),
};
