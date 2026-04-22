/**
 * Content Editor System - Internal Functions
 *
 * Non-client-callable functions used by:
 *   - Convex scheduled functions (cron-like cleanup)
 *   - Other system internals (cross-system calls)
 *
 * Functions:
 *   cleanupExpiredLocks  - Remove edit locks that have expired (2+ minutes without heartbeat)
 *   incrementUsageCount  - Update reusable block usage count when inserted/removed from posts
 */

import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { incrementUsageCountArgs } from "./validators";

// ─── Cleanup Expired Locks ──────────────────────────────────────────────────

/**
 * Remove all expired edit locks.
 *
 * Edit locks expire after 2 minutes without a heartbeat renewal.
 * This function is intended to be called periodically (e.g., every 5 minutes
 * via a Convex cron job) to clean up stale locks from users who:
 *   - Closed their browser without navigating away cleanly
 *   - Lost network connectivity
 *   - Experienced a browser crash
 *
 * The lock expiry mechanism works in two layers:
 *   1. Real-time: getLock query returns null for expired locks (client-side check)
 *   2. Cleanup: This cron job deletes expired lock records from the database
 *
 * This ensures that expired locks don't accumulate in the database even if
 * no one queries for them.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const cleanupExpiredLocks = internalMutation({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    const now = Date.now();

    // Use the by_expiresAt index to efficiently query only expired locks
    // (those with expiresAt less than the current time).
    const expiredLocks = await ctx.db
      .query("editorLocks")
      .withIndex("by_expiresAt", (q: ConvexQueryBuilder) => q.lt("expiresAt", now))
      .collect();

    let cleaned = 0;

    for (const lock of expiredLocks) {
      await ctx.db.delete("editorLocks", lock._id);
      cleaned++;
    }

    return { cleaned };
  },
});

// ─── Increment Usage Count ──────────────────────────────────────────────────

/**
 * Update the denormalized usage count on a reusable block.
 *
 * Called when:
 *   - A reusable block is inserted into a post (+1)
 *   - A reusable block reference is removed from a post (-1)
 *   - A post containing reusable block references is deleted (-N)
 *
 * The delta can be positive or negative. The count is clamped to
 * a minimum of 0 to prevent negative counts from race conditions.
 *
 * This is an internal function because usage tracking is managed by
 * the editor frontend/post save pipeline, not by direct user action.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const incrementUsageCount = internalMutation({
  args: incrementUsageCountArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const block = await ctx.db.get("reusableBlocks", args.blockId);
    if (!block) return; // Block was deleted, nothing to update

    const newCount = Math.max(0, block.usageCount + args.delta);

    await ctx.db.patch("reusableBlocks", args.blockId, {
      usageCount: newCount,
      updatedAt: Date.now(),
    });

    return { usageCount: newCount };
  },
});
