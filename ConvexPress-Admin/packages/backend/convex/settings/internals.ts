/**
 * Settings System - Internal Functions
 *
 * Internal query for server-side settings access by other systems.
 * Not client-callable -- only invocable from other Convex functions.
 *
 * Usage (from another system's internals):
 *   import { internal } from "../_generated/api";
 *
 *   // Inside an internalMutation/internalQuery handler:
 *   const settings = await ctx.runQuery(internal.settings.internals.getInternal, {
 *     section: "permalinks",
 *   });
 *
 * Systems that consume this:
 *   - Routing System: reads permalink structure
 *   - Comment System: reads discussion/moderation settings
 *   - Post System: reads default category and post format
 *   - Registration System: reads membership and default role
 *   - RSS/Feed System: reads feed settings
 *   - SEO System: reads search engine visibility, site title
 *   - Sitemap System: reads permalink structure
 */

import { internalQuery } from "../_generated/server";
import { getInternalArgs } from "./validators";
import { getDefaults, isValidSection, type SettingsSection } from "./defaults";
import { requireCan } from "../helpers/permissions";

// ─── getInternal ─────────────────────────────────────────────────────────────

/**
 * Internal query for reading merged settings (defaults + stored).
 * Same behavior as getBySection but not client-callable.
 *
 * Takes a string section name (not a union validator) for flexibility
 * when called from internal functions that may build the section name
 * dynamically.
 *
 * @param section - Section name as a string
 * @returns Merged settings values, or null if the section is invalid
 */
export const getInternal = internalQuery({
  args: getInternalArgs,
  handler: async (ctx, args) => {
    const { section } = args;

    // Validate section name
    if (!isValidSection(section)) {
      return null;
    }

    const sectionName = section as SettingsSection;

    // Get defaults
    const defaults = getDefaults(sectionName);

    // Get stored document
    const doc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", sectionName))
      .unique();

    // Merge defaults with stored values
    const values = doc
      ? { ...defaults, ...(doc.values as Record<string, unknown>) }
      : { ...defaults };

    return {
      ...values,
      _id: doc?._id ?? null,
      updatedAt: doc?.updatedAt ?? null,
      updatedBy: doc?.updatedBy ?? null,
    };
  },
});

export const requireManageOptionsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    await requireCan(ctx, "manage_options");
    return true;
  },
});
