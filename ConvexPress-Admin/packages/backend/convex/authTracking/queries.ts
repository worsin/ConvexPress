/**
 * Auth System - Public Queries
 *
 * Provides auth-related queries used by both the admin and website apps.
 * These are the canonical auth queries - they were originally in users.ts
 * and are re-exported here as the proper system module location.
 *
 * NOTE: The queries in users.ts (getCurrentUser, checkAdminAccess, hasAnyAdmin)
 * remain as the primary entry points for backward compatibility. This module
 * provides additional auth-specific queries including:
 *   - getAuthInfo: Lightweight auth state check
 *   - getLoginHistory: Recent login events for the current user
 *   - getFailedLoginAttempts: Admin query for failed login log
 *   - getFailedLoginCountForUser: Count of recent failures for a user
 *   - getSecurityOverview: Combined login history + failed attempts for user dashboard
 */

import { v } from "convex/values";
import { query } from "../_generated/server";
import { getCurrentUser, currentUserCan, getUserIdentifier } from "../helpers/permissions";

// ─── Get Current User's Auth Info ────────────────────────────────────────────

/**
 * Returns the current user's authentication info and session state.
 * Lighter than getCurrentUser - returns only auth-relevant fields.
 *
 * Used by: Website header, admin bar, auth state checks.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getAuthInfo = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    return {
      id: user._id,
      email: user.email,
      emailVerified: user.emailVerified,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      profilePictureUrl: user.profilePictureUrl,
      isInternal: user.isInternal,
      internalRole: user.internalRole,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
    };
  },
});

// ─── Get Login History ───────────────────────────────────────────────────────

/**
 * Returns recent login events for the current user.
 * Queries the events table for auth.login events matching the user's actor ID.
 *
 * Used by: Website user dashboard, admin user profile page.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getLoginHistory = query({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    limit: v.optional(v.number()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const limit = args.limit ?? 10;

    // Query events table for auth.login events by this user using compound index
    const userEvents = await ctx.db
      .query("events")
      .withIndex("by_code_and_actor", (q: ConvexQueryBuilder) =>
        q.eq("code", "auth.login").eq("actorId", getUserIdentifier(user)),
      )
      .order("desc")
      .take(limit);

    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    return userEvents.map((event) => {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(event.payload) as Record<string, unknown>;
      } catch {
        // Invalid JSON, use empty payload
      }

      return {
        id: event._id,
        timestamp: event.emittedAt,
        ip: (payload.ip as string) ?? undefined,
        userAgent: (payload.userAgent as string) ?? undefined,
        method: (payload.method as string) ?? undefined,
        app: (payload.app as string) ?? undefined,
      };
    });
  },
});

// ─── Get Failed Login Attempts (Admin) ──────────────────────────────────────

/**
 * Returns failed login attempts for the admin dashboard.
 * Requires admin access.
 *
 * Can filter by email, reviewed status, and time range.
 * Used by: Admin Tools > Security / Failed Logins page.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getFailedLoginAttempts = query({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    limit: v.optional(v.number()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    onlyUnreviewed: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    email: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // Use capability system instead of legacy isInternal/internalRole check (#52)
    const canView = await currentUserCan(ctx, "audit.view");
    if (!canView) {
      return [];
    }

    const limit = args.limit ?? 50;

    let attempts;
    if (args.onlyUnreviewed) {
      attempts = await ctx.db
        .query("failedLoginAttempts")
        .withIndex("by_reviewed", (q: ConvexQueryBuilder) => q.eq("reviewed", false))
        .order("desc")
        .take(limit);
    } else if (args.email) {
      attempts = await ctx.db
        .query("failedLoginAttempts")
        .withIndex("by_email", (q: ConvexQueryBuilder) => q.eq("email", args.email!))
        .order("desc")
        .take(limit);
    } else {
      attempts = await ctx.db
        .query("failedLoginAttempts")
        .withIndex("by_attemptedAt")
        .order("desc")
        .take(limit);
    }

    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    return attempts.map((a) => ({
      id: a._id,
      email: a.email,
      ip: a.ip,
      userAgent: a.userAgent,
      reason: a.reason,
      description: a.description,
      app: a.app,
      userId: a.userId,
      reviewed: a.reviewed,
      attemptedAt: a.attemptedAt,
    }));
  },
});

// ─── Get Unreviewed Failed Login Count (Admin) ──────────────────────────────

/**
 * Returns the count of unreviewed failed login attempts.
 * Used for badge display in admin sidebar/toolbar.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getUnreviewedFailedLoginCount = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    // Use capability system instead of legacy isInternal/internalRole check (#52)
    const canView = await currentUserCan(ctx, "audit.view");
    if (!canView) {
      return { count: 0 };
    }

    // Use .take(1001) to bound the query, with truncation indication
    const maxCount = 1000;
    const unreviewed = await ctx.db
      .query("failedLoginAttempts")
      .withIndex("by_reviewed", (q: ConvexQueryBuilder) => q.eq("reviewed", false))
      .take(maxCount + 1);

    const isTruncated = unreviewed.length > maxCount;
    return {
      count: isTruncated ? maxCount : unreviewed.length,
      isTruncated,
    };
  },
});

// ─── Get Security Overview (User Dashboard) ─────────────────────────────────

/**
 * Returns a combined security overview for the current user's dashboard.
 * Includes both successful login history and any failed attempts against
 * the user's email address.
 *
 * Used by: Website User Dashboard > Security page.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getSecurityOverview = query({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    loginLimit: v.optional(v.number()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    failedLimit: v.optional(v.number()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const loginLimit = args.loginLimit ?? 20;
    const failedLimit = args.failedLimit ?? 10;

    // ─── Successful Logins ─────────────────────────────────────────────
    const userLoginEvents = await ctx.db
      .query("events")
      .withIndex("by_code_and_actor", (q: ConvexQueryBuilder) =>
        q.eq("code", "auth.login").eq("actorId", getUserIdentifier(user)),
      )
      .order("desc")
      .take(loginLimit);

    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    const logins = userLoginEvents.map((event) => {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(event.payload) as Record<string, unknown>;
      } catch {
        // Invalid JSON
      }

      return {
        id: event._id,
        type: "login" as const,
        timestamp: event.emittedAt,
        ip: (payload.ip as string) ?? undefined,
        userAgent: (payload.userAgent as string) ?? undefined,
        method: (payload.method as string) ?? undefined,
        app: (payload.app as string) ?? undefined,
      };
    });

    // ─── Failed Attempts Against This Email ────────────────────────────
    const failedAttempts = await ctx.db
      .query("failedLoginAttempts")
      .withIndex("by_email", (q: ConvexQueryBuilder) => q.eq("email", user.email))
      .order("desc")
      .take(failedLimit);

    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    const failures = failedAttempts.map((a) => ({
      id: a._id,
      type: "failed" as const,
      timestamp: a.attemptedAt,
      ip: a.ip,
      userAgent: a.userAgent,
      reason: a.reason,
      description: a.description,
      app: a.app,
    }));

    return {
      logins,
      failures,
      totalLogins: userLoginEvents.length,
      totalFailures: failedAttempts.length,
      lastLoginAt: user.lastLoginAt ?? null,
      email: user.email,
      createdAt: user.createdAt,
    };
  },
});
