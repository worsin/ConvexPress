/**
 * Password Management System - Queries
 *
 * Public query for password status (used by dashboard/settings and admin user edit).
 * Internal queries used by the password reset actions.
 *
 * Functions:
 *   getPasswordStatus          (public)   - Get password metadata for self or another user
 *   getUserBySubject           (internal) - Look up user by auth subject (for action auth)
 *   getUserById                (internal) - Look up user by Convex ID (for action target)
 *   getUserRoleLevel           (internal) - Get a user's role level (for action auth)
 *   getRegistrationMethodByEmail (internal) - Check if email is OAuth-registered
 *   getSiteUrl                 (internal) - Get site URL from settings
 */

import { query, internalQuery } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { getCurrentUser, lookupUserByIdentifier } from "../helpers/permissions";
import { getPasswordStatusArgs } from "./validators";

// ─── getPasswordStatus (Public Query) ───────────────────────────────────────

/**
 * Get password status metadata for a user.
 *
 * If no userId is provided, returns the current user's own status.
 * If a userId is provided, requires Administrator role (level 100).
 *
 * Returns:
 *   - lastPasswordChangedAt: timestamp of last password change (or null)
 *   - passwordResetRequestedAt: timestamp of last reset request (or null)
 *   - passwordResetCount: total lifetime password resets
 *
 * Used by:
 *   - /dashboard/settings page (own status)
 *   - /admin/users/$userId/edit page (admin viewing another user)
 *
 * WordPress equivalent: No direct equivalent (WP doesn't expose password metadata).
 */
export const getPasswordStatus = query({
  args: getPasswordStatusArgs,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    let targetUser;

    if (args.userId) {
      // Viewing another user's status: require Administrator
      const currentUser = await getCurrentUser(ctx);
      if (!currentUser) return null;

      // Check if the current user is an Administrator (role level 100)
      if (currentUser.roleId) {
        const role = await ctx.db.get(currentUser.roleId);
        if (!role || role.level < 100) {
          throw new ConvexError({
            code: "FORBIDDEN",
            message: "Administrator access required to view another user's password status",
          });
        }
      } else {
        // Legacy check: fall back to internalRole
        if (currentUser.internalRole !== "admin") {
          throw new ConvexError({
            code: "FORBIDDEN",
            message: "Administrator access required to view another user's password status",
          });
        }
      }

      targetUser = await ctx.db.get(args.userId);
    } else {
      // Viewing own status: just need authentication
      targetUser = await lookupUserByIdentifier(ctx, identity.subject);
    }

    if (!targetUser) return null;

    return {
      lastPasswordChangedAt: targetUser.lastPasswordChangedAt ?? null,
      passwordResetRequestedAt: targetUser.passwordResetRequestedAt ?? null,
      passwordResetCount: targetUser.passwordResetCount ?? 0,
    };
  },
});

// ─── Internal Queries (for actions) ─────────────────────────────────────────

/**
 * Look up a user by auth identity subject.
 * Used by adminResetUserPassword action to identify the caller.
 * Handles both Convex Auth (subject = user _id) and Clerk (subject = clerk user ID).
 */
export const getUserBySubject = internalQuery({
  args: { subject: v.string() },
  handler: async (ctx, args) => {
    return await lookupUserByIdentifier(ctx, args.subject);
  },
});

/**
 * Look up a user by Convex document ID.
 * Used by adminResetUserPassword action to look up the target user.
 */
export const getUserById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

/**
 * Check if an email address belongs to an OAuth-registered user.
 * Returns the registration method if found, null otherwise.
 *
 * Used by requestPasswordReset action to provide an OAuth hint
 * without confirming or denying email existence explicitly.
 */
export const getRegistrationMethodByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .unique();

    if (!user) return null;

    return user.registrationMethod ?? null;
  },
});

/**
 * Get the role level for a user.
 * Returns the role's level field (100 for Administrator, 80 for Editor, etc.)
 * or 0 if no role is assigned.
 *
 * Handles both new role system (roleId) and legacy (internalRole).
 */
export const getUserRoleLevel = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return 0;

    // New role system: resolve via roleId
    if (user.roleId) {
      const role = await ctx.db.get(user.roleId);
      if (role && role.status === "active") {
        return role.level ?? 0;
      }
    }

    // Legacy fallback: map internalRole string to level
    const legacyLevels: Record<string, number> = {
      admin: 100,
      administrator: 100,
      editor: 80,
      author: 60,
      contributor: 40,
      subscriber: 20,
    };

    if (user.internalRole) {
      return legacyLevels[user.internalRole.toLowerCase()] ?? 0;
    }

    return 0;
  },
});

/**
 * Get the site URL from the general settings.
 * Used to build password reset links.
 * Falls back to empty string if no site URL is configured.
 */
export const getSiteUrl = internalQuery({
  args: {},
  handler: async (ctx) => {
    const generalSettings = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "general"))
      .unique();

    const values = (generalSettings?.values ?? {}) as Record<string, unknown>;
    return (values.siteUrl as string) ?? "";
  },
});

/**
 * Look up a user by email address.
 * Used by the completePasswordReset action to retrieve the Clerk user ID.
 * Returns the full user document (including clerkUserId) or null.
 */
export const getUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .unique();
  },
});
