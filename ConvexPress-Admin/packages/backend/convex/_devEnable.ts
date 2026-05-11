/**
 * Dev-only — DELETE BEFORE PROD.
 * One-shot helper to enable commerce + dependent plugins for the demo.
 */
import { internalMutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";

function assertDevInternalsEnabled() {
  if (process.env.CONVEXPRESS_ENABLE_DEV_INTERNALS !== "true") {
    throw new ConvexError({
      code: "DEV_INTERNALS_DISABLED",
      message:
        "Dev-only Convex internals are disabled. Set CONVEXPRESS_ENABLE_DEV_INTERNALS=true in a local/dev deployment to use this helper.",
    });
  }
}

export const enableCommercePlugins = internalMutation({
  args: { confirm: v.literal("YES_ENABLE") },
  handler: async (ctx) => {
    assertDevInternalsEnabled();
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_section", (q: any) => q.eq("section", "plugins"))
      .unique();
    const enabled = {
      commerceEnabled: true,
      commerceSubscriptionsEnabled: true,
      commerceDigitalEnabled: true,
      commerceReviewsEnabled: true,
      commerceWishlistsEnabled: true,
      commerceBundlesEnabled: true,
      commerceReturnsEnabled: true,
      membershipEnabled: true,
      knowledgeBaseEnabled: true,
      ticketsEnabled: true,
      customFieldsEnabled: true,
      recipesEnabled: true,
      galleryEnabled: true,
    };
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        values: { ...((existing as any).values ?? {}), ...enabled },
        updatedAt: now,
      });
      return { updated: true };
    }
    await ctx.db.insert("settings", {
      section: "plugins",
      values: enabled,
      createdAt: now,
      updatedAt: now,
    } as any);
    return { created: true };
  },
});
