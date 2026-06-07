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
import { hasActiveAdmin } from "./adminPresence";

const FIRST_ADMIN_SETUP_TOKEN_STATE_KEY = "first_admin_setup_token_consumed";

async function canUseAdminLocalAuth(
  ctx: { db: any },
  user: { isInternal?: boolean; roleId?: unknown },
): Promise<boolean> {
  if (user.roleId) {
    const role = await ctx.db.get("roles", user.roleId);
    return !!role && role.status === "active" && role.type === "internal";
  }

  return user.isInternal === true;
}

// ─── User Lookups ─────────────────────────────────────────────────────────────

/**
 * Find a local-auth user by email or username.
 * Returns null if the user doesn't exist or uses a non-local auth source.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const findLocalUser = internalQuery({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    email: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    username: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    let user = null;

    if (args.email) {
      user = await ctx.db
        .query("users")
        .withIndex("by_email", (q: ConvexQueryBuilder) => q.eq("email", args.email!))
        .first();
    }

    if (!user && args.username) {
      user = await ctx.db
        .query("users")
        .withIndex("by_username", (q: ConvexQueryBuilder) => q.eq("username", args.username!))
        .first();
    }

    // Only return users with local auth source
    if (user && user.authSource !== "local") return null;

    if (!user) return null;

    const adminLoginAllowed = await canUseAdminLocalAuth(ctx, user);
    return { ...user, adminLoginAllowed };
  },
});

/**
 * Get a local-auth user by their Convex document ID and annotate whether
 * they can continue using the admin local-auth session.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getLocalSessionUserById = internalQuery({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { userId: v.id("users") },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (!user || user.authSource !== "local") return null;

    const adminLoginAllowed = await canUseAdminLocalAuth(ctx, user);
    return { ...user, adminLoginAllowed };
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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const checkLockout = internalQuery({
  args: {
    identifier: v.string(),
    ip: v.string(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    // Check account-level lockout (by email/username)
    const accountFailures = await ctx.db
      .query("failedLoginAttempts")
      .withIndex("by_email", (q: ConvexQueryBuilder) =>
        q.eq("email", args.identifier).gte("attemptedAt", fifteenMinutesAgo),
      )
      .collect();

    if (accountFailures.length >= 5) return true;

    // Check IP-level lockout
    const ipFailures = await ctx.db
      .query("failedLoginAttempts")
      .withIndex("by_ip", (q: ConvexQueryBuilder) =>
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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const createRefreshToken = internalMutation({
  args: {
    tokenHash: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    userId: v.id("users"),
    expiresAt: v.number(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const findRefreshToken = internalQuery({
  args: { tokenHash: v.string() },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    return await ctx.db
      .query("refreshTokens")
      .withIndex("by_tokenHash", (q: ConvexQueryBuilder) => q.eq("tokenHash", args.tokenHash))
      .first();
  },
});

/**
 * Revoke a refresh token by marking it with a revokedAt timestamp.
 * Implements token rotation — the old token is invalidated immediately.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const revokeRefreshToken = internalMutation({
  args: { tokenHash: v.string() },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query("refreshTokens")
      .withIndex("by_tokenHash", (q: ConvexQueryBuilder) => q.eq("tokenHash", args.tokenHash))
      .first();
    if (token) {
      await ctx.db.patch("refreshTokens", token._id, { revokedAt: Date.now() });
    }
  },
});

// ─── Password Management ──────────────────────────────────────────────────────

/**
 * Update a user's password hash and track when the change occurred.
 * Called by the password reset and change-password flows.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const setPasswordHash = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    userId: v.id("users"),
    passwordHash: v.string(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await ctx.db.patch("users", args.userId, {
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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const checkExistingAdmins = internalQuery({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    return await hasActiveAdmin(ctx);
  },
});

/**
 * Insert a new administrator user with a pre-hashed password.
 * Only called by the createFirstAdmin action after confirming no admins exist.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const createAdminUser = internalMutation({
  args: {
    email: v.string(),
    username: v.string(),
    passwordHash: v.string(),
    displayName: v.string(),
    setupTokenRequired: v.boolean(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    setupTokenHash: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (await hasActiveAdmin(ctx)) {
      throw new Error("An administrator account already exists");
    }

    if (args.setupTokenRequired) {
      if (!args.setupTokenHash) {
        throw new Error("First-admin setup token is invalid or missing.");
      }

      const consumed = await ctx.db
        .query("authSetupState")
        .withIndex("by_setupTokenHash", (q: ConvexQueryBuilder) =>
          q.eq("setupTokenHash", args.setupTokenHash),
        )
        .first();

      if (consumed) {
        throw new Error(
          "First-admin setup token has already been used. Re-run desktop setup to rotate the setup token.",
        );
      }
    }

    const adminRole = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q: ConvexQueryBuilder) => q.eq("slug", "administrator"))
      .unique();
    if (!adminRole) {
      throw new Error("Administrator role is not seeded");
    }

    const now = Date.now();
    const slug = args.username.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q: ConvexQueryBuilder) => q.eq("email", args.email))
      .first();
    const existingUsername = await ctx.db
      .query("users")
      .withIndex("by_username", (q: ConvexQueryBuilder) => q.eq("username", args.username))
      .first();

    if (
      existingUsername &&
      (!existing || existingUsername._id !== existing._id)
    ) {
      throw new Error("Username is already in use");
    }

    if (existing) {
      await ctx.db.patch("users", existing._id, {
        authSource: "local",
        username: args.username,
        passwordHash: args.passwordHash,
        displayName: args.displayName,
        slug,
        emailVerified: true,
        status: "active",
        isInternal: true,
        internalRole: "admin",
        roleId: adminRole._id,
        clerkProvisioningStatus: "skipped",
        clerkProvisioningSource: "first_admin",
        clerkProvisioningReason: "local_admin_auth_only",
        registrationMethod: existing.registrationMethod ?? "self",
        registeredAt: existing.registeredAt ?? now,
        updatedAt: now,
      });
      if (args.setupTokenRequired) {
        await ctx.db.insert("authSetupState", {
          key: FIRST_ADMIN_SETUP_TOKEN_STATE_KEY,
          setupTokenHash: args.setupTokenHash,
          createdAt: now,
          consumedAt: now,
        });
      }
      return existing._id;
    }

    const userId = await ctx.db.insert("users", {
      authSource: "local",
      email: args.email,
      username: args.username,
      passwordHash: args.passwordHash,
      displayName: args.displayName,
      slug,
      emailVerified: true,
      status: "active",
      isInternal: true,
      internalRole: "admin",
      roleId: adminRole._id,
      clerkProvisioningStatus: "skipped",
      clerkProvisioningSource: "first_admin",
      clerkProvisioningReason: "local_admin_auth_only",
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });

    if (args.setupTokenRequired) {
      await ctx.db.insert("authSetupState", {
        key: FIRST_ADMIN_SETUP_TOKEN_STATE_KEY,
        setupTokenHash: args.setupTokenHash,
        createdAt: now,
        consumedAt: now,
      });
    }

    return userId;
  },
});
