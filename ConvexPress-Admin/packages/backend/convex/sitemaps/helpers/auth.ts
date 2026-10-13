/**
 * Sitemap System - Auth Helper (Internal Query)
 *
 * Provides an internal query to verify capability from an action context.
 * Actions cannot directly use requireCan() since they lack ctx.db.
 * This internal query bridges that gap.
 *
 * Convex passes the action's verified identity to this query, so the caller
 * is resolved by requireCan (issuer rules, auth source, active status, role
 * compatibility and management-session ceilings), never from an identifier
 * argument.
 *
 * Usage:
 *   // In an action:
 *   const { userId } = await ctx.runQuery(internal.sitemaps.helpers.auth.checkCapability, {
 *     capability: "seo.generate_sitemap",
 *   });
 */

import { internalQuery } from "../../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { requireCan } from "../../helpers/permissions";
import { isConcreteCapability } from "../../types/capabilities";

/**
 * Internal query to check that the calling user has a specific capability.
 * Designed for use from actions that need to verify permissions.
 *
 * @throws FORBIDDEN if the user lacks the required capability
 * @throws UNAUTHORIZED if there is no authenticated ConvexPress user
 */
export const checkCapability = internalQuery({
  args: {
    capability: v.string(),
  },
  returns: v.object({ authorized: v.boolean(), userId: v.id("users") }),
  handler: async (ctx, args) => {
    if (!isConcreteCapability(args.capability)) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Insufficient permissions",
      });
    }
    const user = await requireCan(ctx, args.capability);
    return { authorized: true, userId: user._id };
  },
});
