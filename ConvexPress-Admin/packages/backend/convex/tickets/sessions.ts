/**
 * Ticket System - Session Functions
 *
 * Anonymous session management for the support widget:
 *   create          - Create a new session with crypto-random ID
 *   validate        - Check if a session is valid and not expired
 *   touch           - Update lastActivityAt (extends implicit session lifetime)
 *   associateUser   - Link a session to an authenticated user
 *   invalidate      - Explicitly invalidate a session
 *   cleanupExpired  - Delete expired sessions (called by cron)
 *
 * Sessions have a 24-hour TTL. They enable anonymous users to interact
 * with the support widget (search KB, submit AI queries) before logging in.
 * Once the user authenticates, their session is associated with their user ID.
 */

import { ConvexError } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { getCurrentUser } from "../helpers/permissions";
import {
  createSessionArgs,
  validateSessionArgs,
  touchSessionArgs,
  associateUserArgs,
  invalidateSessionArgs,
  SESSION_TTL_MS,
} from "./validators";

// ─── create ─────────────────────────────────────────────────────────────────

/**
 * Create a new session. The sessionId is generated client-side
 * (crypto.randomUUID()) and passed in.
 */
export const create = mutation({
  args: createSessionArgs,
  handler: async (ctx, args) => {
    // Validate sessionId format
    if (!args.sessionId || args.sessionId.length > 64 || args.sessionId.length < 16) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Invalid session ID format" });
    }

    // Check if session already exists
    const existing = await ctx.db
      .query("ticket_sessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .unique();

    if (existing) {
      // Session already exists, just touch it
      const now = Date.now();
      await ctx.db.patch("ticket_sessions", existing._id, {
        lastActivityAt: now,
        expiresAt: now + SESSION_TTL_MS,
      });
      return { sessionId: args.sessionId, isNew: false };
    }

    const now = Date.now();
    await ctx.db.insert("ticket_sessions", {
      sessionId: args.sessionId,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
      lastActivityAt: now,
    });

    return { sessionId: args.sessionId, isNew: true };
  },
});

// ─── validate ───────────────────────────────────────────────────────────────

/**
 * Check if a session is valid (exists and not expired).
 */
export const validate = query({
  args: validateSessionArgs,
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("ticket_sessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .unique();

    if (!session) {
      return { valid: false, reason: "not_found" };
    }

    if (session.expiresAt < Date.now()) {
      return { valid: false, reason: "expired" };
    }

    return {
      valid: true,
      userId: session.userId,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
    };
  },
});

// ─── touch ──────────────────────────────────────────────────────────────────

/**
 * Update lastActivityAt to keep the session alive.
 * Extends the expiry by SESSION_TTL_MS from now.
 */
export const touch = mutation({
  args: touchSessionArgs,
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("ticket_sessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .unique();

    if (!session) return;

    const now = Date.now();
    await ctx.db.patch("ticket_sessions", session._id, {
      lastActivityAt: now,
      expiresAt: now + SESSION_TTL_MS,
    });
  },
});

// ─── associateUser ──────────────────────────────────────────────────────────

/**
 * Link a session to an authenticated user.
 * Called when a widget user logs in after starting a session anonymously.
 */
export const associateUser = mutation({
  args: associateUserArgs,
  handler: async (ctx, args) => {
    // Verify the caller IS the user being associated
    const currentUser = await getCurrentUser(ctx);
    if (!currentUser) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }
    if (currentUser._id !== args.userId) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Cannot associate another user's session" });
    }

    const session = await ctx.db
      .query("ticket_sessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .unique();

    if (!session) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Session not found",
      });
    }

    await ctx.db.patch("ticket_sessions", session._id, {
      userId: args.userId,
      lastActivityAt: Date.now(),
    });
  },
});

// ─── invalidate ─────────────────────────────────────────────────────────────

/**
 * Explicitly invalidate a session (e.g., on logout).
 */
export const invalidate = mutation({
  args: invalidateSessionArgs,
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("ticket_sessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .unique();

    if (!session) return;

    await ctx.db.delete("ticket_sessions", session._id);
  },
});

// ─── cleanupExpired ─────────────────────────────────────────────────────────

/**
 * Delete expired sessions. Called by the daily cleanup cron.
 * Processes in batches to stay within mutation time limits.
 * Reschedules itself if more expired sessions remain.
 */
export const cleanupExpired = internalMutation({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 500;
    const now = Date.now();

    const expired = await ctx.db
      .query("ticket_sessions")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .take(batchSize);

    for (const session of expired) {
      await ctx.db.delete("ticket_sessions", session._id);
    }

    // If we got a full batch, there may be more
    if (expired.length >= batchSize) {
      await ctx.scheduler.runAfter(
        0,
        internal.tickets.sessions.cleanupExpired,
        { batchSize },
      );
    }

    return { deleted: expired.length };
  },
});
