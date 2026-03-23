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

// ─── Password Settings Defaults ─────────────────────────────────────────────
// Used when the Settings System hasn't been implemented or has no overrides.

export const PASSWORD_SETTINGS_DEFAULTS = {
  /** Send SmithHarper-branded reset email in addition to WorkOS's. */
  sendPasswordResetEmail: false,
  /** Send confirmation email when password changes. */
  sendPasswordChangedEmail: true,
  /** Send admin notification when any user resets password. */
  notifyAdminOnPasswordReset: false,
};

// ─── Internal Mutation Args ─────────────────────────────────────────────────

/**
 * Arguments for recordResetRequest (internal mutation).
 * Called from server action when user submits forgot-password form.
 */
export const recordResetRequestArgs = {
  email: v.string(),
  /** Optional reset URL from WorkOS response, included in event payload for email template. */
  resetUrl: v.optional(v.string()),
};

/**
 * Arguments for handlePasswordChanged (internal mutation).
 * Called from WorkOS webhook handler when a profile password change is detected.
 */
export const handlePasswordChangedArgs = {
  userId: v.id("users"),
  workosId: v.string(),
  timestamp: v.number(),
};

/**
 * Arguments for handlePasswordResetCompleted (internal mutation).
 * Called from WorkOS webhook handler when a reset completion is detected.
 */
export const handlePasswordResetCompletedArgs = {
  userId: v.id("users"),
  workosId: v.string(),
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
 * Admin triggers a password reset for another user via WorkOS API.
 */
export const adminResetUserPasswordArgs = {
  targetUserId: v.id("users"),
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
