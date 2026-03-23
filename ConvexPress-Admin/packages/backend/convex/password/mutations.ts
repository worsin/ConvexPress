/**
 * Password Management System - Internal Mutations
 *
 * ALL mutations in this system are internal (not client-callable).
 * They are called by:
 *   - Server actions (recordResetRequest, via the forgot-password page)
 *   - WorkOS webhook handler (handlePasswordChanged, handlePasswordResetCompleted)
 *   - Admin action (recordAdminReset, called by adminResetUserPassword)
 *
 * SmithHarper NEVER stores, hashes, or validates passwords.
 * WorkOS handles all password cryptography.
 * These mutations are for event plumbing: audit trail, notifications, and
 * tracking timestamps on user records.
 *
 * WordPress equivalents:
 *   recordResetRequest       -> retrieve_password() firing `lostpassword_post`
 *   handlePasswordChanged    -> wp_set_password() + `profile_update` action
 *   handlePasswordResetCompleted -> reset_password() + `after_password_reset`
 *   recordAdminReset         -> (no WP equivalent; WP admins set passwords directly)
 */

import { internalMutation } from "../_generated/server";
import { emitEvent } from "../helpers/events";
import { PASSWORD_EVENTS, SYSTEM } from "../events/constants";
import {
  recordResetRequestArgs,
  handlePasswordChangedArgs,
  handlePasswordResetCompletedArgs,
  recordAdminResetArgs,
} from "./validators";

// ─── recordResetRequest ─────────────────────────────────────────────────────

/**
 * Record that a password reset was requested for a given email.
 *
 * Called from a server action when the user submits the forgot-password form.
 * This is INTERNAL -- never exposed to the client.
 *
 * Email enumeration prevention:
 *   - If the email exists: update passwordResetRequestedAt, emit event
 *   - If the email does NOT exist: do nothing (silent, no error)
 *   - Always returns void (caller shows the same success message either way)
 *
 * The timestamp is used by the webhook heuristic to distinguish
 * reset completions from profile password changes.
 */
export const recordResetRequest = internalMutation({
  args: recordResetRequestArgs,
  handler: async (ctx, args) => {
    // Look up user by email (may not exist)
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .unique();

    if (!user) {
      // Silent return -- email enumeration prevention
      return;
    }

    const now = Date.now();

    // Update the user's passwordResetRequestedAt timestamp
    await ctx.db.patch("users", user._id, {
      passwordResetRequestedAt: now,
      updatedAt: now,
    });

    // Emit password.reset_requested event
    // Include resetUrl in payload if available (for supplementary email template)
    const eventPayload: Record<string, unknown> = {
      email: args.email.toLowerCase(),
      userId: user._id,
    };
    if (args.resetUrl) {
      eventPayload.resetUrl = args.resetUrl;
    }
    await emitEvent(ctx, PASSWORD_EVENTS.RESET_REQUESTED, SYSTEM.PASSWORD, eventPayload);
  },
});

// ─── handlePasswordChanged ──────────────────────────────────────────────────

/**
 * Record that a user changed their password via their profile/settings.
 *
 * Called from the WorkOS `user.updated` webhook handler when the heuristic
 * determines this is a profile password change (NOT a reset completion).
 *
 * Updates lastPasswordChangedAt and emits password.changed event.
 */
export const handlePasswordChanged = internalMutation({
  args: handlePasswordChangedArgs,
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (!user) return;

    // Update the user's lastPasswordChangedAt timestamp
    await ctx.db.patch("users", args.userId, {
      lastPasswordChangedAt: args.timestamp,
      updatedAt: args.timestamp,
    });

    // Emit password.changed event
    await emitEvent(ctx, PASSWORD_EVENTS.CHANGED, SYSTEM.PASSWORD, {
      userId: args.userId,
      workosId: args.workosId,
    });
  },
});

// ─── handlePasswordResetCompleted ───────────────────────────────────────────

/**
 * Record that a user completed a password reset (via forgot-password flow).
 *
 * Called from the WorkOS `user.updated` webhook handler when the heuristic
 * determines this is a reset completion (passwordResetRequestedAt is recent).
 *
 * Updates lastPasswordChangedAt, increments passwordResetCount,
 * and emits password.reset_completed event.
 *
 * Uses the PASSWORD_EVENTS.RESET_COMPLETED constant from events/constants.ts.
 */
export const handlePasswordResetCompleted = internalMutation({
  args: handlePasswordResetCompletedArgs,
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (!user) return;

    // Increment the reset count (defaulting undefined to 0)
    const currentResetCount = user.passwordResetCount ?? 0;

    // Update user record
    await ctx.db.patch("users", args.userId, {
      lastPasswordChangedAt: args.timestamp,
      passwordResetCount: currentResetCount + 1,
      updatedAt: args.timestamp,
    });

    // Emit password.reset_completed event
    await emitEvent(ctx, PASSWORD_EVENTS.RESET_COMPLETED, SYSTEM.PASSWORD, {
      userId: args.userId,
      workosId: args.workosId,
    });
  },
});

// ─── recordAdminReset ───────────────────────────────────────────────────────

/**
 * Record that an admin triggered a password reset for another user.
 *
 * Called by the adminResetUserPassword action AFTER it has already:
 *   1. Verified the caller is an Administrator
 *   2. Called the WorkOS API to initiate the reset
 *
 * Sets passwordResetRequestedAt on the target user and emits
 * password.reset_requested with isAdminInitiated: true.
 */
export const recordAdminReset = internalMutation({
  args: recordAdminResetArgs,
  handler: async (ctx, args) => {
    const targetUser = await ctx.db.get("users", args.targetUserId);
    if (!targetUser) return;

    // Update the target user's passwordResetRequestedAt timestamp
    await ctx.db.patch("users", args.targetUserId, {
      passwordResetRequestedAt: args.timestamp,
      updatedAt: args.timestamp,
    });

    // Emit password.reset_requested event with admin context
    await emitEvent(ctx, PASSWORD_EVENTS.RESET_REQUESTED, SYSTEM.PASSWORD, {
      email: targetUser.email,
      userId: args.targetUserId,
      initiatedBy: args.adminId,
      isAdminInitiated: true,
    });
  },
});
