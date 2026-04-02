/**
 * GA4 Integration System - Internal Functions
 *
 * Internal mutations for cache maintenance:
 *   - deleteExpiredEntries: purge expired gaCache entries (cron job)
 *   - purgeAllCache: delete all cache for a property (disconnect flow)
 *   - updateLastSync: update ga4LastSync timestamp after successful fetch
 *   - setError: store GA4 API error message in settings
 *
 * These are called by actions and cron jobs, not by the client.
 */

import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

// ─── deleteExpiredEntries ──────────────────────────────────────────────────

/**
 * Purge expired cache entries from the gaCache table.
 * Queries entries where expiresAt < now and deletes in batches of 100.
 *
 * Scheduled via hourly cron job.
 */
export const deleteExpiredEntries = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Query expired entries using the by_expiry index
    const expired = await ctx.db
      .query("gaCache")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", now))
      .take(100);

    for (const entry of expired) {
      await ctx.db.delete(entry._id);
    }

    return { deleted: expired.length };
  },
});

// ─── purgeAllCache ─────────────────────────────────────────────────────────

/**
 * Delete all gaCache entries for a specific property.
 * Called when disconnecting GA4.
 */
export const purgeAllCache = internalMutation({
  args: { propertyId: v.string() },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("gaCache")
      .withIndex("by_hash", (q) => q.eq("propertyId", args.propertyId))
      .collect();

    for (const entry of entries) {
      await ctx.db.delete(entry._id);
    }

    return { deleted: entries.length };
  },
});

// ─── updateLastSync ────────────────────────────────────────────────────────

/**
 * Update the ga4LastSync timestamp in settings after a successful GA4 fetch.
 * Also clears any previous error.
 */
export const updateLastSync = internalMutation({
  args: { propertyId: v.string() },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "analytics"))
      .unique();

    if (settings) {
      const values = (settings.values as Record<string, unknown>) ?? {};
      // Only update if this is still the active property
      if (values.ga4PropertyId === args.propertyId) {
        await ctx.db.patch(settings._id, {
          values: {
            ...values,
            ga4LastSync: Date.now(),
            ga4Error: null,
          },
        });
      }
    }
  },
});

// ─── setError ──────────────────────────────────────────────────────────────

/**
 * Store a GA4 API error message in settings.
 * Used by actions when a GA4 fetch fails.
 */
export const setError = internalMutation({
  args: { error: v.string() },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "analytics"))
      .unique();

    if (settings) {
      const values = (settings.values as Record<string, unknown>) ?? {};
      await ctx.db.patch(settings._id, {
        values: {
          ...values,
          ga4Error: args.error,
        },
      });
    }
  },
});
