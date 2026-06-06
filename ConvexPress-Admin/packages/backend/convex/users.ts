import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  getCurrentUser as getUser,
  requireAdmin,
  requireAuth,
} from "./helpers/auth";
import { emitEvent } from "./helpers/events";
import { ROLE_EVENTS, SYSTEM } from "./events/constants";
import { BUILT_IN_ROLES } from "./seed/roles";
import { hasActiveAdmin } from "./auth/adminPresence";

type CurrentUserPublic = {
  _id: string;
  _creationTime: number;
  email: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  phone?: string;
  profilePictureUrl?: string;
  username?: string;
  nickname?: string;
  displayName?: string;
  slug?: string;
  bio?: string;
  url?: string;
  avatarUrl?: string;
  avatarMediaId?: string;
  avatarStorageId?: string;
  socialLinks?: Record<string, string | undefined>;
  roleId?: string;
  status: "active" | "inactive" | "banned";
  preferences?: Record<string, unknown>;
  locale?: string;
  timezone?: string;
  postCount?: number;
  commentCount?: number;
  internalRole?: string;
  isInternal?: boolean;
  createdAt: number;
  updatedAt: number;
};

function toPublicCurrentUser(user: Awaited<ReturnType<typeof getUser>>): CurrentUserPublic | null {
  if (!user || user.status !== "active") return null;

  return {
    _id: user._id,
    _creationTime: user._creationTime,
    email: user.email,
    emailVerified: user.emailVerified,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    profilePictureUrl: user.profilePictureUrl,
    username: user.username,
    nickname: user.nickname,
    displayName: user.displayName,
    slug: user.slug,
    bio: user.bio,
    url: user.url,
    avatarUrl: user.avatarUrl,
    avatarMediaId: user.avatarMediaId,
    avatarStorageId: user.avatarStorageId,
    socialLinks: user.socialLinks,
    roleId: user.roleId,
    status: user.status,
    preferences: user.preferences,
    locale: user.locale,
    timezone: user.timezone,
    postCount: user.postCount,
    commentCount: user.commentCount,
    internalRole: user.internalRole,
    isInternal: user.isInternal,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// ─── Queries ────────────────────────────────────────────────────────────────

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return toPublicCurrentUser(await getUser(ctx));
  },
});

export const hasAnyAdmin = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await hasActiveAdmin(ctx);
  },
});

/**
 * Check if the current user has admin panel access.
 *
 * Uses BOTH the legacy `isInternal` field AND the role-based capability system.
 * A user gets access if they have either:
 *   1. Legacy: `isInternal === true` (backward compatibility during migration)
 *   2. New system: An active role with type "internal" (Admin/Editor roles)
 *
 * Supports dual-auth: local admin JWT and Clerk. Uses getCurrentUser() which
 * handles both auth sources.
 *
 * TODO: Once all users are migrated to the new role system, remove the
 * `isInternal` check and rely solely on the role-based check.
 */
export const checkAdminAccess = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return null;
    if (user.status !== "active") return null;

    // Check via capability system first (new system)
    let hasAccess = false;
    if (user.roleId) {
      const role = await ctx.db.get("roles", user.roleId);
      if (role && role.status === "active" && role.type === "internal") {
        hasAccess = true;
      }
      if (!hasAccess) return null;
    }

    // Fallback to legacy `isInternal` field for unmigrated users
    if (!user.roleId && user.isInternal === true) {
      hasAccess = true;
    }

    if (!hasAccess) {
      return null;
    }

    return {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profilePictureUrl: user.profilePictureUrl,
      internalRole: user.internalRole,
      isInternal: user.isInternal,
    };
  },
});

// ─── Mutations ──────────────────────────────────────────────────────────────

export const bootstrapAdmin = mutation({
  args: {},
  handler: async (ctx) => {
    throw new ConvexError(
      "Legacy bootstrapAdmin is disabled. Use auth.setup.createFirstAdmin.",
    );
  },
});

export const updateUserRole = mutation({
  args: {
    userId: v.id("users"),
    internalRole: v.string(),
    isInternal: v.boolean(),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireAdmin(ctx);

    // Prevent admins from changing their own role (avoids accidental lockout)
    if (currentUser._id === args.userId) {
      throw new ConvexError("You cannot change your own role. Ask another admin to make this change.");
    }

    // Check last-admin protection: if demoting from admin, ensure at least one other admin remains
    const targetUser = await ctx.db.get("users", args.userId);
    if (!targetUser) {
      throw new ConvexError("Target user not found.");
    }

    const isDemotingFromAdmin =
      targetUser.isInternal === true &&
      targetUser.internalRole === "admin" &&
      (args.internalRole !== "admin" || args.isInternal !== true);

    if (isDemotingFromAdmin) {
      // Count how many other admins exist (excluding the target user)
      const allAdmins = await ctx.db
        .query("users")
        .withIndex("by_internal_role", (q) => q.eq("internalRole", "admin"))
        .collect();
      const otherAdmins = allAdmins.filter(
        (u) => u._id !== args.userId && u.isInternal === true,
      );

      if (otherAdmins.length === 0) {
        throw new ConvexError(
          "Cannot demote the last admin. Promote another user to admin first.",
        );
      }
    }

    const roleSlugMap: Record<string, string> = {
      admin: "administrator",
      editor: "editor",
      author: "author",
      contributor: "contributor",
      customer: "subscriber",
      subscriber: "subscriber",
    };
    const targetRoleSlug = roleSlugMap[args.internalRole] ?? args.internalRole;
    const targetRole = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", targetRoleSlug))
      .unique();

    await ctx.db.patch("users", args.userId, {
      internalRole: args.internalRole,
      isInternal: args.isInternal,
      ...(targetRole ? { roleId: targetRole._id } : {}),
      updatedAt: Date.now(),
    });

    // Emit role.assigned event for audit trail and downstream listeners
    await emitEvent(ctx, ROLE_EVENTS.ASSIGNED, SYSTEM.ROLE, {
      userId: args.userId,
      previousRole: targetUser.internalRole,
      newRole: args.internalRole,
      previousIsInternal: targetUser.isInternal,
      newIsInternal: args.isInternal,
    });
  },
});

// ─── Internal Mutations (CLI / system use only) ─────────────────────────────

export const setAdminByEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!user) throw new Error(`User not found with email: ${args.email}`);

    const adminRole = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", "administrator"))
      .unique();

    await ctx.db.patch("users", user._id, {
      isInternal: true,
      internalRole: "admin",
      ...(adminRole ? { roleId: adminRole._id } : {}),
      updatedAt: Date.now(),
    });

    return { success: true, userId: user._id, email: user.email };
  },
});

export const setCustomerByEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!user) throw new Error(`User not found with email: ${args.email}`);

    const subscriberRole = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", "subscriber"))
      .unique();

    await ctx.db.patch("users", user._id, {
      isInternal: false,
      internalRole: "customer",
      ...(subscriberRole ? { roleId: subscriberRole._id } : {}),
      updatedAt: Date.now(),
    });

    return { success: true, userId: user._id, email: user.email };
  },
});

// ─── Seed Roles ─────────────────────────────────────────────────────────────
// NOTE: This is a legacy seed function preserved for backward compatibility.
// The canonical seed function is roles/internals:seedRoles which uses
// the BUILT_IN_ROLES data from seed/roles.ts with full capabilities and pageAccess.
// Prefer using `npx convex run roles/internals:seedRoles` instead.

export const seedRoles = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existingRoles = await ctx.db.query("roles").collect();
    if (existingRoles.length > 0) return { message: "Roles already seeded" };

    const now = Date.now();
    const roles = BUILT_IN_ROLES.map((role) => ({
      name: role.name,
      slug: role.slug,
      description: role.description,
      level: role.level,
      type: role.type,
      isDefault: role.isDefault,
      isProtected: role.isProtected,
      capabilities: role.capabilities,
      pageAccess: role.pageAccess,
      status: role.status,
      createdAt: now,
      updatedAt: now,
    }));

    for (const role of roles) {
      await ctx.db.insert("roles", role);
    }

    return { message: "Roles seeded", count: roles.length };
  },
});
