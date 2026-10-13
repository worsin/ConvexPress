/**
 * RSS/Feed System - Internal Functions
 *
 * Internal helper queries used by feed HTTP actions and the fetchExternal action.
 * These are NOT client-callable -- they are only called from other server-side
 * functions via ctx.runQuery(internal.feeds.internals.xxx).
 *
 * Functions:
 *   - getSettingsForFeed      - Get feed settings (for use in actions)
 *   - getUserByIdentifier     - Look up a user by identifier string (for auth in actions)
 *   - getUserRoleLevel        - Get a user's role level (for capability checks in actions)
 *
 * WordPress equivalent: Internal helper functions called by feed template files
 */

import { lookupUserByIdentifier } from "../helpers/permissions";
import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { numberSetting, settingsRecord, textSetting } from "../helpers/settingsReader";
import { FEED_SETTINGS_DEFAULTS, MAX_FEED_ITEM_COUNT } from "./validators";

import { usersDocs } from "../schema/users.docs.generated";
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

// ─── getUserByIdentifier ────────────────────────────────────────────────────

/**
 * Look up a user by their identifier (clerkUserId or Convex _id).
 * Used by the fetchExternal action for authentication.
 */
export const getUserByIdentifier = internalQuery({
  args: { userId: v.string() },
  returns: v.union(v.null(), usersDocs.users),
  handler: async (ctx, args) => {
    const byClerk = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.userId))
      .unique();
    if (byClerk) return byClerk;

    const userId = ctx.db.normalizeId("users", args.userId);
    return userId ? await ctx.db.get("users", userId) : null;
  },
});

// ─── getUserRoleLevel ───────────────────────────────────────────────────────

/**
 * Get a user's role level (0-100) for capability checks in actions.
 * Used by the fetchExternal action to verify Administrator access.
 *
 * Resolution order:
 *   1. Direct roleId reference (new system)
 *   2. Legacy internalRole string (migration path)
 *   3. Returns 0 if no role found
 */
export const getUserRoleLevel = internalQuery({
  args: { userId: v.id("users") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (!user || user.status !== "active") return 0;

    // Try direct roleId
    if (user.roleId) {
      const role = await ctx.db.get("roles", user.roleId);
      if (role && role.status === "active") {
        return role.level;
      }
    }

    // Try legacy internalRole
    if (user.internalRole) {
      // Map legacy roles to approximate levels
      const legacyMap: Record<string, number> = {
        administrator: 100,
        admin: 100,
        editor: 80,
        author: 60,
        contributor: 40,
        subscriber: 20,
      };
      return legacyMap[user.internalRole.toLowerCase()] ?? 0;
    }

    return 0;
  },
});
