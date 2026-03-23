/**
 * Role & Capability System - Queries
 *
 * Read operations for roles and role change audit trail.
 * Most queries require authentication but NOT specific capabilities,
 * since role information is needed for UI rendering (sidebar, permissions).
 *
 * Queries:
 *   listRoles       - All roles sorted by level desc, with user counts
 *   getRole         - Single role by ID
 *   getRoleBySlug   - Role by slug (for lookup by name)
 *   getDefaultRole  - The default role assigned to new users
 *   getRoleChanges  - Audit trail of role assignments
 */

import { v } from "convex/values";
import { query } from "../_generated/server";
import { getCurrentUser, currentUserCan } from "../helpers/permissions";

// ─── List Roles ─────────────────────────────────────────────────────────────

/**
 * List all roles sorted by level descending (Administrator first).
 * Includes user count for each role.
 *
 * Returns empty array if the caller is not authenticated.
 */
export const listRoles = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    // Check if the caller has role management capabilities.
    // Non-admin users (e.g., Subscribers) get a stripped-down view
    // without full capabilities/pageAccess arrays for security.
    const isRoleAdmin = await currentUserCan(ctx, "role.update");

    // Bounded to 100 roles - sites rarely have more than 10 custom roles
    const roles = await ctx.db.query("roles").take(100);

    // Sort by level descending (Administrator 100 first, Subscriber 20 last)
    roles.sort((a, b) => b.level - a.level);

    // Compute user counts for each role
    const rolesWithCounts = await Promise.all(
      roles.map(async (role) => {
        // Count users with this roleId (new system)
        // Bounded to 50,000 users per role for counting
        const usersWithRoleId = await ctx.db
          .query("users")
          .withIndex("by_roleId", (q) => q.eq("roleId", role._id))
          .take(50000);

        // Also count legacy users by internalRole slug mapping
        // (users who haven't been migrated to roleId yet)
        const legacySlugMap: Record<string, string> = {
          administrator: "admin",
          editor: "editor",
          author: "author",
          contributor: "contributor",
          subscriber: "customer",
        };
        const legacySlug = legacySlugMap[role.slug];

        let legacyCount = 0;
        if (legacySlug) {
          // Bounded to 50,000 legacy users per role
          const legacyUsers = await ctx.db
            .query("users")
            .withIndex("by_internal_role", (q) =>
              q.eq("internalRole", legacySlug),
            )
            .take(50000);

          // Only count legacy users who DON'T also have a roleId
          // (to avoid double-counting migrated users)
          legacyCount = legacyUsers.filter((u) => !u.roleId).length;
        }

        const userCount = usersWithRoleId.length + legacyCount;

        // For non-admin users, return only basic role info (name, slug, level)
        // to avoid exposing full capability/pageAccess arrays
        if (!isRoleAdmin) {
          return {
            _id: role._id,
            _creationTime: role._creationTime,
            name: role.name,
            slug: role.slug,
            description: role.description,
            level: role.level,
            type: role.type,
            isDefault: role.isDefault,
            isProtected: role.isProtected,
            status: role.status,
            capabilities: [] as string[],
            pageAccess: [] as string[],
            userCount,
          };
        }

        return {
          ...role,
          userCount,
        };
      }),
    );

    return rolesWithCounts;
  },
});

// ─── Get Role ───────────────────────────────────────────────────────────────

/**
 * Get a single role by its document ID.
 *
 * Returns null if the role doesn't exist or the caller is not authenticated.
 */
export const getRole = query({
  args: { roleId: v.id("roles") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    return await ctx.db.get("roles", args.roleId);
  },
});

// ─── Get Role By Slug ───────────────────────────────────────────────────────

/**
 * Get a role by its slug string.
 * Useful for looking up roles by name (e.g., "administrator", "editor").
 *
 * Returns null if the role doesn't exist or the caller is not authenticated.
 */
export const getRoleBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    return await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

// ─── Get Default Role ───────────────────────────────────────────────────────

/**
 * Get the default role (typically Subscriber).
 * This is the role automatically assigned to new user registrations.
 *
 * Returns null if no default role is set or the caller is not authenticated.
 */
export const getDefaultRole = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const defaultRole = await ctx.db
      .query("roles")
      .withIndex("by_isDefault", (q) => q.eq("isDefault", true))
      .first();

    return defaultRole;
  },
});

// ─── Get Role Changes ───────────────────────────────────────────────────────

/**
 * Get the role change audit trail.
 * Returns role changes ordered by most recent first.
 *
 * Supports pagination via optional limit and cursor args.
 * Includes the user and role names for display.
 *
 * Requires authentication and role.assign capability (admin-only audit data).
 */
export const getRoleChanges = query({
  args: {
    userId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    // Role change audit trail is sensitive -- require role.assign capability
    const canView = await currentUserCan(ctx, "role.assign");
    if (!canView) return [];

    const limit = args.limit ?? 50;

    let changesQuery;
    if (args.userId) {
      // Filter by specific user
      changesQuery = ctx.db
        .query("roleChanges")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId!));
    } else {
      // All changes, most recent first
      changesQuery = ctx.db
        .query("roleChanges")
        .withIndex("by_timestamp");
    }

    const changes = await changesQuery.order("desc").take(limit);

    // Enrich with user and role names for display
    const enriched = await Promise.all(
      changes.map(async (change) => {
        const targetUser = await ctx.db.get("users", change.userId);
        const changedByUser = await ctx.db.get("users", change.changedBy);
        const newRole = await ctx.db.get("roles", change.newRoleId);
        const oldRole = change.oldRoleId
          ? await ctx.db.get("roles", change.oldRoleId)
          : null;

        return {
          ...change,
          targetUserName:
            targetUser?.displayName ||
            targetUser?.email ||
            "Unknown User",
          changedByName:
            changedByUser?.displayName ||
            changedByUser?.email ||
            "System",
          oldRoleName: oldRole?.name ?? "None",
          newRoleName: newRole?.name ?? "Unknown Role",
        };
      }),
    );

    return enriched;
  },
});
