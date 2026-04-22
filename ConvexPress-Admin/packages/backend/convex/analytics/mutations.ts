/**
 * Analytics System - Public Mutations
 *
 * Admin-facing mutations for managing analytics data and settings.
 * All mutations require analytics.manage capability (Administrator only).
 */

import { mutation } from "../_generated/server";
import { ConvexError } from "convex/values";
import { requireCan } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { purgeArgs, settingsArgs } from "./validators";
import { getDefaults } from "../settings/defaults";
import { computeChanges } from "../settings/helpers";

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

    if (
      args.retentionDays !== undefined &&
      (!Number.isInteger(args.retentionDays) ||
        args.retentionDays < 1 ||
        args.retentionDays > 3650)
    ) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Retention must be 1-3650 days.",
      });
    }

    const defaults = getDefaults("analytics");
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "analytics"))
      .unique();

    const oldValues: Record<string, unknown> = existing
      ? { ...defaults, ...(existing.values as Record<string, unknown>) }
      : { ...defaults };

    const newValues: Record<string, unknown> = {
      ...oldValues,
      ...Object.fromEntries(
        Object.entries(args).filter(([, value]) => value !== undefined),
      ),
    };

    const changes = computeChanges(oldValues, newValues);
    if (changes.length === 0) return;

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        values: newValues,
        updatedAt: now,
        updatedBy: user._id,
      });
    } else {
      await ctx.db.insert("settings", {
        section: "analytics",
        values: newValues,
        updatedAt: now,
        updatedBy: user._id,
      });
    }

    // Emit event for audit trail
    await emitEvent(ctx, "analytics.settings_updated", "analytics", {
      changes,
      updatedBy: user._id,
    });
  },
});
