import { ConvexError } from "convex/values";

import type { QueryCtx } from "../_generated/server";

type BundleCtx = Pick<QueryCtx, "db">;

/**
 * Check whether the commerce bundles plugin is enabled via settings.
 * Falls back to false when no settings row exists.
 */
export async function isCommerceBundlesEnabled(
  ctx: BundleCtx,
): Promise<boolean> {
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_section", (q) => q.eq("section", "plugins"))
    .unique();

  const values = (doc?.values ?? {}) as Record<string, unknown>;
  return Boolean(values.commerceEnabled) && Boolean(values.commerceBundlesEnabled);
}

/**
 * Guard — throws ConvexError when bundles are disabled.
 */
export async function requireCommerceBundlesEnabled(
  ctx: BundleCtx,
): Promise<void> {
  if (!(await isCommerceBundlesEnabled(ctx))) {
    throw new ConvexError({
      code: "commerce_bundles_disabled",
      message: "Commerce Bundles plugin is disabled.",
    });
  }
}
