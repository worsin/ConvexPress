/**
 * Sitemap System - Public Mutations
 *
 * Two mutations for managing sitemaps:
 *
 *   - updateSettings:  Update sitemap configuration (admin only)
 *   - markStale:       Mark sitemaps as needing regeneration (internal)
 *
 * Auth model:
 *   - updateSettings: Requires `seo.generate_sitemap` capability (Administrator only)
 *   - markStale: Internal mutation (called by event subscribers, not client-callable)
 *
 * Usage:
 *   // Admin sitemap settings form
 *   const update = useMutation(api.sitemaps.mutations.updateSettings);
 *   await update({ settings: { enabled: true, include_posts: true } });
 */

import { mutation, internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import { requireCan , getUserIdentifier } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { SETTINGS_EVENTS, SYSTEM } from "../events/constants";
import {
  updateSettingsArgs,
  markStaleArgs,
  SITEMAP_SETTINGS_KEY,
  isValidChangefreq,
  isValidPriority,
  isValidMaxUrls,
  isValidDebounceMs,
} from "./validators";
import { readSitemapSettings } from "./helpers/settings";

// ─── Debounce Key for storing scheduled function ID ──────────────────────────
const DEBOUNCE_KEY = "sitemap_scheduled_regen";

/**
 * Schedule a debounced regeneration, canceling any previously scheduled one.
 * Stores the scheduled function ID in seoSettings so subsequent calls can cancel it.
 */
async function scheduleDebounced(
  ctx: MutationCtx,
  debounceMs: number,
  triggeredBy: "content_change" | "settings_change",
): Promise<void> {
  // Read the previously stored scheduled function ID
  const existing = await ctx.db
    .query("seoSettings")
    .withIndex("by_key", (q) => q.eq("key", DEBOUNCE_KEY))
    .unique();

  // Cancel previous scheduled regeneration if it exists
  if (existing) {
    try {
      const previousId = JSON.parse(existing.value).scheduledId;
      if (previousId) {
        await ctx.scheduler.cancel(previousId);
      }
    } catch {
      // Previous ID may be invalid or already executed; that's fine
    }
  }

  // Schedule new regeneration
  const scheduledId = await ctx.scheduler.runAfter(
    debounceMs,
    internal.sitemaps.internals.regenerateStale,
    { triggeredBy },
  );

  // Store the new scheduled function ID
  const now = Date.now();
  if (existing) {
    await ctx.db.patch("seoSettings", existing._id, {
      value: JSON.stringify({ scheduledId, scheduledAt: now }),
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("seoSettings", {
      key: DEBOUNCE_KEY,
      value: JSON.stringify({ scheduledId, scheduledAt: now }),
      updatedAt: now,
      updatedBy: "system",
    });
  }
}

// ─── updateSettings ──────────────────────────────────────────────────────────

/**
 * Update sitemap configuration settings.
 *
 * Validates all provided setting values, updates the seoSettings table,
 * and triggers regeneration if content type inclusion changed.
 *
 * Flow:
 *   1. Authenticate and verify seo.generate_sitemap capability
 *   2. Validate each provided setting value
 *   3. Read current settings and merge
 *   4. Save to seoSettings table
 *   5. If inclusion settings changed, mark all sitemaps as stale
 *   6. If disabled, delete all cached sitemaps
 *   7. Emit event for audit logging
 *   8. Return success
 *
 * @throws UNAUTHORIZED if not authenticated
 * @throws FORBIDDEN if user lacks capability
 * @throws VALIDATION_ERROR if any setting value is invalid
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateSettings = mutation({
  args: updateSettingsArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // 1. Auth check
    const user = await requireCan(ctx, "seo.generate_sitemap");
    const { settings: newSettings } = args;

    // 2. Validate settings values
    if (newSettings.max_urls_per_sitemap !== undefined) {
      if (!isValidMaxUrls(newSettings.max_urls_per_sitemap)) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "max_urls_per_sitemap must be an integer between 1 and 50000",
        });
      }
    }

    if (newSettings.regeneration_debounce_ms !== undefined) {
      if (!isValidDebounceMs(newSettings.regeneration_debounce_ms)) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "regeneration_debounce_ms must be between 5000 and 300000 (5s to 5min)",
        });
      }
    }

    // Validate changefreq fields
    const changefreqFields = [
      "changefreq_posts",
      "changefreq_pages",
      "changefreq_courses",
      "changefreq_categories",
      "changefreq_tags",
      "changefreq_authors",
      "changefreq_homepage",
    ] as const;

    for (const field of changefreqFields) {
      const value = newSettings[field];
      if (value !== undefined && !isValidChangefreq(value)) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `${field} must be one of: always, hourly, daily, weekly, monthly, yearly, never`,
        });
      }
    }

    // Validate priority fields
    const priorityFields = [
      "priority_homepage",
      "priority_posts",
      "priority_pages",
      "priority_courses",
      "priority_categories",
      "priority_tags",
      "priority_authors",
    ] as const;

    for (const field of priorityFields) {
      const value = newSettings[field];
      if (value !== undefined && !isValidPriority(value)) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `${field} must be between 0.0 and 1.0`,
        });
      }
    }

    // 3. Read current settings (from shared helper)
    const currentSettings = await readSitemapSettings(ctx);

    // Detect if content type inclusion or enabled status changed
    const inclusionChanged =
      newSettings.include_posts !== undefined && newSettings.include_posts !== currentSettings.include_posts ||
      newSettings.include_pages !== undefined && newSettings.include_pages !== currentSettings.include_pages ||
      newSettings.include_courses !== undefined && newSettings.include_courses !== currentSettings.include_courses ||
      newSettings.include_categories !== undefined && newSettings.include_categories !== currentSettings.include_categories ||
      newSettings.include_tags !== undefined && newSettings.include_tags !== currentSettings.include_tags ||
      newSettings.include_authors !== undefined && newSettings.include_authors !== currentSettings.include_authors;

    const enabledChanged = newSettings.enabled !== undefined && newSettings.enabled !== currentSettings.enabled;
    const maxUrlsChanged = newSettings.max_urls_per_sitemap !== undefined &&
      newSettings.max_urls_per_sitemap !== currentSettings.max_urls_per_sitemap;

    // 4. Merge and save
    const merged: Record<string, unknown> = { ...currentSettings };
    for (const [key, value] of Object.entries(newSettings)) {
      if (value !== undefined) {
        merged[key] = value;
      }
    }

    const now = Date.now();
    const valueJson = JSON.stringify(merged);

    const existing = await ctx.db
      .query("seoSettings")
      .withIndex("by_key", (q: ConvexQueryBuilder) => q.eq("key", SITEMAP_SETTINGS_KEY))
      .unique();

    if (existing) {
      await ctx.db.patch("seoSettings", existing._id, {
        value: valueJson,
        updatedAt: now,
        updatedBy: getUserIdentifier(user),
      });
    } else {
      await ctx.db.insert("seoSettings", {
        key: SITEMAP_SETTINGS_KEY,
        value: valueJson,
        updatedAt: now,
        updatedBy: getUserIdentifier(user),
      });
    }

    // 5. Handle side effects
    if (enabledChanged && merged.enabled === false) {
      // Disabled: delete all cached sitemaps
      const allCached = await ctx.db.query("sitemapCache").collect();
      for (const entry of allCached) {
        await ctx.db.delete("sitemapCache", entry._id);
      }
    } else if (inclusionChanged || maxUrlsChanged || (enabledChanged && merged.enabled === true)) {
      // Inclusion or max URLs changed: mark all sitemaps as stale
      const allCached = await ctx.db.query("sitemapCache").collect();
      for (const entry of allCached) {
        await ctx.db.patch("sitemapCache", entry._id, { isStale: true });
      }

      // Schedule regeneration if auto-regenerate is enabled (with cancellation)
      if (merged.auto_regenerate) {
        const debounceMs = (merged.regeneration_debounce_ms as number) || 30000;
        await scheduleDebounced(ctx, debounceMs, "settings_change");
      }
    }

    // 7. Emit event for audit (use settings.updated, not sitemap_generated)
    await emitEvent(ctx, SETTINGS_EVENTS.UPDATED, SYSTEM.SITEMAP, {
      action: "sitemap_settings_updated",
      updatedBy: user._id,
      changes: Object.keys(newSettings).filter(
        (k) => newSettings[k as keyof typeof newSettings] !== undefined,
      ),
    });

    return { success: true };
  },
});

// ─── markStale (Internal Mutation) ───────────────────────────────────────────

/**
 * Mark specified sitemap types as stale, indicating they need regeneration.
 *
 * Called by event subscribers when content changes (e.g., post published,
 * page updated, taxonomy modified). Not directly callable by clients.
 *
 * Behavior:
 *   1. For each specified type, set isStale = true on all matching cache entries
 *   2. Always also mark the index as stale (since it references sub-sitemaps)
 *   3. If auto_regenerate is enabled, schedule debounced regeneration
 *
 * @param types - Array of sitemap types to mark stale
 * @returns Count of sitemaps marked stale
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const markStale = internalMutation({
  args: markStaleArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // Read settings to check if enabled
    const settings = await readSitemapSettings(ctx);
    if (!settings.enabled) return { count: 0 };

    // Collect all types to mark stale (always include index)
    const typesToMark = new Set(args.types);
    typesToMark.add("index");

    let count = 0;

    for (const type of typesToMark) {
      const entries = await ctx.db
        .query("sitemapCache")
        .withIndex("by_type", (q: ConvexQueryBuilder) => q.eq("type", type as "index" | "posts" | "pages" | "categories" | "tags" | "authors"))
        .collect();

      for (const entry of entries) {
        if (!entry.isStale) {
          await ctx.db.patch("sitemapCache", entry._id, { isStale: true });
          count++;
        }
      }
    }

    // Schedule debounced regeneration if auto-regenerate enabled
    // Uses cancellation pattern to prevent multiple simultaneous scheduled runs
    if (settings.auto_regenerate && count > 0) {
      await scheduleDebounced(ctx, settings.regeneration_debounce_ms, "content_change");
    }

    return { count };
  },
});
