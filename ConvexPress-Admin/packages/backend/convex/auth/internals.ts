/**
 * Auth System - Internal Functions
 *
 * Internal (non-client-callable) Convex functions for the auth system.
 * These run in the Convex runtime — NO process.env access.
 *
 * Called by HTTP actions (login, refresh) via ctx.runQuery / ctx.runMutation.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

// ─── User Lookups ─────────────────────────────────────────────────────────────

/**
 * Find a local-auth user by email or username.
 * Returns null if the user doesn't exist or uses a non-local auth source.
 */
export const findLocalUser = internalQuery({
  args: {
    email: v.optional(v.string()),
    username: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let user = null;

    if (args.email) {
      user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.email!))
        .first();
    }

    if (!user && args.username) {
      user = await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("username", args.username!))
        .first();
    }

    // Only return users with local auth source
    if (user && user.authSource !== "local") return null;

    return user;
  },
});

/**
 * Get a user by their Convex document ID.
 */
export const getUserById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

// ─── Rate Limiting / Lockout ──────────────────────────────────────────────────

/**
 * Check if an identifier (email/username) or IP is currently locked out
 * due to too many failed login attempts.
 *
 * Thresholds:
 *   - 5+ failures for the same identifier within 15 minutes → locked
 *   - 20+ failures from the same IP within 5 minutes → locked
 */
export const checkLockout = internalQuery({
  args: {
    identifier: v.string(),
    ip: v.string(),
  },
  handler: async (ctx, args) => {
    const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    // Check account-level lockout (by email/username)
    const accountFailures = await ctx.db
      .query("failedLoginAttempts")
      .withIndex("by_email", (q) =>
        q.eq("email", args.identifier).gte("attemptedAt", fifteenMinutesAgo),
      )
      .collect();

    if (accountFailures.length >= 5) return true;

    // Check IP-level lockout
    const ipFailures = await ctx.db
      .query("failedLoginAttempts")
      .withIndex("by_ip", (q) =>
        q.eq("ip", args.ip).gte("attemptedAt", fiveMinutesAgo),
      )
      .collect();

    if (ipFailures.length >= 20) return true;

    return false;
  },
});

// ─── Refresh Token Management ─────────────────────────────────────────────────

/**
 * Insert a new refresh token record.
 */
export const createRefreshToken = internalMutation({
  args: {
    tokenHash: v.string(),
    userId: v.id("users"),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("refreshTokens", {
      tokenHash: args.tokenHash,
      userId: args.userId,
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
    });
  },
});

/**
 * Find a refresh token by its SHA-256 hash.
 */
export const findRefreshToken = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("refreshTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
  },
});

/**
 * Revoke a refresh token by marking it with a revokedAt timestamp.
 * Implements token rotation — the old token is invalidated immediately.
 */
export const revokeRefreshToken = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query("refreshTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    if (token) {
      await ctx.db.patch(token._id, { revokedAt: Date.now() });
    }
  },
});

// ─── Password Management ──────────────────────────────────────────────────────

/**
 * Update a user's password hash and track when the change occurred.
 * Called by the password reset and change-password flows.
 */
export const setPasswordHash = internalMutation({
  args: {
    userId: v.id("users"),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      passwordHash: args.passwordHash,
      lastPasswordChangedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// ─── First Admin Setup ────────────────────────────────────────────────────────

/**
 * Check whether any administrator user already exists.
 * Used by the createFirstAdmin action to guard against duplicate admins.
 */
export const checkExistingAdmins = internalQuery({
  args: {},
  handler: async (ctx) => {
    const adminRole = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", "administrator"))
      .unique();
    if (!adminRole) return false;

    const admin = await ctx.db
      .query("users")
      .withIndex("by_roleId", (q) => q.eq("roleId", adminRole._id))
      .first();

    return !!admin;
  },
});

/**
 * Insert a new administrator user with a pre-hashed password.
 * Only called by the createFirstAdmin action after confirming no admins exist.
 */
export const createAdminUser = internalMutation({
  args: {
    email: v.string(),
    username: v.string(),
    passwordHash: v.string(),
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    const adminRole = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", "administrator"))
      .unique();

    const now = Date.now();

    return await ctx.db.insert("users", {
      authSource: "local",
      email: args.email,
      username: args.username,
      passwordHash: args.passwordHash,
      displayName: args.displayName,
      slug: args.username.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      emailVerified: true,
      status: "active",
      roleId: adminRole?._id,
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});
