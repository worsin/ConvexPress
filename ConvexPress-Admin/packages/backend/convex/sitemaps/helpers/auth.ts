/**
 * Sitemap System - Auth Helper (Internal Query)
 *
 * Provides an internal query to verify capability from an action context.
 * Actions cannot directly use requireCan() since they lack ctx.db.
 * This internal query bridges that gap.
 *
 * Usage:
 *   // In an action:
 *   await ctx.runQuery(internal.sitemaps.helpers.auth.checkCapability, {
 *     workosUserId: identity.subject,
 *     capability: "seo.generate_sitemap",
 *   });
 */

import { internalQuery } from "../../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { lookupUserByIdentifier } from "../../helpers/permissions";

/**
 * Internal query to check if a user has a specific capability.
 * Designed for use from actions that need to verify permissions.
 *
 * @throws FORBIDDEN if the user lacks the required capability
 * @throws UNAUTHORIZED if the user is not found
 */
export const checkCapability = internalQuery({
  args: {
    workosUserId: v.string(),
    capability: v.string(),
  },
  handler: async (ctx, args) => {
    // Find user by identifier (workosUserId, clerkUserId, or Convex _id)
    const user = await lookupUserByIdentifier(ctx, args.workosUserId);

    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "User not found",
      });
    }

    if (user.status !== "active") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Account is not active",
      });
    }

    // Resolve user's role
    let capabilities: string[] = [];

    if (user.roleId) {
      const role = await ctx.db.get("roles", user.roleId);
      if (role && role.status === "active") {
        capabilities = (role as { capabilities: string[] }).capabilities || [];
      }
    } else if (user.internalRole) {
      const role = await ctx.db
        .query("roles")
        .withIndex("by_slug", (q) => q.eq("slug", user.internalRole as string))
        .unique();
      if (role && role.status === "active") {
        capabilities = role.capabilities || [];
      }
    }

    if (!capabilities.includes(args.capability)) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: `Missing capability: ${args.capability}`,
      });
    }

    return { authorized: true, userId: user._id };
  },
});
