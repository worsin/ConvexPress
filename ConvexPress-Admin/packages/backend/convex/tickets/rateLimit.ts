/**
 * Ticket System - Rate Limiting Functions
 *
 * Per-session, per-action rate limiting:
 *   checkAndRecord  - Check if action is allowed, record if so
 *   getStatus       - Get current rate limit status for a session+action
 *   cleanup         - Delete old rate limit records (cron)
 *   getGlobalStats  - Admin stats on rate limit usage
 *
 * Rate limits:
 *   - aiQuery: 5 requests per 1 minute
 *   - ticketCreate: 3 requests per 5 minutes
 *   - search: 10 requests per 10 seconds
 */

import { ConvexError } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { currentUserCan } from "../helpers/permissions";
import {
  checkRateLimitArgs,
  getRateLimitStatusArgs,
  RATE_LIMIT_WINDOWS,
  RATE_LIMIT_MAX,
} from "./validators";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";

type RateLimitAction = keyof typeof RATE_LIMIT_WINDOWS;

// ─── checkAndRecord ─────────────────────────────────────────────────────────

/**
 * Check if a rate-limited action is allowed for the given session.
 * If allowed, records the action and returns { allowed: true }.
 * If denied, returns { allowed: false, retryAfterMs }.
 *
 * This is an atomic check-and-record: the record is only inserted if allowed.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const checkAndRecord = mutation({
  args: checkRateLimitArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
    const now = Date.now();
    const action = args.action as RateLimitAction;
    const windowMs = RATE_LIMIT_WINDOWS[action];
    const maxRequests = RATE_LIMIT_MAX[action];
    const windowStart = now - windowMs;

    // Count recent records for this session + action
    const recentRecords = await ctx.db
      .query("ticket_rateLimits")
      .withIndex("by_session_action", (q: ConvexQueryBuilder) =>
        q.eq("sessionId", args.sessionId).eq("action", args.action),
      )
      .take(100);

    // Filter to records within the current window
    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    const inWindow = recentRecords.filter((r) => r.createdAt >= windowStart);

    if (inWindow.length >= maxRequests) {
      // Rate limited - find when the oldest record in the window expires
      const oldest = inWindow.reduce(
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        (min, r) => (r.createdAt < min ? r.createdAt : min),
        Infinity,
      );
      const retryAfterMs = oldest + windowMs - now;

      return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs) };
    }

    // Allowed - record the action
    await ctx.db.insert("ticket_rateLimits", {
      sessionId: args.sessionId,
      action: args.action,
      userId: args.userId,
      createdAt: now,
    });

    return {
      allowed: true,
      remaining: maxRequests - inWindow.length - 1,
      windowMs,
    };
  },
});

// ─── getStatus ──────────────────────────────────────────────────────────────

/**
 * Get the current rate limit status for a session + action.
 * Does NOT record an action.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getStatus = query({
  args: getRateLimitStatusArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return null;
    const now = Date.now();
    const action = args.action as RateLimitAction;
    const windowMs = RATE_LIMIT_WINDOWS[action];
    const maxRequests = RATE_LIMIT_MAX[action];
    const windowStart = now - windowMs;

    const recentRecords = await ctx.db
      .query("ticket_rateLimits")
      .withIndex("by_session_action", (q: ConvexQueryBuilder) =>
        q.eq("sessionId", args.sessionId).eq("action", args.action),
      )
      .take(100);

    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    const inWindow = recentRecords.filter((r) => r.createdAt >= windowStart);

    return {
      used: inWindow.length,
      remaining: Math.max(0, maxRequests - inWindow.length),
      limit: maxRequests,
      windowMs,
      isLimited: inWindow.length >= maxRequests,
    };
  },
});

// ─── cleanup ────────────────────────────────────────────────────────────────

/**
 * Delete old rate limit records. Called by the cleanup cron.
 * Records older than 1 hour are deleted (well past any rate limit window).
 * Processes in batches.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const cleanup = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { batchSize: v.optional(v.number()) },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
    const batchSize = args.batchSize ?? 500;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    const expired = await ctx.db
      .query("ticket_rateLimits")
      .withIndex("by_created", (q: ConvexQueryBuilder) => q.lt("createdAt", oneHourAgo))
      .take(batchSize);

    for (const record of expired) {
      await ctx.db.delete("ticket_rateLimits", record._id);
    }

    if (expired.length >= batchSize) {
      await ctx.scheduler.runAfter(
        0,
        internal.tickets.rateLimit.cleanup,
        { batchSize },
      );
    }

    return { deleted: expired.length };
  },
});

// ─── getGlobalStats ─────────────────────────────────────────────────────────

/**
 * Admin-only stats on rate limit usage across all sessions.
 * Returns counts per action for the last hour.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getGlobalStats = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return null;
    const canView = await currentUserCan(ctx, "ticket.viewAnalytics");
    if (!canView) return null;

    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    const actions = ["aiQuery", "ticketCreate", "search"] as const;
    const stats: Record<string, { count: number; uniqueSessions: number }> = {};

    for (const action of actions) {
      const records = await ctx.db
        .query("ticket_rateLimits")
        .withIndex("by_action_time", (q: ConvexQueryBuilder) =>
          q.eq("action", action).gte("createdAt", oneHourAgo),
        )
        .take(5000);

      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      const uniqueSessions = new Set(records.map((r) => r.sessionId)).size;
      stats[action] = { count: records.length, uniqueSessions };
    }

    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    return stats;
  },
});
