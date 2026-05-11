/**
 * Auth System - Shared Validators
 *
 * Reusable argument validators for auth system functions.
 */

import { v } from "convex/values";

/**
 * Valid authentication methods.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const authMethodValidator = v.union(
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("email"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("oauth"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("passkey"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("unknown"),
);

/**
 * Valid app identifiers for login/logout tracking.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const appIdentifierValidator = v.union(
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("admin"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("website"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("unknown"),
);

/**
 * Valid failure reason codes for failed login attempts.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const failureReasonValidator = v.union(
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("invalid_credentials"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("account_locked"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("account_deactivated"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("account_banned"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("mfa_failed"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("rate_limited"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("unknown"),
);

/**
 * Login tracking arguments.
 */
export const recordLoginArgs = {
  method: v.optional(authMethodValidator),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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
