/** Retained cron cleanup for expired editor locks. */
import { internalMutation } from "../_generated/server";

import { v } from "convex/values";
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
export const cleanupExpiredLocks = internalMutation({
  args: {},
  returns: v.object({ cleaned: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();

    // Use the by_expiresAt index to efficiently query only expired locks
    // (those with expiresAt less than the current time).
    const expiredLocks = await ctx.db
      .query("editorLocks")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .collect();

    let cleaned = 0;

    for (const lock of expiredLocks) {
      await ctx.db.delete("editorLocks", lock._id);
      cleaned++;
    }

    return { cleaned };
  },
});
