/**
 * Auth System - Shared Validators
 *
 * Reusable argument validators for auth system functions.
 */

import { v } from "convex/values";

/**
 * Valid authentication methods.
 */
export const authMethodValidator = v.union(
  v.literal("email"),
  v.literal("oauth"),
  v.literal("passkey"),
  v.literal("unknown"),
);

/**
 * Valid app identifiers for login/logout tracking.
 */
export const appIdentifierValidator = v.union(
  v.literal("admin"),
  v.literal("website"),
  v.literal("unknown"),
);

/**
 * Valid failure reason codes for failed login attempts.
 */
export const failureReasonValidator = v.union(
  v.literal("invalid_credentials"),
  v.literal("account_locked"),
  v.literal("account_deactivated"),
  v.literal("account_banned"),
  v.literal("mfa_failed"),
  v.literal("rate_limited"),
  v.literal("unknown"),
);

/**
 * Login tracking arguments.
 */
export const recordLoginArgs = {
  method: v.optional(authMethodValidator),
  app: v.optional(appIdentifierValidator),
  ip: v.optional(v.string()),
  userAgent: v.optional(v.string()),
};

/**
 * Logout tracking arguments.
 */
export const recordLogoutArgs = {
  app: v.optional(appIdentifierValidator),
};

/**
 * Failed login recording arguments.
 */
export const recordFailedLoginArgs = {
  email: v.string(),
  reason: failureReasonValidator,
  app: appIdentifierValidator,
  ip: v.optional(v.string()),
  userAgent: v.optional(v.string()),
  description: v.optional(v.string()),
};
