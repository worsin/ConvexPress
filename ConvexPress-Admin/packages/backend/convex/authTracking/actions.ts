/**
 * Auth System - Actions
 *
 * Server-side actions for auth-related operations.
 *
 * NOTE: Impersonation is not currently implemented. If needed in the future,
 * it should use the admin local JWT or Clerk auth system.
 */

import { v } from "convex/values";
import { action } from "../_generated/server";

// ─── Get Impersonation URL ─────────────────────────────────────────────────

/**
 * Generates an impersonation URL for the given user.
 *
 * NOTE: This action is currently disabled. A new impersonation mechanism
 * will be implemented when needed.
 *
 * @param userId - The Convex user ID to impersonate
 * @returns An error message indicating the feature is unavailable
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getImpersonationUrl = action({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    userId: v.id("users"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (_ctx, _args): Promise<{ url: string } | { error: string }> => {
    return { error: "Impersonation is not currently available." };
  },
});
