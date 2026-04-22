import { internalMutation } from "../_generated/server";
import { PRESET_THEMES } from "./presets";

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const seedPresets = internalMutation({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("themes")
      .withIndex("by_type", (q: ConvexQueryBuilder) => q.eq("type", "preset"))
      .collect();
    if (existing.length > 0) return { seeded: false, reason: "presets already exist" };

    const now = Date.now();
    for (const theme of PRESET_THEMES) {
      await ctx.db.insert("themes", {
        ...theme,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { seeded: true, count: PRESET_THEMES.length };
  },
});
