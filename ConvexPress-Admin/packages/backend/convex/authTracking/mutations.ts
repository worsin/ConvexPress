/**
 * Auth System - Public Mutations
 *
 * Provides auth-related mutations for login/logout tracking, failed login
 * recording, and event emission.
 *
 * These mutations are called by the client AFTER a successful auth event
 * to record the event in Convex and wire it into the Event Dispatcher.
 *
 * Failed login attempts are recorded when the client detects an auth error
 * and calls `recordFailedLogin`.
 *
 * Flow:
 *   1. User authenticates (admin local auth or Clerk)
 *   2. On success: Client calls `recordLogin` mutation
 *   3. On failure: Client calls `recordFailedLogin` mutation
 *   4. Mutation emits the appropriate event into the Event Dispatcher
 *   5. Event Dispatcher processes the event (audit log, notifications, etc.)
 */

import { v } from "convex/values";
import { mutation, type MutationCtx } from "../_generated/server";
import { getCurrentUser } from "../helpers/auth";
import { requireCan } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { AUTH_EVENTS, SYSTEM } from "../events/constants";
import {
  authMethodValidator,
  appIdentifierValidator,
  failureReasonValidator,
} from "./validators";

/**
 * Look up the current user for login tracking.
 *
 * Simplified for dual-auth: uses getCurrentUser() from the permissions helper
 * which handles admin local JWT and Clerk lookups.
 * Users are pre-created (admin) or provisioned via Clerk webhooks (website).
 * This function no longer provisions users on login.
 */
async function getOrCreateCurrentUserForLogin(ctx: MutationCtx) {
  // getCurrentUser handles dual-auth lookup (admin JWT, Clerk)
  const user = await getCurrentUser(ctx);
  return user;
}

// ─── Record Login ────────────────────────────────────────────────────────────

/**
 * Records a successful login event.
 *
 * Called by the client after authentication completes successfully.
 * Updates the user's `lastLoginAt` timestamp and emits an `auth.login` event
 * into the Event Dispatcher system.
 *
 * @param method - Authentication method used ("email", "oauth", "passkey")
 * @param app - Which app the login occurred from ("admin" or "website")
 * @param ip - Optional IP address (from client or server)
 * @param userAgent - Optional user agent string
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const recordLogin = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    method: v.optional(authMethodValidator),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    app: v.optional(appIdentifierValidator),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    ip: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    userAgent: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUserForLogin(ctx);
    if (!user) return null;

    const now = Date.now();

    // Update lastLoginAt timestamp
    await ctx.db.patch("users", user._id, {
      lastLoginAt: now,
      updatedAt: now,
    });

    // Emit auth.login event into the Event Dispatcher
    const eventId = await emitEvent(
      ctx,
      AUTH_EVENTS.LOGIN,
      SYSTEM.AUTH,
      {
        userId: user._id,
        email: user.email,
        method: args.method ?? "unknown",
        app: args.app ?? "unknown",
        ip: args.ip,
        userAgent: args.userAgent,
        loginAt: now,
      },
    );

    return { success: true, userId: user._id, eventId };
  },
});

// ─── Record Logout ───────────────────────────────────────────────────────────

/**
 * Records a logout event.
 *
 * Called by the client on logout to record the event.
 * Emits an `auth.logout` event into the Event Dispatcher system.
 *
 * @param app - Which app the logout occurred from ("admin" or "website")
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const recordLogout = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    app: v.optional(appIdentifierValidator),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    // Emit auth.logout event into the Event Dispatcher
    const eventId = await emitEvent(
      ctx,
      AUTH_EVENTS.LOGOUT,
      SYSTEM.AUTH,
      {
        userId: user._id,
        email: user.email,
        app: args.app ?? "unknown",
        logoutAt: Date.now(),
      },
    );

    return {
      success: true,
      userId: user._id,
      eventId,
    };
  },
});

// ─── Record Failed Login ─────────────────────────────────────────────────────

/**
 * Records a failed login attempt.
 *
 * Called by the client when an authentication error occurs.
 * This does NOT require authentication (the user failed to authenticate).
 *
 * Records the attempt in the failedLoginAttempts table and emits an
 * `auth.login_failed` event into the Event Dispatcher for admin
 * notification and audit logging.
 *
 * @param email - Email address used in the attempt
 * @param reason - Failure reason code
 * @param app - Which app the attempt came from
 * @param ip - Optional IP address
 * @param userAgent - Optional user agent string
 * @param description - Optional human-readable description
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const recordFailedLogin = mutation({
  args: {
    email: v.string(),
    reason: failureReasonValidator,
    app: appIdentifierValidator,
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    ip: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    userAgent: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    description: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // ─── Input Sanitization (CRITICAL-1 fix) ──────────────────────────
    // This mutation is unauthenticated (the user failed to log in).
    // Cap string lengths to prevent data pollution / storage abuse.
    const email = args.email.slice(0, 320); // RFC 5321 max email length
    const ip = args.ip?.slice(0, 45); // IPv6 max length
    const userAgent = args.userAgent?.slice(0, 1000);
    const description = args.description?.slice(0, 500);

    // Basic email format validation - reject obviously invalid inputs
    if (!email.includes("@") || email.length < 3) {
      return { success: false, error: "Invalid email format" };
    }

    const now = Date.now();

    // ─── Rate Limiting (Finding #46 fix) ──────────────────────────────
    // Prevent flooding the failedLoginAttempts table. Reject if >20
    // attempts from the same email or IP in the last 5 minutes.
    const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
    const RATE_LIMIT_MAX = 20;
    const windowStart = now - RATE_LIMIT_WINDOW_MS;

    // Check per-email rate limit
    const recentByEmail = await ctx.db
      .query("failedLoginAttempts")
      .withIndex("by_email", (q: ConvexQueryBuilder) =>
        q.eq("email", email).gt("attemptedAt", windowStart),
      )
      .take(RATE_LIMIT_MAX + 1);

    if (recentByEmail.length > RATE_LIMIT_MAX) {
      return { success: false, error: "Rate limit exceeded" };
    }

    // Check per-IP rate limit (if IP is provided)
    if (ip) {
      const recentByIp = await ctx.db
        .query("failedLoginAttempts")
        .withIndex("by_ip", (q: ConvexQueryBuilder) =>
          q.eq("ip", ip).gt("attemptedAt", windowStart),
        )
        .take(RATE_LIMIT_MAX + 1);

      if (recentByIp.length > RATE_LIMIT_MAX) {
        return { success: false, error: "Rate limit exceeded" };
      }
    }
    // 90-day retention for failed login records (compliance-relevant)
    const expiresAt = now + 90 * 24 * 60 * 60 * 1000;

    // Look up user by email (may not exist if typo / non-existent account)
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q: ConvexQueryBuilder) => q.eq("email", email))
      .first();

    // Insert the failed attempt record
    const attemptId = await ctx.db.insert("failedLoginAttempts", {
      email,
      ip,
      userAgent,
      reason: args.reason,
      description,
      app: args.app,
      userId: user?._id,
      reviewed: false,
      attemptedAt: now,
      expiresAt,
    });

    // Emit auth.login_failed event into the Event Dispatcher
    // Use a try/catch because event emission should not fail the mutation
    try {
      await emitEvent(
        ctx,
        AUTH_EVENTS.LOGIN_FAILED,
        SYSTEM.AUTH,
        {
          email,
          ip,
          reason: args.reason,
          description,
          app: args.app,
          userId: user?._id,
          attemptId,
          attemptedAt: now,
        },
        {
          // No actorId since the user is not authenticated
          actorIp: ip,
        },
      );
    } catch {
      // Event emission failure should not prevent the attempt from being recorded
    }

    return { success: true, attemptId };
  },
});

// ─── Mark Failed Login Reviewed ──────────────────────────────────────────────

/**
 * Marks a failed login attempt as reviewed by an admin.
 *
 * Used in the admin UI to acknowledge/dismiss failed login alerts.
 * Requires admin authentication.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const markFailedLoginReviewed = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    attemptId: v.id("failedLoginAttempts"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // Use capability system instead of legacy isInternal/internalRole check (#51)
    await requireCan(ctx, "audit.view");

    const attempt = await ctx.db.get("failedLoginAttempts", args.attemptId);
    if (!attempt) {
      throw new Error("Failed login attempt not found");
    }

    await ctx.db.patch("failedLoginAttempts", args.attemptId, { reviewed: true });

    return { success: true };
  },
});
