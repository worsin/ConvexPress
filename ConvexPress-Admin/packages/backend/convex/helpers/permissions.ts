/**
 * Role & Capability System - Core Permission Helpers
 *
 * THE most critical authorization layer in ConvexPress.
 * Every protected mutation and query should use these helpers.
 *
 * Architecture:
 *   1. User authenticates via local admin auth or Clerk
 *   2. User record has a roleId pointing to a role document
 *   3. Role document has capabilities[] array
 *   4. Permission checks verify the user's role includes the required capability
 *
 * Dual-auth support:
 *   - Admin users authenticate locally (JWT issued by ConvexPress, subject = Convex _id)
 *   - Website users authenticate via Clerk (subject = Clerk user ID)
 *
 * Migration support:
 *   - Users may still have legacy `internalRole` string field instead of `roleId`
 *   - The system falls back to legacy role lookup via slug when `roleId` is absent
 *   - Once all users are migrated, the legacy path can be removed
 *
 * Usage:
 *   import { requireCan, currentUserCan } from "../helpers/permissions";
 *
 *   // Throwing - use in mutations
 *   const user = await requireCan(ctx, "post.create");
 *
 *   // Non-throwing - use in queries for conditional rendering
 *   const canEdit = await currentUserCan(ctx, "post.update");
 *
 *   // Ownership-aware (meta-capabilities)
 *   const user = await requireCanOnResource(ctx, "post.edit", postDoc._id);
 */

import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  isMetaCapability,
  META_TO_CONCRETE,
} from "../types/capabilities";
import type { AnyCapability, Capability } from "../types/capabilities";
import { LEGACY_ROLE_MAP } from "../seed/roles";

const ADMIN_ISSUER = "https://convexpress-admin.local";

// ─── Types ──────────────────────────────────────────────────────────────────

/** The user document shape as returned from the users table. */
type UserDoc = {
  _id: Id<"users">;
  _creationTime: number;
  // Auth fields
  authSource?: "local" | "clerk";
  passwordHash?: string;
  clerkUserId?: string;
  email: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  phone?: string;
  profilePictureUrl?: string;
  // ConvexPress-managed profile fields
  username?: string;
  nickname?: string;
  displayName?: string;
  slug?: string;
  bio?: string;
  url?: string;
  avatarUrl?: string;
  avatarMediaId?: Id<"media">;
  avatarStorageId?: string;
  // Social links
  socialLinks?: {
    twitter?: string;
    facebook?: string;
    instagram?: string;
    linkedin?: string;
    youtube?: string;
    github?: string;
    website?: string;
  };
  // Role & capability
  roleId?: Id<"roles">;
  // Account status
  status: "active" | "inactive" | "banned";
  deactivatedAt?: number;
  deactivatedBy?: Id<"users">;
  // Preferences
  preferences?: {
    adminColorScheme?: string;
    showAdminBar?: boolean;
    editorMode?: "visual" | "code";
    emailDigest?: "immediate" | "daily" | "weekly" | "none";
    notifyOnComment?: boolean;
    notifyOnReply?: boolean;
    notifyOnMention?: boolean;
  };
  // Locale & timezone
  locale?: string;
  timezone?: string;
  // Denormalized counts
  postCount?: number;
  commentCount?: number;
  // Registration metadata
  registrationMethod?: string;
  invitedBy?: Id<"users">;
  emailVerifiedAt?: number;
  registeredAt?: number;
  // Metadata
  lastLoginAt?: number;
  // Password management
  lastPasswordChangedAt?: number;
  passwordResetRequestedAt?: number;
  passwordResetCount?: number;
  // Legacy fields
  internalRole?: string;
  isInternal?: boolean;
  // Timestamps
  createdAt: number;
  updatedAt: number;
};

/** The role document shape as returned from the roles table. */
type RoleDoc = {
  _id: Id<"roles">;
  _creationTime: number;
  name: string;
  slug: string;
  description: string;
  level: number;
  type: "internal" | "customer" | "system";
  isDefault: boolean;
  isProtected: boolean;
  capabilities: string[];
  pageAccess: string[];
  status: "active" | "inactive";
  createdAt: number;
  updatedAt: number;
  createdBy?: Id<"users">;
};

// ─── User Retrieval ─────────────────────────────────────────────────────────

/**
 * Get the current authenticated user from the database.
 * Supports dual-auth: local admin JWT (subject = Convex _id) and Clerk (subject = Clerk user ID).
 *
 * @returns User document or null if not authenticated / not found.
 */
export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx,
): Promise<UserDoc | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  // tokenIdentifier format: "issuer|subject"
  const isAdminAuth = identity.tokenIdentifier.startsWith(ADMIN_ISSUER + "|");

  if (isAdminAuth) {
    // Admin local auth — subject is Convex user _id (direct fetch, O(1))
    const user = await ctx.db.get(identity.subject as Id<"users">);
    return user as UserDoc | null;
  }

  // Clerk auth — subject is Clerk user ID
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) =>
      q.eq("clerkUserId", identity.subject),
    )
    .unique();

  return user as UserDoc | null;
}

/**
 * Get the current user's Convex document ID.
 *
 * @returns User ID or null if not authenticated.
 */
export async function getCurrentUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users"> | null> {
  const user = await getCurrentUser(ctx);
  return user?._id ?? null;
}

// ─── Role Resolution ────────────────────────────────────────────────────────

/**
 * Resolve the role document for a user.
 *
 * Resolution order:
 *   1. Direct roleId reference (new system)
 *   2. Legacy internalRole string -> slug lookup via LEGACY_ROLE_MAP (migration)
 *   3. null (no role assigned)
 */
async function resolveUserRole(
  ctx: QueryCtx | MutationCtx,
  user: Pick<UserDoc, "roleId" | "internalRole">,
): Promise<RoleDoc | null> {
  // Path 1: Direct roleId (new system)
  if (user.roleId) {
    const role = await ctx.db.get("roles", user.roleId);
    if (!role) {
      // Role was deleted -- fall through to legacy as a migration path
      // (this handles the case where roleId references a removed role)
    } else if (role.status !== "active") {
      // Role exists but is inactive -- deny access entirely.
      // Do NOT fall through to legacy, as that could silently UPGRADE
      // permissions if the legacy role maps to a higher-privilege active role.
      return null;
    } else {
      return role as RoleDoc;
    }
  }

  // Path 2: Legacy internalRole string (migration path)
  // Only reached if user has no roleId, or roleId references a deleted role.
  if (user.internalRole) {
    const newSlug = LEGACY_ROLE_MAP[user.internalRole] ?? user.internalRole;
    const role = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", newSlug))
      .unique();
    if (role && role.status === "active") {
      return role as RoleDoc;
    }
  }

  return null;
}

/**
 * Get the capabilities array for a user's resolved role.
 */
async function getUserCapabilities(
  ctx: QueryCtx | MutationCtx,
  user: Pick<UserDoc, "roleId" | "internalRole">,
): Promise<string[]> {
  const role = await resolveUserRole(ctx, user);
  return role?.capabilities ?? [];
}

// ─── Permission Checks ──────────────────────────────────────────────────────

/**
 * Non-throwing capability check for the current authenticated user.
 * Returns true if the user has the specified capability.
 *
 * Use in queries for conditional UI rendering:
 *   const canPublish = await currentUserCan(ctx, "post.publish");
 *
 * @param ctx - Query or mutation context
 * @param capability - The capability string to check
 * @returns true if user is authenticated, active, and has the capability
 */
export async function currentUserCan(
  ctx: QueryCtx | MutationCtx,
  capability: Capability,
): Promise<boolean> {
  const user = await getCurrentUser(ctx);
  if (!user) return false;
  if (user.status !== "active") return false;

  const capabilities = await getUserCapabilities(ctx, user);
  return capabilities.includes(capability);
}

/**
 * Non-throwing capability check for a specific user by ID.
 *
 * @param ctx - Query or mutation context
 * @param userId - The user ID to check
 * @param capability - The capability string to check
 * @returns true if the user exists, is active, and has the capability
 */
export async function userCan(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  capability: Capability,
): Promise<boolean> {
  const user = await ctx.db.get("users", userId);
  if (!user) return false;
  if (user.status !== "active") return false;

  const capabilities = await getUserCapabilities(ctx, user as UserDoc);
  return capabilities.includes(capability);
}

/**
 * Throwing capability check. Returns the user document on success.
 * Throws ConvexError with structured code on failure.
 *
 * Use in mutations that require authorization:
 *   const user = await requireCan(ctx, "post.create");
 *
 * @param ctx - Query or mutation context
 * @param capability - The capability string to require
 * @returns The authenticated user document
 * @throws ConvexError with code "UNAUTHORIZED" if not authenticated
 * @throws ConvexError with code "FORBIDDEN" if user lacks the capability
 */
export async function requireCan(
  ctx: QueryCtx | MutationCtx,
  capability: Capability,
): Promise<UserDoc> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }

  if (user.status !== "active") {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Account is not active",
    });
  }

  const role = await resolveUserRole(ctx, user);
  const capabilities = role?.capabilities ?? [];
  if (!capabilities.includes(capability)) {
    // Log details server-side for debugging; return generic message to client
    console.warn(`Access denied: user=${user._id} capability=${capability} role=${role?.slug ?? "none"}`);
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Insufficient permissions",
    });
  }

  return user;
}

// ─── Meta-Capability Resolution ─────────────────────────────────────────────

/**
 * Resolve a meta-capability to a concrete capability, applying ownership logic.
 *
 * Meta-capabilities like "post.edit" check if the user owns the resource.
 * If the user is the owner, they only need the concrete capability (post.update).
 * If they are NOT the owner, they need the concrete capability AND their role
 * level must indicate they can manage others' content (typically Editor+).
 *
 * This function returns the concrete capability that should be checked,
 * or null if the user fails the ownership/level check.
 *
 * @param ctx - Query or mutation context
 * @param capability - The meta-capability to resolve
 * @param userId - The user performing the action
 * @param resourceId - The resource being acted upon (any table)
 */
export async function mapMetaCap(
  ctx: QueryCtx | MutationCtx,
  capability: AnyCapability,
  userId: Id<"users">,
  resourceId?: Id<"posts"> | Id<"pages"> | Id<"media"> | Id<"comments">,
): Promise<Capability | null> {
  // If it's not a meta-capability, return as-is
  if (!isMetaCapability(capability)) {
    return capability as Capability;
  }

  const concreteCap = META_TO_CONCRETE[capability];
  if (!concreteCap) return null;

  // If no resource specified, require the concrete capability directly
  if (!resourceId) return concreteCap;

  // Determine the table from the capability domain prefix.
  // The meta-capability's domain (e.g., "post" in "post.edit") maps to a table.
  const domain = capability.split(".")[0];
  const TABLE_MAP: Record<string, "posts" | "pages" | "media" | "comments"> = {
    post: "posts",
    page: "pages",
    media: "media",
    comment: "comments",
    seo: "posts", // SEO meta-caps operate on posts
    custom_field: "posts", // Custom field meta-caps operate on posts
  };
  const tableName = TABLE_MAP[domain];

  // Try to load the resource to check ownership
  try {
    let resource: Record<string, unknown> | null = null;
    if (tableName === "posts") {
      resource = await ctx.db.get("posts", resourceId as Id<"posts">);
    } else if (tableName === "pages") {
      resource = await ctx.db.get("pages", resourceId as Id<"pages">);
    } else if (tableName === "media") {
      resource = await ctx.db.get("media", resourceId as Id<"media">);
    } else if (tableName === "comments") {
      resource = await ctx.db.get("comments", resourceId as Id<"comments">);
    }

    if (!resource) return concreteCap; // Resource not found, fall back to direct check

    // Check ownership - different tables use different field names
    // Type assertion with the specific owner fields we're checking
    type ResourceOwnerFields = {
      authorId?: Id<"users">;
      userId?: string;
      uploadedBy?: Id<"users">;
      createdBy?: Id<"users">;
    };
    const typedResource = resource as ResourceOwnerFields;
    const ownerField =
      typedResource.authorId ??
      typedResource.userId ??
      typedResource.uploadedBy ??
      typedResource.createdBy;

    if (ownerField && ownerField === userId) {
      // User owns the resource - just need the concrete capability
      return concreteCap;
    }

    // User doesn't own the resource - they need the concrete capability
    // AND their role must be Editor-level (80+) to manage others' content
    const user = await ctx.db.get("users", userId);
    if (!user) return null;

    const role = await resolveUserRole(ctx, user);
    if (!role || role.level < 80) return null;

    return concreteCap;
  } catch {
    // Invalid ID format or other error - deny access rather than silently allowing.
    // If the resource ID is invalid, we cannot verify ownership, so we must deny.
    return null;
  }
}

/**
 * Throwing ownership-aware capability check.
 * Resolves meta-capabilities and checks ownership before authorizing.
 *
 * Use for resource-level operations:
 *   const user = await requireCanOnResource(ctx, "post.edit", post._id);
 *
 * @param ctx - Query or mutation context
 * @param capability - The capability (can be meta) to check
 * @param resourceId - The resource ID to check ownership against
 * @returns The authenticated user document
 * @throws ConvexError with appropriate code on failure
 */
export async function requireCanOnResource(
  ctx: QueryCtx | MutationCtx,
  capability: AnyCapability,
  resourceId: Id<"posts"> | Id<"pages"> | Id<"media"> | Id<"comments">,
): Promise<UserDoc> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }

  if (user.status !== "active") {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Account is not active",
    });
  }

  const userRole = await resolveUserRole(ctx, user);
  const resolvedCap = await mapMetaCap(ctx, capability, user._id, resourceId);
  if (!resolvedCap) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: `Missing capability: ${capability} (resolved: access denied)`,
      capability,
      role: userRole?.slug ?? "none",
    });
  }

  const capabilities = userRole?.capabilities ?? [];
  if (!capabilities.includes(resolvedCap)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: `Missing capability: ${resolvedCap}`,
      capability: resolvedCap,
      role: userRole?.slug ?? "none",
    });
  }

  return user;
}

// ─── Role Level Helpers ─────────────────────────────────────────────────────

/**
 * Get the current user's role level (0-100).
 *
 * @returns Role level number, or 0 if not authenticated / no role.
 */
export async function getCurrentRoleLevel(
  ctx: QueryCtx | MutationCtx,
): Promise<number> {
  const user = await getCurrentUser(ctx);
  if (!user) return 0;

  const role = await resolveUserRole(ctx, user);
  return role?.level ?? 0;
}

/**
 * Check if the current user's role level meets or exceeds a minimum.
 *
 * @param ctx - Query or mutation context
 * @param minLevel - Minimum role level required (e.g., 80 for Editor)
 * @returns true if user's role level >= minLevel
 */
export async function hasMinimumRoleLevel(
  ctx: QueryCtx | MutationCtx,
  minLevel: number,
): Promise<boolean> {
  const level = await getCurrentRoleLevel(ctx);
  return level >= minLevel;
}

/**
 * Require the current user to have at minimum a given role level.
 *
 * @throws ConvexError if user doesn't meet the minimum level
 */
export async function requireMinimumRoleLevel(
  ctx: QueryCtx | MutationCtx,
  minLevel: number,
): Promise<UserDoc> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }

  const role = await resolveUserRole(ctx, user);
  const level = role?.level ?? 0;

  if (level < minLevel) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: `Role level ${minLevel}+ required (current: ${level})`,
    });
  }

  return user;
}

// ─── Convenience Exports ────────────────────────────────────────────────────

/**
 * Require authentication (no capability check).
 * Use when you just need a valid, active user.
 */
export async function requireAuth(
  ctx: QueryCtx | MutationCtx,
): Promise<UserDoc> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }
  if (user.status !== "active") {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Account is not active",
    });
  }
  return user;
}

/**
 * Resolve a user's role document. Exported for use in role management mutations.
 */
export { resolveUserRole };

// ─── User Identifier Helper ──────────────────────────────────────────────────

/**
 * Get the best available string identifier for a user.
 *
 * Users may have a clerkUserId (website auth) or only their Convex _id
 * (local admin auth). Many subsystems (comments, notifications, audit logs,
 * etc.) store a string identifier for the acting user. This helper returns
 * the best available one.
 *
 * Priority: clerkUserId > _id (as string)
 *
 * @param user - A user document (or partial with the relevant fields)
 * @returns A string identifier for the user
 */
export function getUserIdentifier(
  user: Pick<UserDoc, "_id"> & { clerkUserId?: string },
): string {
  return user.clerkUserId ?? user._id;
}

/**
 * Look up a user by any identifier string (clerkUserId or Convex _id).
 *
 * Events and other records may store user identifiers from different auth
 * sources. This helper tries all lookup strategies.
 *
 * @param ctx - Query or mutation context
 * @param identifier - A string that could be a clerkUserId or Convex _id
 * @returns User document or null
 */
export async function lookupUserByIdentifier(
  ctx: QueryCtx | MutationCtx,
  identifier: string,
): Promise<UserDoc | null> {
  // Try clerkUserId
  const byClerk = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identifier))
    .unique();
  if (byClerk) return byClerk as UserDoc;

  // Try as a direct Convex document ID
  try {
    const byId = await ctx.db.get(identifier as Id<"users">);
    if (byId) return byId as UserDoc;
  } catch {
    // Invalid ID format - not a Convex ID
  }

  return null;
}
