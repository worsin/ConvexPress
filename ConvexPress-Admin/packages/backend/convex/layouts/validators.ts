/**
 * Layout System - Validators
 *
 * Shared Convex argument validators for layout mutations.
 */

import { v } from "convex/values";

/**
 * Section config validator — reused in create and update args.
 */
export const sectionValidator = v.object({
  type: v.string(),
  enabled: v.boolean(),
  variant: v.optional(v.string()),
  options: v.optional(v.any()),
});

/**
 * Layout config validator — the full config object.
 */
export const configValidator = v.object({
  contentWidth: v.union(
    v.literal("narrow"),
    v.literal("medium"),
    v.literal("wide"),
    v.literal("full"),
  ),
  sections: v.array(sectionValidator),
});

/**
 * Arguments for creating a new layout.
 */
export const createArgs = {
  name: v.string(),
  slug: v.string(),
  description: v.optional(v.string()),
  type: v.union(
    v.literal("preset"),
    v.literal("custom"),
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
  id: v.id("layouts"),
  name: v.optional(v.string()),
  slug: v.optional(v.string()),
  description: v.optional(v.string()),
  config: v.optional(configValidator),
  isDefault: v.optional(v.boolean()),
};
