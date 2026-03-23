/**
 * Password Management System - Internal Functions
 *
 * Non-client-callable functions used by:
 *   - WorkOS webhook handler (detectAndHandlePasswordChange)
 *   - Cron job (cleanupOldRequests - NOT YET NEEDED: no separate table)
 *
 * Functions:
 *   detectAndHandlePasswordChange - Main webhook integration point
 *
 * Note: Since the Password Management System does NOT have its own table
 * (it adds fields to the shared users table), there is no cleanup cron.
 * The user fields are lightweight and don't accumulate data over time.
 */

import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { RESET_HEURISTIC_WINDOW_MS } from "./validators";

// ─── detectAndHandlePasswordChange ──────────────────────────────────────────

/**
 * Detect whether a WorkOS user.updated webhook indicates a password change,
 * and route to the appropriate handler.
 *
 * This function implements the timestamp-based heuristic described in the PRD:
 *
 *   1. If `passwordResetRequestedAt` is within the last hour:
 *      -> This is a reset completion -> call handlePasswordResetCompleted
 *   2. If `passwordResetRequestedAt` is NOT recent (or doesn't exist):
 *      -> This is a profile password change -> call handlePasswordChanged
 *
 * IMPORTANT CAVEAT:
 *   WorkOS's `user.updated` webhook fires for ANY user update (name change,
 *   email change, etc.), not just password changes. The caller (webhook handler
 *   in http.ts) should attempt to pre-filter where possible by checking
 *   webhook payload fields. If pre-filtering is not possible, this function
 *   may emit false positives.
 *
 * This is an acknowledged limitation in the PRD (Edge Case #1). Future
 * improvement: check WorkOS's `password_enabled` field or compare specific
 * fields in the webhook payload before invoking this function.
 *
 * @param userId - SmithHarper user document ID
 * @param workosId - WorkOS user ID from the webhook payload
 */
export const detectAndHandlePasswordChange = internalMutation({
  args: {
    userId: v.id("users"),
    workosId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
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
          workosId: args.workosId,
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
          workosId: args.workosId,
          timestamp: now,
        },
      );
    }
  },
});
