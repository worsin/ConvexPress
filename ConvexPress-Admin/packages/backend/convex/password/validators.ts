/**
 * Password Management System - Shared Argument Validators
 *
 * Reusable Convex argument validators for password mutations and queries.
 * Centralizes validation logic so mutations and queries stay clean.
 *
 * Convention: each exported object is an args shape (Record<string, Validator>)
 * ready to spread into a Convex function's `args` field.
 */

import { v } from "convex/values";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Reset request heuristic window: 1 hour (in milliseconds). */
export const RESET_HEURISTIC_WINDOW_MS = 60 * 60 * 1000;

/** Minimum time between public reset emails for the same account. */
export const RESET_REQUEST_COOLDOWN_MS = 10 * 60 * 1000;

// ─── Password Settings Defaults ─────────────────────────────────────────────
// Used when the Settings System hasn't been implemented or has no overrides.

export const PASSWORD_SETTINGS_DEFAULTS = {
  /** Send password reset email via Resend when a reset is requested. */
  sendPasswordResetEmail: true,
  /** Send confirmation email when password changes. */
  sendPasswordChangedEmail: true,
  /** Send admin notification when any user resets password. */
  notifyAdminOnPasswordReset: false,
};

// ─── Internal Mutation Args ─────────────────────────────────────────────────

/**
 * Arguments for recordResetRequest (internal mutation).
 * Called from server action when user submits forgot-password form.
 * Includes the hashed token and reset URL for email delivery.
 */
export const recordResetRequestArgs = {
  email: v.string(),
  /** SHA-256 hash of the reset token (stored on user record). */
  tokenHash: v.string(),
  /** Unix timestamp (ms) when the token expires. */
  tokenExpiresAt: v.number(),
  /** Full reset URL to include in the email. */
  resetUrl: v.string(),
};

/**
 * Arguments for storeResetToken (internal mutation).
 * Called from admin-initiated reset flow where we already have the userId.
 */
export const storeResetTokenArgs = {
  userId: v.id("users"),
  /** SHA-256 hash of the reset token. */
  tokenHash: v.string(),
  /** Unix timestamp (ms) when the token expires. */
  tokenExpiresAt: v.number(),
  /** Full reset URL to include in the email. */
  resetUrl: v.string(),
};

/**
 * Arguments for handlePasswordChanged (internal mutation).
 * Called when a profile password change is detected.
 */
export const handlePasswordChangedArgs = {
  userId: v.id("users"),
  timestamp: v.number(),
};

/**
 * Arguments for handlePasswordResetCompleted (internal mutation).
 * Called when a reset completion is detected.
 */
export const handlePasswordResetCompletedArgs = {
  userId: v.id("users"),
  timestamp: v.number(),
};

/**
 * Arguments for recordAdminReset (internal mutation).
 * Called by adminResetUserPassword action after it verifies admin auth.
 */
export const recordAdminResetArgs = {
  targetUserId: v.id("users"),
  adminId: v.id("users"),
  timestamp: v.number(),
};

// ─── Action Args ────────────────────────────────────────────────────────────

/**
 * Arguments for adminResetUserPassword (public action).
 * Admin triggers a password reset for another user.
 */
export const adminResetUserPasswordArgs = {
  targetUserId: v.id("users"),
};

/**
 * Arguments for completePasswordReset (public action).
 * Called from the reset-password page when the user submits a new password.
 * The email + token identify and verify the request; newPassword is the replacement.
 */
export const completePasswordResetArgs = {
  email: v.string(),
  /** Raw token from the reset URL (will be hashed server-side for verification). */
  token: v.string(),
  /** The new password to set. */
  newPassword: v.string(),
};

// ─── Query Args ─────────────────────────────────────────────────────────────

/**
 * Arguments for getPasswordStatus (public query).
 * If userId is omitted, returns the current user's own status.
 * If userId is provided, requires Administrator role.
 */
export const getPasswordStatusArgs = {
  userId: v.optional(v.id("users")),
};
