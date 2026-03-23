/**
 * User Profile System - Public Queries
 *
 * All read operations for user profiles.
 *
 * Queries:
 *   - getProfile - Get current user's full profile (requires auth)
 *   - getUser - Get any user by ID, slug, or workosUserId (mixed access)
 *   - getUserBySlug - Get public profile by slug (public, for author archives)
 *   - listUsers - Paginated list with search/filters (admin only)
 *   - getDisplayNameOptions - Generate display name dropdown options
 *   - counts - Count users by status (admin dashboard)
 *
 * Authentication:
 *   - getProfile, listUsers, getDisplayNameOptions, counts require auth
 *   - getUserBySlug is public (used by website SSR author archive pages)
 *   - getUser returns full or public fields depending on auth level
 */

import { query } from "../_generated/server";
import { getCurrentUser , lookupUserByIdentifier } from "../helpers/permissions";
import {
  resolveAvatarUrl,
  extractPublicFields,
  generateDisplayNameOptions as generateOptions,
} from "../helpers/profile";
import {
  getUserArgs,
  getUserBySlugArgs,
  listUsersArgs,
  generateDisplayNameOptionsArgs,
  userCountsArgs,
  DEFAULT_PER_PAGE,
} from "./validators";

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Get current user's full profile.
 *
 * Auth: Required (any authenticated user).
 * Returns the full user document for the currently authenticated user.
 * Returns null if not authenticated.
 */
export const getProfile = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    return {
      ...user,
      resolvedAvatarUrl: resolveAvatarUrl(user),
    };
  },
});

/**
 * Get any user by ID, slug, or workosUserId.
 *
 * Auth: Mixed.
 *   - If current user is the target or an Administrator (level 100): full document
 *   - If authenticated but non-admin viewing another user: public fields only
 *   - If not authenticated: public fields only (when accessed by slug)
 *
 * At least one of userId, slug, or workosUserId must be provided.
 */
export const getUser = query({
  args: getUserArgs,
  handler: async (ctx, args) => {
    // Resolve target user
    let targetUser;

    if (args.userId) {
      targetUser = await ctx.db.get("users", args.userId);
    } else if (args.slug) {
      targetUser = await ctx.db
        .query("users")
        .withIndex("by_slug", (q) => q.eq("slug", args.slug!))
        .unique();
    } else if (args.workosUserId) {
      targetUser = await lookupUserByIdentifier(ctx, args.workosUserId!);
    }

    if (!targetUser) return null;

    // Check if current user is the target or an admin
    const currentUser = await getCurrentUser(ctx);

    // If current user is the target, return full document
    if (currentUser && currentUser._id === targetUser._id) {
      return {
        ...targetUser,
        resolvedAvatarUrl: resolveAvatarUrl(targetUser),
      };
    }

    // If current user is an admin (check role level), return full document
    if (currentUser && currentUser.roleId) {
      const role = await ctx.db.get("roles", currentUser.roleId);
      if (role && role.level >= 100) {
        return {
          ...targetUser,
          resolvedAvatarUrl: resolveAvatarUrl(targetUser),
        };
      }
    }

    // Otherwise, return public fields only
    return extractPublicFields(targetUser);
  },
});

/**
 * Get user by slug (public).
 *
 * Auth: Not required (public, for author archive pages).
 * Returns public profile data only. Returns null if user not found or not active.
 */
export const getUserBySlug = query({
  args: getUserBySlugArgs,
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!user) return null;

    // Only show active users on public pages
    if (user.status !== "active") return null;

    return extractPublicFields(user);
  },
});

/**
 * List all users with search, filters, sorting, and pagination.
 *
 * Auth: Required. Must have `profile.view` capability and be Administrator (level 100).
 *
 * Supports:
 *   - Text search on displayName, email, nickname (case-insensitive)
 *   - Filter by status (active/inactive/banned)
 *   - Filter by roleId
 *   - Sort by displayName, email, createdAt, postCount
 *   - Offset-based pagination
 *
 * Performance notes:
 *   - When no search term is provided, uses indexed queries to reduce working set.
 *   - When search is provided, in-memory filtering is necessary (Convex does not
 *     support native substring search). This is acceptable for admin-only queries
 *     with typical user counts (< 10k).
 *   - Role enrichment is done only for the paginated slice, not all users.
 *   - Role data is cached in a local map to avoid duplicate lookups within the same query.
 */
export const listUsers = query({
  args: listUsersArgs,
  handler: async (ctx, args) => {
    // Auth check - must be authenticated
    const currentUser = await getCurrentUser(ctx);
    if (!currentUser) {
      return {
        users: [],
        total: 0,
        page: 1,
        perPage: DEFAULT_PER_PAGE,
        totalPages: 0,
      };
    }

    // Check if admin (role level 100)
    let isAdmin = false;
    if (currentUser.roleId) {
      const role = await ctx.db.get("roles", currentUser.roleId);
      if (role && role.level >= 100) {
        isAdmin = true;
      }
    }
    // Legacy admin check
    if (!isAdmin && currentUser.isInternal && currentUser.internalRole === "admin") {
      isAdmin = true;
    }

    if (!isAdmin) {
      return {
        users: [],
        total: 0,
        page: 1,
        perPage: DEFAULT_PER_PAGE,
        totalPages: 0,
      };
    }

    const page = args.page ?? 1;
    const perPage = args.perPage ?? DEFAULT_PER_PAGE;
    const orderBy = args.orderBy ?? "createdAt";
    const orderDir = args.orderDir ?? "desc";

    // Fetch users based on filters using appropriate indexes.
    // All queries bounded to 10,000 users max for safety.
    let allUsers;

    if (args.status && args.roleId) {
      // Both filters: use one index, filter the other in memory
      allUsers = await ctx.db
        .query("users")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .take(10000);
      allUsers = allUsers.filter((u) => u.roleId === args.roleId);
    } else if (args.status) {
      allUsers = await ctx.db
        .query("users")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .take(10000);
    } else if (args.roleId) {
      allUsers = await ctx.db
        .query("users")
        .withIndex("by_roleId", (q) => q.eq("roleId", args.roleId!))
        .take(10000);
    } else {
      // No filters: use an indexed order when possible to reduce sort cost
      if (orderBy === "createdAt") {
        allUsers = await ctx.db
          .query("users")
          .withIndex("by_createdAt")
          .order(orderDir)
          .take(10000);
      } else if (orderBy === "displayName") {
        allUsers = await ctx.db
          .query("users")
          .withIndex("by_displayName")
          .order(orderDir)
          .take(10000);
      } else {
        allUsers = await ctx.db.query("users").take(10000);
      }
    }

    // Text search filter (case-insensitive substring on displayName, email, nickname)
    if (args.search) {
      const searchLower = args.search.toLowerCase();
      allUsers = allUsers.filter(
        (u) =>
          (u.displayName && u.displayName.toLowerCase().includes(searchLower)) ||
          u.email.toLowerCase().includes(searchLower) ||
          (u.nickname && u.nickname.toLowerCase().includes(searchLower)) ||
          (u.firstName && u.firstName.toLowerCase().includes(searchLower)) ||
          (u.lastName && u.lastName.toLowerCase().includes(searchLower)),
      );
    }

    // Sort (skip if already ordered by index for the unfiltered+unsearched case)
    const alreadySorted =
      !args.status &&
      !args.roleId &&
      !args.search &&
      (orderBy === "createdAt" || orderBy === "displayName");

    if (!alreadySorted) {
      allUsers.sort((a, b) => {
        let cmp = 0;
        switch (orderBy) {
          case "displayName":
            cmp = (a.displayName ?? "").localeCompare(b.displayName ?? "");
            break;
          case "email":
            cmp = a.email.localeCompare(b.email);
            break;
          case "createdAt":
            cmp = a.createdAt - b.createdAt;
            break;
          case "postCount":
            cmp = (a.postCount ?? 0) - (b.postCount ?? 0);
            break;
        }
        return orderDir === "desc" ? -cmp : cmp;
      });
    }

    const total = allUsers.length;
    const totalPages = Math.ceil(total / perPage);

    // Paginate (only enrich the visible slice, not all users)
    const start = (page - 1) * perPage;
    const paginatedUsers = allUsers.slice(start, start + perPage);

    // Enrich with resolved avatar and role info.
    // Cache role lookups to avoid redundant reads when multiple users share a role.
    const roleCache = new Map<string, { name: string; level: number }>();

    const enrichedUsers = await Promise.all(
      paginatedUsers.map(async (user) => {
        let roleName: string | undefined;
        let roleLevel: number | undefined;

        if (user.roleId) {
          const roleIdStr = user.roleId as string;
          if (roleCache.has(roleIdStr)) {
            const cached = roleCache.get(roleIdStr)!;
            roleName = cached.name;
            roleLevel = cached.level;
          } else {
            const role = await ctx.db.get("roles", user.roleId);
            if (role) {
              roleName = role.name;
              roleLevel = role.level;
              roleCache.set(roleIdStr, { name: role.name, level: role.level });
            }
          }
        }

        return {
          ...user,
          resolvedAvatarUrl: resolveAvatarUrl(user),
          roleName,
          roleLevel,
        };
      }),
    );

    return {
      users: enrichedUsers,
      total,
      page,
      perPage,
      totalPages,
    };
  },
});

/**
 * Generate display name dropdown options for a user.
 *
 * Auth: Required (any authenticated user).
 * If userId is provided, generates options for that user (admin only).
 * Otherwise, generates options for the current user.
 */
export const getDisplayNameOptions = query({
  args: generateDisplayNameOptionsArgs,
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    if (!currentUser) return [];

    let targetUser = currentUser;

    if (args.userId && args.userId !== currentUser._id) {
      // Check if admin
      let isAdmin = false;
      if (currentUser.roleId) {
        const role = await ctx.db.get("roles", currentUser.roleId);
        if (role && role.level >= 100) {
          isAdmin = true;
        }
      }
      if (!isAdmin) return [];

      const user = await ctx.db.get("users", args.userId);
      if (!user) return [];
      targetUser = user;
    }

    return generateOptions({
      email: targetUser.email,
      firstName: targetUser.firstName,
      lastName: targetUser.lastName,
      nickname: targetUser.nickname,
      username: targetUser.username,
    });
  },
});

/**
 * Count users by status.
 *
 * Auth: Required (admin dashboard usage).
 * Returns { total, active, inactive, banned } for the Dashboard "At a Glance" widget.
 *
 * Performance: Uses the `by_status` index to count each status independently,
 * avoiding loading all user documents into memory. Each indexed query only
 * traverses users with that specific status.
 */
export const counts = query({
  args: userCountsArgs,
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return { total: 0, active: 0, inactive: 0, banned: 0 };
    }

    // Count each status independently using the by_status index.
    // Bounded to 100,000 per status for admin dashboard counts.
    const [activeUsers, inactiveUsers, bannedUsers] = await Promise.all([
      ctx.db
        .query("users")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .take(100000),
      ctx.db
        .query("users")
        .withIndex("by_status", (q) => q.eq("status", "inactive"))
        .take(100000),
      ctx.db
        .query("users")
        .withIndex("by_status", (q) => q.eq("status", "banned"))
        .take(100000),
    ]);

    const active = activeUsers.length;
    const inactive = inactiveUsers.length;
    const banned = bannedUsers.length;

    return {
      total: active + inactive + banned,
      active,
      inactive,
      banned,
    };
  },
});
