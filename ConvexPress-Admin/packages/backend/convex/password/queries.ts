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
import {
  currentUserCan,
  getCurrentUser,
  lookupUserByIdentifier,
  requireCan,
} from "../helpers/permissions";
import { getPasswordStatusArgs } from "./validators";

import { tableDocs } from "../schema/tableDocs.generated";
// ─── getPasswordStatus (Public Query) ───────────────────────────────────────

/**
 * Get password status metadata for a user.
 *
 * If no userId is provided, returns the current user's own status.
 * If a userId is provided for another user, requires password.reset.
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
  returns: v.union(v.null(), v.object({
    lastPasswordChangedAt: v.union(v.null(), v.number()),
    passwordResetRequestedAt: v.union(v.null(), v.number()),
    passwordResetCount: v.number(),
  })),
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    if (!currentUser) return null;

    if (args.userId) {
      // Viewing another user's status requires password reset authority.
      if (
        args.userId !== currentUser._id &&
        !(await currentUserCan(ctx, "password.reset"))
      ) {
        throw new ConvexError({
          code: "FORBIDDEN",
          message: "Insufficient permissions",
        });
      }

      const targetUser = await ctx.db.get(args.userId);
      if (!targetUser) return null;
      return {
        lastPasswordChangedAt: targetUser.lastPasswordChangedAt ?? null,
        passwordResetRequestedAt: targetUser.passwordResetRequestedAt ?? null,
        passwordResetCount: targetUser.passwordResetCount ?? 0,
      };
    }

    return {
      lastPasswordChangedAt: currentUser.lastPasswordChangedAt ?? null,
      passwordResetRequestedAt: currentUser.passwordResetRequestedAt ?? null,
      passwordResetCount: currentUser.passwordResetCount ?? 0,
    };
  },
});

export const requirePasswordResetCapability = internalQuery({
  args: {},
  returns: v.object({ _id: v.id("users") }),
  handler: async (ctx) => {
    const user = await requireCan(ctx, "password.reset");
    return { _id: user._id };
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
  returns: v.union(v.null(), v.object({
    _id: v.id("users"),
    _creationTime: v.number(),
    authSource: v.optional(v.union(v.literal("local"), v.literal("clerk"), v.literal("management"))),
    passwordHash: v.optional(v.string()),
    clerkUserId: v.optional(v.string()),
    email: v.string(),
    emailVerified: v.boolean(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    phone: v.optional(v.string()),
    profilePictureUrl: v.optional(v.string()),
    username: v.optional(v.string()),
    nickname: v.optional(v.string()),
    displayName: v.optional(v.string()),
    slug: v.optional(v.string()),
    bio: v.optional(v.string()),
    url: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    avatarMediaId: v.optional(v.id("media")),
    avatarStorageId: v.optional(v.string()),
    socialLinks: v.optional(v.object({
      twitter: v.optional(v.string()),
      facebook: v.optional(v.string()),
      instagram: v.optional(v.string()),
      linkedin: v.optional(v.string()),
      youtube: v.optional(v.string()),
      github: v.optional(v.string()),
      website: v.optional(v.string()),
    })),
    roleId: v.optional(v.id("roles")),
    status: v.union(v.literal("active"), v.literal("inactive"), v.literal("banned")),
    deactivatedAt: v.optional(v.number()),
    deactivatedBy: v.optional(v.id("users")),
    preferences: v.optional(v.object({
      adminColorScheme: v.optional(v.string()),
      showAdminBar: v.optional(v.boolean()),
      editorMode: v.optional(v.union(v.literal("code"), v.literal("visual"))),
      emailDigest: v.optional(v.union(v.literal("none"), v.literal("immediate"), v.literal("daily"), v.literal("weekly"))),
      notifyOnComment: v.optional(v.boolean()),
      notifyOnReply: v.optional(v.boolean()),
      notifyOnMention: v.optional(v.boolean()),
    })),
    locale: v.optional(v.string()),
    timezone: v.optional(v.string()),
    postCount: v.optional(v.number()),
    commentCount: v.optional(v.number()),
    registrationMethod: v.optional(v.string()),
    invitedBy: v.optional(v.id("users")),
    emailVerifiedAt: v.optional(v.number()),
    registeredAt: v.optional(v.number()),
    lastLoginAt: v.optional(v.number()),
    lastPasswordChangedAt: v.optional(v.number()),
    passwordResetRequestedAt: v.optional(v.number()),
    passwordResetCount: v.optional(v.number()),
    internalRole: v.optional(v.string()),
    isInternal: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })),
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
  returns: v.union(v.null(), tableDocs.users),
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
  returns: v.union(v.null(), v.string()),
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
  returns: v.number(),
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
  returns: v.string(),
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
  returns: v.union(v.null(), tableDocs.users),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .unique();
  },
});
