/** Retained cron cleanup for expired editor locks. */
import { internalMutation } from "../_generated/server";

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
