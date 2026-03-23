/**
 * Password Management System - Helper Functions
 *
 * Shared helper functions used across the password system.
 *
 * Functions:
 *   detectPasswordChange     - Heuristic to detect password changes from WorkOS webhooks
 *   getPasswordResetSettings - Read password-related settings with defaults
 *
 * These are pure functions and database helpers (not Convex function definitions).
 * They are imported by mutations, queries, and the webhook handler.
 */

import type { QueryCtx, MutationCtx } from "../_generated/server";
import { PASSWORD_SETTINGS_DEFAULTS } from "../password/validators";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PasswordResetSettings {
  /** Send SmithHarper-branded reset email in addition to WorkOS's. */
  sendPasswordResetEmail: boolean;
  /** Send confirmation email when password changes. */
  sendPasswordChangedEmail: boolean;
  /** Send admin notification when any user resets password. */
  notifyAdminOnPasswordReset: boolean;
}

export interface WorkOSUserPayload {
  /** WorkOS user ID */
  id: string;
  /** User email */
  email?: string;
  /** First name */
  first_name?: string;
  /** Last name */
  last_name?: string;
  /** Whether the user has a password set (vs OAuth-only) */
  password_enabled?: boolean;
  /** ISO timestamp of last profile update */
  updated_at?: string;
  /** ISO timestamp of last password change (if exposed by WorkOS) */
  password_changed_at?: string;
}

// ─── detectPasswordChange ───────────────────────────────────────────────────

/**
 * Tri-state result from password change detection.
 *
 * - "confirmed": Payload fields prove this IS a password change.
 * - "denied": Payload fields prove this is NOT a password change
 *   (password_enabled and password_changed_at are present but unchanged).
 * - "inconclusive": Payload lacks the password-specific fields,
 *   so we cannot tell from the payload alone.
 */
export type PasswordChangeDetection = "confirmed" | "denied" | "inconclusive";

/**
 * Heuristic to detect whether a WorkOS `user.updated` webhook payload
 * indicates a password change.
 *
 * WorkOS does NOT fire a dedicated "password changed" webhook. We use
 * multiple heuristics to identify password-specific updates:
 *
 *   1. If the payload includes `password_changed_at` and it differs from
 *      what we have stored, it's a password change -> "confirmed".
 *   2. If `password_enabled` changed from false to true, the user added
 *      a password (OAuth user setting up email/password login) -> "confirmed".
 *   3. If the payload includes password-specific fields and they did NOT
 *      change, this is NOT a password change -> "denied".
 *   4. Otherwise, we cannot be certain -> "inconclusive".
 *
 * When "inconclusive", the webhook handler should fall back to the
 * timestamp-based heuristic (detectAndHandlePasswordChange internal mutation).
 * When "denied", the webhook handler should SKIP password handling entirely
 * to avoid false positive password change events.
 *
 * @param currentPayload - The WorkOS webhook payload for the updated user
 * @param previousData - Optional previous state for comparison
 * @returns "confirmed" | "denied" | "inconclusive"
 */
export function detectPasswordChange(
  currentPayload: WorkOSUserPayload,
  previousData?: { passwordEnabled?: boolean; passwordChangedAt?: string },
): PasswordChangeDetection {
  // Heuristic 1: password_changed_at field changed
  if (
    currentPayload.password_changed_at &&
    previousData?.passwordChangedAt &&
    currentPayload.password_changed_at !== previousData.passwordChangedAt
  ) {
    return "confirmed";
  }

  // Heuristic 2: password_enabled changed from false to true
  if (
    currentPayload.password_enabled === true &&
    previousData?.passwordEnabled === false
  ) {
    return "confirmed";
  }

  // Heuristic 3: If we have password-specific fields in the payload AND
  // they match our stored values, this update is NOT password-related.
  // This prevents false positives when a user changes their name/email.
  const hasPasswordFields =
    currentPayload.password_changed_at !== undefined ||
    currentPayload.password_enabled !== undefined;

  if (hasPasswordFields && previousData) {
    const passwordChangedAtSame =
      currentPayload.password_changed_at === undefined ||
      currentPayload.password_changed_at === previousData.passwordChangedAt;

    const passwordEnabledSame =
      currentPayload.password_enabled === undefined ||
      currentPayload.password_enabled === previousData.passwordEnabled;

    if (passwordChangedAtSame && passwordEnabledSame) {
      return "denied";
    }
  }

  // Cannot determine from payload alone
  return "inconclusive";
}

// ─── getPasswordResetSettings ───────────────────────────────────────────────

/**
 * Read password-related settings from the Settings System.
 *
 * Gracefully degrades if the Settings System is not yet implemented
 * or if the settings don't exist yet -- returns defaults.
 *
 * Password email settings are stored in the "email" section of the
 * settings table, as defined in the PRD and knowledge document.
 *
 * @param ctx - Query or mutation context
 * @returns Password-related settings with defaults applied
 */
export async function getPasswordResetSettings(
  ctx: QueryCtx | MutationCtx,
): Promise<PasswordResetSettings> {
  try {
    // Read from the "email" section (where password email settings live per PRD)
    const emailSettings = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "email"))
      .unique();

    if (emailSettings && emailSettings.values) {
      const values = emailSettings.values as Record<string, unknown>;
      return {
        sendPasswordResetEmail:
          typeof values.sendPasswordResetEmail === "boolean"
            ? values.sendPasswordResetEmail
            : PASSWORD_SETTINGS_DEFAULTS.sendPasswordResetEmail,
        sendPasswordChangedEmail:
          typeof values.sendPasswordChangedEmail === "boolean"
            ? values.sendPasswordChangedEmail
            : PASSWORD_SETTINGS_DEFAULTS.sendPasswordChangedEmail,
        notifyAdminOnPasswordReset:
          typeof values.notifyAdminOnPasswordReset === "boolean"
            ? values.notifyAdminOnPasswordReset
            : PASSWORD_SETTINGS_DEFAULTS.notifyAdminOnPasswordReset,
      };
    }
  } catch {
    // Settings table may not exist yet during incremental development
  }

  return { ...PASSWORD_SETTINGS_DEFAULTS };
}
