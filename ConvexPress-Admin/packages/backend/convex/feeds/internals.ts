/**
 * RSS/Feed System - Internal Functions
 *
 * Internal helper queries used by feed HTTP actions and the fetchExternal action.
 * These are NOT client-callable -- they are only called from other server-side
 * functions via ctx.runQuery(internal.feeds.internals.xxx).
 *
 * Functions:
 *   - getSettingsForFeed      - Get feed settings (for use in actions)
 *   - getUserByWorkosId       - Look up a user by WorkOS user ID (for auth in actions)
 *   - getUserRoleLevel        - Get a user's role level (for capability checks in actions)
 *
 * WordPress equivalent: Internal helper functions called by feed template files
 */

import { lookupUserByIdentifier } from "../helpers/permissions";
import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
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
  handler: async (ctx) => {
    const general = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "general"))
      .unique();

    const reading = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "reading"))
      .unique();

    const generalValues = general?.values as Record<string, unknown> | undefined;
    const readingValues = reading?.values as Record<string, unknown> | undefined;

    return {
      siteTitle:
        (generalValues?.siteTitle as string) ?? FEED_SETTINGS_DEFAULTS.siteTitle,
      siteDescription:
        (generalValues?.tagline as string) ?? FEED_SETTINGS_DEFAULTS.siteDescription,
      siteUrl:
        (generalValues?.siteUrl as string) ?? FEED_SETTINGS_DEFAULTS.siteUrl,
      language:
        (generalValues?.siteLanguage as string) ?? FEED_SETTINGS_DEFAULTS.language,
      feedItemCount: Math.min(
        MAX_FEED_ITEM_COUNT,
        Math.max(
          1,
          (readingValues?.feedItemCount as number) ?? FEED_SETTINGS_DEFAULTS.feedItemCount,
        ),
      ),
      feedContentDisplay:
        ((readingValues?.feedContentDisplay as string) === "summary" ? "summary" : "full") as
          | "full"
          | "summary",
    };
  },
});

// ─── getUserByIdentifier ────────────────────────────────────────────────────

/**
 * Look up a user by their identifier (workosUserId, clerkUserId, or Convex _id).
 * Used by the fetchExternal action for authentication.
 */
export const getUserByWorkosId = internalQuery({
  args: { workosId: v.string() },
  handler: async (ctx, args) => {
    // Try workosUserId first, then clerkUserId, then direct ID
    const byWorkos = await ctx.db
      .query("users")
      .withIndex("by_workosUserId", (q) => q.eq("workosUserId", args.workosId))
      .unique();
    if (byWorkos) return byWorkos;

    const byClerk = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.workosId))
      .unique();
    if (byClerk) return byClerk;

    try {
      return await ctx.db.get(args.workosId as any);
    } catch {
      return null;
    }
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
