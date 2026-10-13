/**
 * RSS/Feed System - Internal Functions
 *
 * Internal helper queries used by feed HTTP actions and the fetchExternal action.
 * These are NOT client-callable -- they are only called from other server-side
 * functions via ctx.runQuery(internal.feeds.internals.xxx).
 *
 * Functions:
 *   - getSettingsForFeed      - Get feed settings (for use in actions)
 *   - getCallerRoleLevel      - The calling action's verified user and role level
 *
 * WordPress equivalent: Internal helper functions called by feed template files
 */

import { getCurrentRoleLevel, getCurrentUser } from "../helpers/permissions";
import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { numberSetting, settingsRecord, textSetting } from "../helpers/settingsReader";
import { FEED_SETTINGS_DEFAULTS, MAX_FEED_ITEM_COUNT } from "./validators";

// ─── getSettingsForFeed ─────────────────────────────────────────────────────

/**
 * Internal query to fetch feed-related settings.
 * Used by feed actions that need settings but can't use ctx.db directly.
 *
 * Returns the same merged defaults + stored values as the public
 * getFeedSettings query, but callable from internal actions.
 */
export const getSettingsForFeed = internalQuery({
  args: {},
  returns: v.object({
    siteTitle: v.string(),
    siteDescription: v.string(),
    siteUrl: v.string(),
    language: v.string(),
    feedItemCount: v.number(),
    feedContentDisplay: v.union(v.literal("full"), v.literal("summary")),
  }),
  handler: async (ctx) => {
    const general = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "general"))
      .unique();

    const reading = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "reading"))
      .unique();

    const generalValues = settingsRecord(general?.values);
    const readingValues = settingsRecord(reading?.values);

    return {
      siteTitle: textSetting(generalValues.siteTitle, FEED_SETTINGS_DEFAULTS.siteTitle),
      siteDescription: textSetting(generalValues.tagline, FEED_SETTINGS_DEFAULTS.siteDescription),
      siteUrl: textSetting(generalValues.siteUrl, FEED_SETTINGS_DEFAULTS.siteUrl),
      language: textSetting(generalValues.siteLanguage, FEED_SETTINGS_DEFAULTS.language),
      feedItemCount: Math.min(
        MAX_FEED_ITEM_COUNT,
        Math.max(1, numberSetting(readingValues.feedItemCount, FEED_SETTINGS_DEFAULTS.feedItemCount)),
      ),
      feedContentDisplay: readingValues.feedContentDisplay === "summary" ? ("summary" as const) : ("full" as const),
    };
  },
});

// ─── getCallerRoleLevel ─────────────────────────────────────────────────────

/**
 * The calling action's role level (0-100), or null when it has no active
 * ConvexPress user. Convex passes the action's verified identity to this
 * query, so the caller is resolved by getCurrentUser (issuer rules, auth
 * source and management-session ceilings included), never from an argument.
 * Used by the fetchExternal action to verify Administrator access.
 */
export const getCallerRoleLevel = internalQuery({
  args: {},
  returns: v.union(v.null(), v.number()),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user || user.status !== "active") return null;
    return await getCurrentRoleLevel(ctx);
  },
});
