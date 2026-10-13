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
import { hasActiveAdmin } from "./adminPresence";

import { v } from "convex/values";
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
  returns: v.boolean(),
  handler: async (ctx) => {
    return await hasActiveAdmin(ctx);
  },
});
