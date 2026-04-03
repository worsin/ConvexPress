/**
 * User Profile System - Internal Functions
 *
 * Functions that are NOT callable from the client. Used for system-to-system
 * communication, event-driven updates, and data migration.
 *
 * Internal functions:
 *   - updatePostCount - Recalculate a user's published post count
 *   - updateCommentCount - Recalculate a user's comment count
 *   - generateSlugForUser - Generate a unique slug for a user
 *   - ensureSlug - Generate slugs for users who don't have one (migration)
 *   - updateLastLogin - Update lastLoginAt timestamp
 */

import { getUserIdentifier } from "../helpers/permissions";
import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import {
  generateSlug,
  ensureUniqueSlug,
  generateDisplayName,
  resolveAvatarUrl,
} from "../helpers/profile";
import {
  listUsersArgs,
  DEFAULT_PER_PAGE,
} from "./validators";

// ─── Denormalized Count Updates ─────────────────────────────────────────────

/**
 * Recalculate a user's published post count.
 *
 * Called by the Post System when posts are published, unpublished,
 * trashed, restored, or deleted. Uses the event system:
 *   - post.published -> increment
 *   - post.unpublished -> decrement
 *   - post.deleted -> decrement
 *
 * For accuracy, we count directly rather than incrementing/decrementing,
 * which avoids drift from race conditions or missed events.
 */
export const updatePostCount = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (!user) return;

    // Count published posts by this user
    // NOTE: Posts table may not exist yet during incremental development.
    // When it does, the query should filter by authorId and status = "publish".
    let postCount = 0;
    try {
      const posts = await ctx.db
        .query("posts")
        .withIndex("by_author", (q) => q.eq("authorId", args.userId))
        .collect();

      postCount = posts.filter((p) => p.status === "publish").length;
    } catch {
      // Posts table doesn't exist yet; leave count at 0
    }

    await ctx.db.patch("users", args.userId, {
      postCount,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Recalculate a user's comment count.
 *
 * Called by the Comment System when comments are created, deleted,
 * approved, or rejected.
 */
export const updateCommentCount = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (!user) return;

    // Count approved comments by this user.
    // Comments store authorId as a user identifier string.
    let commentCount = 0;
    try {
      const userId = getUserIdentifier(user);
      if (userId) {
        const comments = await ctx.db
          .query("comments")
          .withIndex("by_author", (q) => q.eq("authorId", userId))
          .collect();

        commentCount = comments.filter(
          (c) => c.status === "approved",
        ).length;
      }
    } catch {
      // Comments table doesn't exist yet; leave count at 0
    }

    await ctx.db.patch("users", args.userId, {
      commentCount,
      updatedAt: Date.now(),
    });
  },
});

// ─── Slug Management ────────────────────────────────────────────────────────

/**
 * Generate a unique slug for a user.
 *
 * Called internally when a user is first created or when their slug
 * needs to be regenerated. Uses the display name as the base.
 */
export const generateSlugForUser = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (!user) return null;

    // Don't regenerate if slug already exists
    if (user.slug) return user.slug;

    const displayName =
      user.displayName ??
      generateDisplayName(user.firstName, user.lastName, user.email, user.username);

    const baseSlug = generateSlug(displayName);
    const uniqueSlug = await ensureUniqueSlug(ctx, baseSlug, args.userId);

    await ctx.db.patch("users", args.userId, {
      slug: uniqueSlug,
      updatedAt: Date.now(),
    });

    return uniqueSlug;
  },
});

/**
 * Ensure all users have slugs (migration helper).
 *
 * Iterates over all users and generates slugs for those who don't have one.
 * Safe to run multiple times (idempotent).
 */
export const ensureSlug = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allUsers = await ctx.db.query("users").collect();

    let updated = 0;
    for (const user of allUsers) {
      if (user.slug) continue; // Already has a slug

      const displayName =
        user.displayName ??
        generateDisplayName(
          user.firstName,
          user.lastName,
          user.email,
          user.username,
        );

      const baseSlug = generateSlug(displayName);
      const uniqueSlug = await ensureUniqueSlug(ctx, baseSlug, user._id);

      await ctx.db.patch("users", user._id, {
        slug: uniqueSlug,
        updatedAt: Date.now(),
      });

      updated++;
    }

    return { updated };
  },
});

// ─── Login Tracking ─────────────────────────────────────────────────────────

/**
 * Update the lastLoginAt timestamp.
 *
 * Called by the Auth System on successful login.
 */
export const updateLastLogin = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (!user) return;

    await ctx.db.patch("users", args.userId, {
      lastLoginAt: Date.now(),
    });
  },
});

// ─── Lookup Helpers ─────────────────────────────────────────────────────────

/**
 * Get a user by email.
 *
 * Used internally for lookups where only email is known
 * (e.g., comment author matching for logged-out users).
 */
export const getByEmail = internalQuery({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
  },
});

/**
 * Recalculate all users' post and comment counts.
 *
 * Migration/maintenance helper. Iterates all users and recalculates
 * their denormalized counts. Use sparingly (expensive for large user bases).
 */
export const recalculateAllCounts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allUsers = await ctx.db.query("users").collect();

    let updated = 0;
    for (const user of allUsers) {
      let postCount = 0;
      let commentCount = 0;

      // Count posts
      try {
        const posts = await ctx.db
          .query("posts")
          .withIndex("by_author", (q) => q.eq("authorId", user._id))
          .collect();
        postCount = posts.filter((p) => p.status === "publish").length;
      } catch {
        // Posts table doesn't exist yet
      }

      // Count comments
      // Comments store authorId as a user identifier string
      try {
        const userIdStr = getUserIdentifier(user);
        if (userIdStr) {
          const comments = await ctx.db
            .query("comments")
            .withIndex("by_author", (q) => q.eq("authorId", userId))
            .collect();
          commentCount = comments.filter(
            (c) => c.status === "approved",
          ).length;
        }
      } catch {
        // Comments table doesn't exist yet
      }

      await ctx.db.patch("users", user._id, {
        postCount,
        commentCount,
        updatedAt: Date.now(),
      });

      updated++;
    }

    return { updated };
  },
});

// ─── API-Facing Internal Queries ─────────────────────────────────────────────

/**
 * List users without requiring Convex session auth.
 *
 * Used by the HTTP API layer (httpAction handlers) where the caller
 * has already been authenticated via API key. HTTP actions don't carry
 * a Convex auth session, so the public listUsers query (which calls
 * getCurrentUser) returns empty results. This internal query replicates
 * the same filtering, sorting, pagination, and enrichment logic but
 * skips the auth check entirely -- permission verification is the
 * responsibility of the calling httpAction via authenticateApiRequest().
 */
export const listUsersInternal = internalQuery({
  args: listUsersArgs,
  handler: async (ctx, args) => {
    const page = args.page ?? 1;
    const perPage = args.perPage ?? DEFAULT_PER_PAGE;
    const orderBy = args.orderBy ?? "createdAt";
    const orderDir = args.orderDir ?? "desc";

    // Fetch users based on filters using appropriate indexes
    let allUsers;

    if (args.status && args.roleId) {
      allUsers = await ctx.db
        .query("users")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
      allUsers = allUsers.filter((u) => u.roleId === args.roleId);
    } else if (args.status) {
      allUsers = await ctx.db
        .query("users")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else if (args.roleId) {
      allUsers = await ctx.db
        .query("users")
        .withIndex("by_roleId", (q) => q.eq("roleId", args.roleId!))
        .collect();
    } else {
      if (orderBy === "createdAt") {
        allUsers = await ctx.db
          .query("users")
          .withIndex("by_createdAt")
          .order(orderDir)
          .collect();
      } else if (orderBy === "displayName") {
        allUsers = await ctx.db
          .query("users")
          .withIndex("by_displayName")
          .order(orderDir)
          .collect();
      } else {
        allUsers = await ctx.db.query("users").collect();
      }
    }

    // Text search filter
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

    // Sort
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
    const start = (page - 1) * perPage;
    const paginatedUsers = allUsers.slice(start, start + perPage);

    // Enrich with resolved avatar and role info
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
 * Get a single user by ID without requiring Convex session auth.
 *
 * Used by the HTTP API layer (httpAction handlers) where the caller
 * has already been authenticated via API key with read:users scope.
 * Always returns the full user document (since the API caller is
 * already authorized). Returns null if the user doesn't exist.
 */
export const getUserInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (!user) return null;

    // Resolve role info
    let roleName: string | undefined;
    let roleLevel: number | undefined;
    if (user.roleId) {
      const role = await ctx.db.get("roles", user.roleId);
      if (role) {
        roleName = role.name;
        roleLevel = role.level;
      }
    }

    return {
      ...user,
      resolvedAvatarUrl: resolveAvatarUrl(user),
      roleName,
      roleLevel,
    };
  },
});

