/**
 * Auth System - Public Queries
 *
 * Client-callable queries for auth state checks.
 *
 *   - hasAdmin: Public check for whether an administrator account exists.
 *     Used by the AdminGate component to decide whether to show the
 *     first-admin creation form, a "waiting for server" message, or
 *     the normal auth flow.
 */

import { query } from "../_generated/server";

// ---- Has Admin ---------------------------------------------------------------

/**
 * Check whether at least one administrator user exists in the database.
 *
 * PUBLIC query - no authentication required. This is intentionally
 * unauthenticated so the AdminGate can determine the correct UI to
 * display before any user has logged in.
 *
 * Returns `true` if an admin exists, `false` otherwise.
 */
export const hasAdmin = query({
  args: {},
  handler: async (ctx) => {
    const adminRole = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", "administrator"))
      .unique();

    if (!adminRole) return false;

    const admin = await ctx.db
      .query("users")
      .withIndex("by_roleId", (q) => q.eq("roleId", adminRole._id))
      .first();

    return !!admin;
  },
});
