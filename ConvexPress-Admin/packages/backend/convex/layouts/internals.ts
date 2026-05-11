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
 * Layout System - Internal Functions
 *
 * Internal mutations not callable from the client.
 *   seedPresets — Seeds the 7 built-in preset layouts (idempotent)
 */

import { internalMutation } from "../_generated/server";
import { PRESET_LAYOUTS } from "./presets";

/**
 * Seed preset layouts into the database.
 *
 * Idempotent — skips if any preset layouts already exist.
 * Intended to be called during bootstrap or via the Convex dashboard.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const seedPresets = internalMutation({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("layouts")
      .withIndex("by_type", (q: ConvexQueryBuilder) => q.eq("type", "preset"))
      .collect();

    if (existing.length > 0) {
      return { seeded: false, reason: "presets already exist" };
    }

    const now = Date.now();
    for (const preset of PRESET_LAYOUTS) {
      await ctx.db.insert("layouts", {
        ...preset,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { seeded: true, count: PRESET_LAYOUTS.length };
  },
});
