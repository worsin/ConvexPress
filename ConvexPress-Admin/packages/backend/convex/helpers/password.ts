/**
 * Password Management System - Helper Functions
 *
 * Shared helper functions used across the password system.
 *
 * Functions:
 *   getPasswordResetSettings - Read password-related settings with defaults
 *
 * These are pure functions and database helpers (not Convex function definitions).
 * They are imported by mutations, queries, and internals.
 */

import type { QueryCtx } from "../_generated/server";
import { PASSWORD_SETTINGS_DEFAULTS } from "../password/validators";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PasswordResetSettings {
  /** Send password reset email. */
  sendPasswordResetEmail: boolean;
  /** Send confirmation email when password changes. */
  sendPasswordChangedEmail: boolean;
  /** Send admin notification when any user resets password. */
  notifyAdminOnPasswordReset: boolean;
}

type ReadCtx = Pick<QueryCtx, "db">;

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
  ctx: ReadCtx,
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
