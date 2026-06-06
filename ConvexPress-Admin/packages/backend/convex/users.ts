import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  getCurrentUser as getUser,
  requireAdmin,
  requireAuth,
} from "./helpers/auth";
import { emitEvent } from "./helpers/events";
import { ROLE_EVENTS, SYSTEM } from "./events/constants";
import { BUILT_IN_ROLES } from "./seed/roles";

// ─── Queries ────────────────────────────────────────────────────────────────

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await getUser(ctx);
  },
});

export const hasAnyAdmin = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    // Single pass: collect all users with internalRole="admin" and check isInternal
    const adminRoleUsers = await ctx.db
      .query("users")
      .withIndex("by_internal_role", (q) => q.eq("internalRole", "admin"))
      .collect();
    return adminRoleUsers.some((u) => u.isInternal === true);
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Use by_internal_role index instead of unindexed full table scan
    const adminRoleUsers = await ctx.db
      .query("users")
      .withIndex("by_internal_role", (q) => q.eq("internalRole", "admin"))
      .collect();
    const existingAdmin = adminRoleUsers.find((u) => u.isInternal === true);

    if (existingAdmin) {
      throw new Error(
        "Admin already exists. Contact an existing admin for access.",
      );
    }

    const user = await getUser(ctx);

    // Look up the Administrator role to assign roleId
    const adminRole = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", "administrator"))
      .unique();

    // Generate username from email (e.g., "john@example.com" -> "john")
    const emailPrefix = (identity.email || "admin").split("@")[0] || "admin";
    const username = emailPrefix.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    const displayName =
      [identity.givenName, identity.familyName].filter(Boolean).join(" ") ||
      username;

    if (user) {
      await ctx.db.patch("users", user._id, {
        isInternal: true,
        internalRole: "admin",
        ...(adminRole ? { roleId: adminRole._id } : {}),
        ...(!user.username ? { username } : {}),
        ...(!user.displayName ? { displayName } : {}),
        ...(!user.slug ? { slug: username } : {}),
        updatedAt: Date.now(),
      });
      if (!user.clerkUserId && identity.email) {
        await ctx.scheduler.runAfter(0, internal.auth.clerkManagement.ensureUserInClerk, {
          userId: user._id,
          source: "bootstrap_admin",
          email: identity.email,
          firstName: identity.givenName ?? undefined,
          lastName: identity.familyName ?? undefined,
          displayName,
          setAuthSourceToClerk: false,
          skipPasswordRequirement: true,
        });
      }
      return { success: true, action: "updated", userId: user._id };
    } else {
      const now = Date.now();
      const isLocalAdminAuth = identity.tokenIdentifier?.startsWith(
        "https://convexpress-admin.local|",
      );
      const userId = await ctx.db.insert("users", {
        // Store the identity subject in the appropriate field based on auth source
        ...(isLocalAdminAuth
          ? { authSource: "local" as const }
          : { authSource: "clerk" as const, clerkUserId: identity.subject }),
        email: identity.email || "",
        emailVerified: true,
        firstName: identity.givenName,
        lastName: identity.familyName,
        profilePictureUrl: identity.pictureUrl,
        isInternal: true,
        internalRole: "admin",
        ...(adminRole ? { roleId: adminRole._id } : {}),
        username,
        displayName,
        slug: username,
        status: "active",
        clerkProvisioningStatus: isLocalAdminAuth ? "pending" : "linked_existing",
        clerkProvisioningSource: "bootstrap_admin",
        clerkProvisioningReason: isLocalAdminAuth
          ? "scheduled_after_bootstrap_admin"
          : "created_from_clerk_identity",
        ...(!isLocalAdminAuth ? { clerkProvisionedAt: now } : {}),
        createdAt: now,
        updatedAt: now,
      });
      if (isLocalAdminAuth && identity.email) {
        await ctx.scheduler.runAfter(0, internal.auth.clerkManagement.ensureUserInClerk, {
          userId,
          source: "bootstrap_admin",
          email: identity.email,
          firstName: identity.givenName ?? undefined,
          lastName: identity.familyName ?? undefined,
          displayName,
          setAuthSourceToClerk: false,
          skipPasswordRequirement: true,
        });
      }
      return { success: true, action: "created", userId };
    }
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
