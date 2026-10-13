/** Authenticated edit-lock queries. Legacy reusable sources use explicit import review. */
import { ConvexError } from "convex/values";
import { query } from "../_generated/server";
import type { RegisteredQuery } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getCurrentUser } from "../helpers/permissions";
import { getLockArgs } from "./validators";

import { v } from "convex/values";
// ─── Get Lock ───────────────────────────────────────────────────────────────

/**
 * Check if a post is currently locked and by whom.
 *
 * Used by the editor UI to show "This post is being edited by {user}"
 * warning when opening a post that has an active lock.
 *
 * Returns null if the post is not locked (or lock has expired).
 * Expired locks are returned as null (the cleanup cron will delete them).
 */
export const getLock: RegisteredQuery<"public", { postId: Id<"posts"> }, (Pick<Doc<"editorLocks">, "postId" | "userId" | "userDisplayName" | "lockedAt" | "expiresAt"> & { isCurrentUser: boolean }) | null> = query({
  args: getLockArgs,
  returns: v.union(v.null(), v.object({
    postId: v.id("posts"),
    userId: v.id("users"),
    userDisplayName: v.string(),
    lockedAt: v.number(),
    expiresAt: v.number(),
    isCurrentUser: v.boolean(),
  })),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const lock = await ctx.db
      .query("editorLocks")
      .withIndex("by_postId", (q) => q.eq("postId", args.postId))
      .first();

    if (!lock) return null;

    // Check if expired
    const now = Date.now();
    if (lock.expiresAt <= now) {
      // Lock has expired but hasn't been cleaned up yet
      return null;
    }

    return {
      postId: lock.postId,
      userId: lock.userId,
      userDisplayName: lock.userDisplayName,
      lockedAt: lock.lockedAt,
      expiresAt: lock.expiresAt,
      isCurrentUser: lock.userId === user._id,
    };
  },
});

// ─── Get My Locks ───────────────────────────────────────────────────────────

/**
 * Get all locks held by the current user.
 *
 * Used for cleanup on page unload (beforeunload event) to release
 * any locks the user holds before navigating away.
 *
 * Returns only non-expired locks.
 */
export const getMyLocks = query({
  args: {},
  returns: v.array(v.object({ postId: v.id("posts"), lockedAt: v.number(), expiresAt: v.number() })),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const locks = await ctx.db
      .query("editorLocks")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const now = Date.now();

    // Filter out expired locks
    return locks
      .filter((lock) => lock.expiresAt > now)
      .map((lock) => ({
        postId: lock.postId,
        lockedAt: lock.lockedAt,
        expiresAt: lock.expiresAt,
      }));
  },
});
