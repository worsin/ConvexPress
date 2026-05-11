/**
 * Auth System - Internal Functions
 *
 * Internal (non-client-callable) functions for the auth tracking system.
 * Used by actions and other internal processes.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

// ─── Get Admin and Target User (Internal) ───────────────────────────────────

/**
 * Internal query used by the getImpersonationUrl action to verify admin
 * status and fetch the target user data in a single query.
 *
 * Actions cannot directly access ctx.db, so this internal query provides
 * the data the action needs.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getAdminAndTargetUser = internalQuery({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    callerId: v.id("users"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    targetUserId: v.id("users"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // Look up the calling user by Convex ID
    const caller = await ctx.db.get(args.callerId);

    // Look up the target user
    const target = await ctx.db.get(args.targetUserId);

    return {
      caller: caller
        ? {
            isInternal: caller.isInternal ?? false,
            internalRole: caller.internalRole ?? "",
            email: caller.email,
            roleId: caller.roleId,
          }
        : null,
      target: target
        ? {
            _id: target._id,
            clerkUserId: target.clerkUserId,
            email: target.email,
            status: target.status,
            displayName: target.displayName,
          }
        : null,
    };
  },
});

// ─── Login Tracking ───────────────────────────────────────────────────────────

/**
 * Record a failed login attempt in the failedLoginAttempts table.
 * Used for rate limiting detection and admin audit visibility.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const recordFailedAttempt = internalMutation({
  args: {
    identifier: v.string(),
    ip: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    reason: v.union(
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
    ),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    app: v.union(v.literal("admin"), v.literal("website"), v.literal("unknown")),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const now = Date.now();
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;

    await ctx.db.insert("failedLoginAttempts", {
      email: args.identifier,
      ip: args.ip,
      reason: args.reason,
      app: args.app,
      reviewed: false,
      attemptedAt: now,
      expiresAt: now + ninetyDays,
    });
  },
});

/**
 * Record a successful login by updating the user's lastLoginAt timestamp.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const recordSuccessfulLogin = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    userId: v.id("users"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    app: v.union(
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("admin"),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("website"),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("unknown"),
    ),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    ip: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    userAgent: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      lastLoginAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
