/**
 * Analytics System - Public Mutations
 *
 * Admin-facing mutations for managing analytics data and settings.
 * All mutations require analytics.manage capability (Administrator only).
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireCan } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { purgeArgs, settingsArgs } from "./validators";

// ─── purgeAnalytics ─────────────────────────────────────────────────────────

/**
 * Manually purge analytics data.
 *
 * Destructive action -- the admin UI should show a confirmation dialog.
 * Can purge all data or only data before a specific date.
 *
 * @auth analytics.manage (Administrator only)
 */
export const purgeAnalytics = mutation({
  args: purgeArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "analytics.manage");

    let deletedEvents = 0;
    let deletedRollups = 0;

    if (args.scope === "all") {
      // Delete all pageEvents
      const allEvents = await ctx.db.query("pageEvents").collect();
      for (const event of allEvents) {
        await ctx.db.delete(event._id);
        deletedEvents++;
      }

      // Delete all rollups
      const allRollups = await ctx.db.query("pageAnalyticsDaily").collect();
      for (const rollup of allRollups) {
        await ctx.db.delete(rollup._id);
        deletedRollups++;
      }
    } else if (args.scope === "before_date" && args.beforeDate) {
      // Delete pageEvents before the given date
      const cutoffMs = new Date(args.beforeDate).getTime();
      const events = await ctx.db
        .query("pageEvents")
        .withIndex("by_timestamp", (q) => q.lt("timestamp", cutoffMs))
        .collect();
      for (const event of events) {
        await ctx.db.delete(event._id);
        deletedEvents++;
      }

      // Delete rollups before the given date
      const rollups = await ctx.db
        .query("pageAnalyticsDaily")
        .withIndex("by_date", (q) => q.lt("date", args.beforeDate!))
        .collect();
      for (const rollup of rollups) {
        await ctx.db.delete(rollup._id);
        deletedRollups++;
      }
    }

    // Emit event for audit trail
    await emitEvent(ctx, "analytics.data_purged", "analytics", {
      scope: args.scope,
      beforeDate: args.beforeDate,
      deletedEvents,
      deletedRollups,
      purgedBy: user._id,
    });

    return { deletedEvents, deletedRollups };
  },
});

// ─── updateSettings ─────────────────────────────────────────────────────────

/**
 * Update analytics settings.
 *
 * Settings are stored in the global settings table via the Settings System.
 * This mutation updates the relevant setting keys.
 *
 * @auth analytics.manage (Administrator only)
 */
export const updateSettings = mutation({
  args: settingsArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "analytics.manage");

    const changes: Record<string, unknown> = {};

    // Update each provided setting
    if (args.trackingEnabled !== undefined) {
      const existing = await ctx.db
        .query("settings")
        .withIndex("by_key", (q) => q.eq("key", "analytics_tracking_enabled"))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { value: args.trackingEnabled });
      } else {
        await ctx.db.insert("settings", {
          key: "analytics_tracking_enabled",
          value: args.trackingEnabled,
          group: "analytics",
          label: "Enable Tracking",
          description: "Master switch for analytics tracking",
          type: "boolean",
          isPublic: false,
          isAutoloaded: true,
        });
      }
      changes.trackingEnabled = args.trackingEnabled;
    }

    if (args.respectDoNotTrack !== undefined) {
      const existing = await ctx.db
        .query("settings")
        .withIndex("by_key", (q) => q.eq("key", "analytics_respect_dnt"))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { value: args.respectDoNotTrack });
      } else {
        await ctx.db.insert("settings", {
          key: "analytics_respect_dnt",
          value: args.respectDoNotTrack,
          group: "analytics",
          label: "Respect Do Not Track",
          description: "Honor the browser Do Not Track header",
          type: "boolean",
          isPublic: false,
          isAutoloaded: true,
        });
      }
      changes.respectDoNotTrack = args.respectDoNotTrack;
    }

    if (args.retentionDays !== undefined) {
      const existing = await ctx.db
        .query("settings")
        .withIndex("by_key", (q) =>
          q.eq("key", "analytics_retention_days"),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { value: args.retentionDays });
      } else {
        await ctx.db.insert("settings", {
          key: "analytics_retention_days",
          value: args.retentionDays,
          group: "analytics",
          label: "Data Retention (Days)",
          description: "Days to keep raw tracking events before purging",
          type: "number",
          isPublic: false,
          isAutoloaded: true,
        });
      }
      changes.retentionDays = args.retentionDays;
    }

    // Emit event for audit trail
    if (Object.keys(changes).length > 0) {
      await emitEvent(ctx, "analytics.settings_updated", "analytics", {
        changes,
        updatedBy: user._id,
      });
    }
  },
});
