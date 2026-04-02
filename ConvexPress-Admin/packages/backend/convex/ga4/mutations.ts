/**
 * GA4 Integration System - Mutations
 *
 * Public mutations:
 *   - saveConnectionSettings: store GA4 property ID and service account email
 *   - disconnect: clear GA4 settings and purge all cached data
 *   - clearCache: purge all cached GA4 data (manual refresh)
 *
 * Internal mutation:
 *   - upsertCache: called by actions to store GA4 API responses
 *
 * Settings are stored in the existing Settings System under a dedicated
 * settings document with section "analytics" (shared with the built-in
 * Analytics System settings). GA4-specific keys are prefixed with "ga4".
 *
 * The service account JSON private key is NEVER stored in the database.
 * It must be set as the Convex environment variable GA4_SERVICE_ACCOUNT_JSON.
 */

import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { requireCan } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { upsertCacheArgs, saveConnectionArgs } from "./validators";

// ─── saveConnectionSettings ────────────────────────────────────────────────

/**
 * Save GA4 connection settings after a successful test connection.
 * Stores property ID and service account email in the settings table.
 * Sets ga4Connected to true.
 *
 * @auth analytics.manage (Administrator only)
 */
export const saveConnectionSettings = mutation({
  args: saveConnectionArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "analytics.manage");

    // Validate property ID format
    if (!/^properties\/\d+$/.test(args.propertyId)) {
      throw new Error(
        "Invalid GA4 property ID format. Expected: properties/XXXXXXXXX",
      );
    }

    // Find or create the analytics settings document
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "analytics"))
      .unique();

    const ga4Settings = {
      ga4PropertyId: args.propertyId,
      ga4Connected: true,
      ga4ServiceAccountEmail: args.serviceAccountClientEmail,
      ga4LastSync: null,
      ga4Error: null,
    };

    if (existing) {
      await ctx.db.patch(existing._id, {
        values: { ...((existing.values as Record<string, unknown>) ?? {}), ...ga4Settings },
        updatedAt: Date.now(),
        updatedBy: user._id,
      });
    } else {
      await ctx.db.insert("settings", {
        section: "analytics",
        values: ga4Settings,
        updatedAt: Date.now(),
        updatedBy: user._id,
      });
    }

    // Emit connection event
    await emitEvent(ctx, "ga4.connected", "ga4", {
      propertyId: args.propertyId,
      serviceAccountEmail: args.serviceAccountClientEmail,
      connectedBy: user._id,
    });
  },
});

// ─── disconnect ────────────────────────────────────────────────────────────

/**
 * Disconnect GA4: clear all GA4 settings and purge cached data.
 * After disconnect, dashboards fall back to built-in Analytics System.
 *
 * Note: The admin must manually remove the GA4_SERVICE_ACCOUNT_JSON
 * environment variable via `npx convex env unset GA4_SERVICE_ACCOUNT_JSON`.
 *
 * @auth analytics.manage (Administrator only)
 */
export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireCan(ctx, "analytics.manage");

    // Read current settings to get property ID for event
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "analytics"))
      .unique();

    const values = (existing?.values as Record<string, unknown>) ?? {};
    const propertyId = values.ga4PropertyId as string | undefined;

    // Clear GA4 settings
    if (existing) {
      await ctx.db.patch(existing._id, {
        values: {
          ...values,
          ga4PropertyId: null,
          ga4Connected: false,
          ga4ServiceAccountEmail: null,
          ga4LastSync: null,
          ga4Error: null,
        },
        updatedAt: Date.now(),
        updatedBy: user._id,
      });
    }

    // Purge all cached GA4 data
    const cachedEntries = await ctx.db.query("gaCache").collect();
    for (const entry of cachedEntries) {
      await ctx.db.delete(entry._id);
    }

    // Emit disconnection event
    if (propertyId) {
      await emitEvent(ctx, "ga4.disconnected", "ga4", {
        propertyId,
        disconnectedBy: user._id,
      });
    }
  },
});

// ─── clearCache ────────────────────────────────────────────────────────────

/**
 * Manually clear all cached GA4 data. Forces fresh fetches on next view.
 *
 * @auth analytics.manage (Administrator only)
 */
export const clearCache = mutation({
  args: {},
  handler: async (ctx) => {
    await requireCan(ctx, "analytics.manage");

    const cachedEntries = await ctx.db.query("gaCache").collect();
    for (const entry of cachedEntries) {
      await ctx.db.delete(entry._id);
    }

    return { purged: cachedEntries.length };
  },
});

// ─── upsertCache (internal) ───────────────────────────────────────────────

/**
 * Upsert a GA4 cache entry. Called from actions after fetching from GA4 API.
 * If an entry with the same propertyId + queryHash exists, it is replaced.
 * Otherwise, a new entry is inserted.
 *
 * Sets fetchedAt to now and expiresAt to now + 1 hour (3,600,000ms).
 *
 * @internal -- not client-callable
 */
export const upsertCache = internalMutation({
  args: upsertCacheArgs,
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check for existing entry with same hash
    const existing = await ctx.db
      .query("gaCache")
      .withIndex("by_hash", (q) =>
        q.eq("propertyId", args.propertyId).eq("queryHash", args.queryHash),
      )
      .unique();

    const entry = {
      propertyId: args.propertyId,
      queryHash: args.queryHash,
      dateRange: args.dateRange,
      queryType: args.queryType,
      path: args.path,
      data: args.data,
      fetchedAt: now,
      expiresAt: now + 3_600_000, // 1 hour TTL
    };

    if (existing) {
      await ctx.db.replace(existing._id, entry);
    } else {
      await ctx.db.insert("gaCache", entry);
    }
  },
});
