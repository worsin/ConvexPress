/**
 * Password Management System - Internal Functions
 *
 * Non-client-callable functions used by:
 *   - Password reset token verification (verifyResetToken)
 *   - Password change detection (detectAndHandlePasswordChange)
 *
 * The password reset flow uses a token-based approach:
 *   1. User requests reset -> token generated, hashed, stored on user record
 *   2. User clicks reset link -> token verified via verifyResetToken
 *   3. User submits new password -> token consumed, password updated
 *
 * Note: Since the Password Management System does NOT have its own table
 * (it adds fields to the shared users table), there is no cleanup cron.
 * The user fields are lightweight and don't accumulate data over time.
 */

import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { RESET_HEURISTIC_WINDOW_MS } from "./validators";
import { timingSafeEquals } from "../helpers/timingSafe";

// ─── verifyResetToken ──────────────────────────────────────────────────────

/**
 * Verify a password reset token and return the associated user ID.
 *
 * This function:
 *   1. Looks up the user by email
 *   2. Compares the provided token hash against the stored hash
 *   3. Checks token expiry
 *   4. Returns the user ID if valid, null otherwise
 *
 * Note: The caller is responsible for hashing the raw token before calling this.
 * The token hash comparison is done with timing-safe string comparison.
 *
 * @param email - The user's email address
 * @param tokenHash - SHA-256 hash of the token from the reset URL
 * @returns User ID if the token is valid, null otherwise
 */
export const verifyResetToken = internalMutation({
  args: {
    email: v.string(),
    tokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .unique();

    if (!user) return null;

    // Check if there's a stored token
    if (!user.passwordResetToken || !user.passwordResetTokenExpiresAt) {
      return null;
    }

    // Check token expiry
    if (Date.now() > user.passwordResetTokenExpiresAt) {
      // Token expired -- clear it
      await ctx.db.patch(user._id, {
        passwordResetToken: undefined,
        passwordResetTokenExpiresAt: undefined,
        updatedAt: Date.now(),
      });
      return null;
    }

    // Compare token hashes without leaking prefix match length.
    if (!timingSafeEquals(user.passwordResetToken, args.tokenHash)) {
      return null;
    }

    return { userId: user._id };
  },
});

// ─── detectAndHandlePasswordChange ──────────────────────────────────────────

/**
 * Detect whether a password change is a reset completion or a profile change,
 * and route to the appropriate handler.
 *
 * This function implements a timestamp-based heuristic:
 *
 *   1. If `passwordResetRequestedAt` is within the last hour:
 *      -> This is a reset completion -> call handlePasswordResetCompleted
 *   2. If `passwordResetRequestedAt` is NOT recent (or doesn't exist):
 *      -> This is a profile password change -> call handlePasswordChanged
 *
 * @param userId - ConvexPress user document ID
 */
export const detectAndHandlePasswordChange = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return;

    const now = Date.now();
    const passwordResetRequestedAt = user.passwordResetRequestedAt;

    // Heuristic: was a reset requested within the last hour?
    const wasResetRequested =
      passwordResetRequestedAt &&
      now - passwordResetRequestedAt < RESET_HEURISTIC_WINDOW_MS;

    if (wasResetRequested) {
      // This is a reset completion
      await ctx.scheduler.runAfter(
        0,
        internal.password.mutations.handlePasswordResetCompleted,
        {
          userId: args.userId,
          timestamp: now,
        },
      );
    } else {
      // This is a profile password change
      await ctx.scheduler.runAfter(
        0,
        internal.password.mutations.handlePasswordChanged,
        {
          userId: args.userId,
          timestamp: now,
        },
      );
    }
  },
});
