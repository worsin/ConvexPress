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
export const getAdminAndTargetUser = internalQuery({
  args: {
    callerId: v.id("users"),
    targetUserId: v.id("users"),
  },
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
            workosUserId: target.workosUserId,
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
export const recordFailedAttempt = internalMutation({
  args: {
    identifier: v.string(),
    ip: v.string(),
    reason: v.union(
      v.literal("invalid_credentials"),
      v.literal("account_locked"),
      v.literal("account_deactivated"),
      v.literal("account_banned"),
      v.literal("mfa_failed"),
      v.literal("rate_limited"),
      v.literal("unknown"),
    ),
    app: v.union(v.literal("admin"), v.literal("website"), v.literal("unknown")),
  },
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
export const recordSuccessfulLogin = internalMutation({
  args: {
    userId: v.id("users"),
    app: v.union(
      v.literal("admin"),
      v.literal("website"),
      v.literal("unknown"),
    ),
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      lastLoginAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
