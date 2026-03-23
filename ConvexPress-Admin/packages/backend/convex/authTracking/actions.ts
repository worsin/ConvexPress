/**
 * Auth System - Actions
 *
 * Server-side actions for auth-related operations.
 *
 * NOTE: The WorkOS impersonation action has been removed as part of the auth
 * migration away from WorkOS. If impersonation is needed in the future,
 * it should be implemented using the new auth system (admin local JWT or Clerk).
 */

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";

// ─── Get Impersonation URL ─────────────────────────────────────────────────

/**
 * Generates an impersonation URL for the given user.
 *
 * NOTE: This action is currently disabled. WorkOS impersonation has been removed.
 * A new impersonation mechanism will be implemented when needed.
 *
 * @param userId - The Convex user ID to impersonate
 * @returns An error message indicating the feature is unavailable
 */
export const getImpersonationUrl = action({
  args: {
    userId: v.id("users"),
  },
  handler: async (_ctx, _args): Promise<{ url: string } | { error: string }> => {
    return { error: "Impersonation is not available. WorkOS integration has been removed." };
  },
});
