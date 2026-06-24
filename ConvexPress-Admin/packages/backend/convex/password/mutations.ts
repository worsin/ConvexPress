/**
 * Password Management System - Internal Mutations
 *
 * ALL mutations in this system are internal (not client-callable).
 * They are called by:
 *   - Server actions (recordResetRequest, via the forgot-password page)
 *   - Password reset completion flow (handlePasswordResetCompleted)
 *   - Admin action (recordAdminReset, called by adminResetUserPassword)
 *
 * ConvexPress uses Convex Auth for authentication. Password hashing is handled
 * by the auth system. These mutations handle the reset flow: token storage,
 * email queueing, audit trail, notifications, and timestamp tracking.
 *
 * WordPress equivalents:
 *   recordResetRequest       -> retrieve_password() firing `lostpassword_post`
 *   storeResetToken          -> generates & stores reset key
 *   handlePasswordChanged    -> wp_set_password() + `profile_update` action
 *   handlePasswordResetCompleted -> reset_password() + `after_password_reset`
 *   recordAdminReset         -> (no WP equivalent; WP admins set passwords directly)
 */

import { internalMutation } from "../_generated/server";
import { emitEvent } from "../helpers/events";
import { PASSWORD_EVENTS, SYSTEM } from "../events/constants";
import { EMAIL_TEMPLATES, queueEmailForEvent } from "../helpers/email";
import { getUserIdentifier } from "../helpers/permissions";
import {
  RESET_REQUEST_COOLDOWN_MS,
  recordResetRequestArgs,
  handlePasswordChangedArgs,
  handlePasswordResetCompletedArgs,
  recordAdminResetArgs,
  storeResetTokenArgs,
} from "./validators";

// ─── recordResetRequest ─────────────────────────────────────────────────────

/**
 * Record that a password reset was requested for a given email.
 * Stores the hashed reset token and queues the reset email via Resend.
 *
 * Called from a server action when the user submits the forgot-password form.
 * This is INTERNAL -- never exposed to the client.
 *
 * Email enumeration prevention:
 *   - If the email exists: store token, queue email, emit event
 *   - If the email does NOT exist: do nothing (silent, no error)
 *   - Always returns void (caller shows the same success message either way)
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
    if (
      user.passwordResetRequestedAt &&
      now - user.passwordResetRequestedAt < RESET_REQUEST_COOLDOWN_MS
    ) {
      return;
    }

    // Store the hashed reset token and update timestamp
    await ctx.db.patch(user._id, {
      passwordResetRequestedAt: now,
      passwordResetToken: args.tokenHash,
      passwordResetTokenExpiresAt: args.tokenExpiresAt,
      updatedAt: now,
    });

    // Queue reset email via the Resend-based email system
    const recipientName =
      user.displayName ??
      [user.firstName, user.lastName].filter(Boolean).join(" ") ??
      "";

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.PASSWORD_RESET, {
      recipientEmail: user.email,
      recipientName,
      recipientUserId: getUserIdentifier(user),
      variables: {
        reset_url: args.resetUrl,
        expiry_hours: "24",
      },
    });

    // Emit password.reset_requested event
    await emitEvent(ctx, PASSWORD_EVENTS.RESET_REQUESTED, SYSTEM.PASSWORD, {
      email: args.email.toLowerCase(),
      userId: user._id,
    });
  },
});

// ─── storeResetToken ────────────────────────────────────────────────────────

/**
 * Store a hashed reset token on a user record and queue the reset email.
 * Used by the admin-initiated reset flow where we already have the userId.
 */
export const storeResetToken = internalMutation({
  args: storeResetTokenArgs,
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return;

    const now = Date.now();

    // Store the hashed reset token
    await ctx.db.patch(args.userId, {
      passwordResetRequestedAt: now,
      passwordResetToken: args.tokenHash,
      passwordResetTokenExpiresAt: args.tokenExpiresAt,
      updatedAt: now,
    });

    // Queue reset email via the Resend-based email system
    const recipientName =
      user.displayName ??
      [user.firstName, user.lastName].filter(Boolean).join(" ") ??
      "";

    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.PASSWORD_RESET, {
      recipientEmail: user.email,
      recipientName,
      recipientUserId: getUserIdentifier(user),
      variables: {
        reset_url: args.resetUrl,
        expiry_hours: "24",
      },
    });
  },
});

// ─── handlePasswordChanged ──────────────────────────────────────────────────

/**
 * Record that a user changed their password via their profile/settings.
 *
 * Updates lastPasswordChangedAt and emits password.changed event.
 */
export const handlePasswordChanged = internalMutation({
  args: handlePasswordChangedArgs,
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return;

    // Update the user's lastPasswordChangedAt timestamp
    await ctx.db.patch(args.userId, {
      lastPasswordChangedAt: args.timestamp,
      updatedAt: args.timestamp,
    });

    // Emit password.changed event
    await emitEvent(ctx, PASSWORD_EVENTS.CHANGED, SYSTEM.PASSWORD, {
      userId: args.userId,
    });
  },
});

// ─── handlePasswordResetCompleted ───────────────────────────────────────────

/**
 * Record that a user completed a password reset (via forgot-password flow).
 *
 * Called after the user submits a new password with a valid reset token.
 *
 * Updates lastPasswordChangedAt, increments passwordResetCount,
 * clears the reset token, and emits password.reset_completed event.
 */
export const handlePasswordResetCompleted = internalMutation({
  args: handlePasswordResetCompletedArgs,
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return;

    // Increment the reset count (defaulting undefined to 0)
    const currentResetCount = user.passwordResetCount ?? 0;

    // Update user record and clear the reset token
    await ctx.db.patch(args.userId, {
      lastPasswordChangedAt: args.timestamp,
      passwordResetCount: currentResetCount + 1,
      passwordResetToken: undefined,
      passwordResetTokenExpiresAt: undefined,
      updatedAt: args.timestamp,
    });

    // Emit password.reset_completed event
    await emitEvent(ctx, PASSWORD_EVENTS.RESET_COMPLETED, SYSTEM.PASSWORD, {
      userId: args.userId,
    });
  },
});

// ─── recordAdminReset ───────────────────────────────────────────────────────

/**
 * Record that an admin triggered a password reset for another user.
 *
 * Called by the adminResetUserPassword action AFTER it has already:
 *   1. Verified the caller is an Administrator
 *   2. Generated and stored the reset token
 *   3. Queued the reset email via Resend
 *
 * Sets passwordResetRequestedAt on the target user and emits
 * password.reset_requested with isAdminInitiated: true.
 */
export const recordAdminReset = internalMutation({
  args: recordAdminResetArgs,
  handler: async (ctx, args) => {
    const targetUser = await ctx.db.get(args.targetUserId);
    if (!targetUser) return;

    // Update the target user's passwordResetRequestedAt timestamp
    await ctx.db.patch(args.targetUserId, {
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
