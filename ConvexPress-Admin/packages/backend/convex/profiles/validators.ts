/**
 * User Profile System - Shared Argument Validators
 *
 * Reusable validator objects for profile mutations and queries.
 * Centralizes validation logic so mutations.ts and queries.ts stay DRY.
 */

import { v } from "convex/values";

// ─── Shared Value Validators ────────────────────────────────────────────────

/** User account status values. */
export const userStatusValidator = v.union(
  v.literal("active"),
  v.literal("inactive"),
  v.literal("banned"),
);

/** Social links object structure. */
export const socialLinksValidator = v.object({
  twitter: v.optional(v.string()),
  facebook: v.optional(v.string()),
  instagram: v.optional(v.string()),
  linkedin: v.optional(v.string()),
  youtube: v.optional(v.string()),
  github: v.optional(v.string()),
  website: v.optional(v.string()),
});

/** User preferences object structure. */
export const preferencesValidator = v.object({
  adminColorScheme: v.optional(v.string()),
  showAdminBar: v.optional(v.boolean()),
  editorMode: v.optional(v.union(v.literal("visual"), v.literal("code"))),
  emailDigest: v.optional(
    v.union(
      v.literal("immediate"),
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("none"),
    ),
  ),
  notifyOnComment: v.optional(v.boolean()),
  notifyOnReply: v.optional(v.boolean()),
  notifyOnMention: v.optional(v.boolean()),
});

/** Sort field options for user listing. */
export const userOrderByValidator = v.union(
  v.literal("displayName"),
  v.literal("email"),
  v.literal("createdAt"),
  v.literal("postCount"),
);

/** Sort direction. */
export const orderDirValidator = v.union(v.literal("asc"), v.literal("desc"));

// ─── Mutation Arg Validators ────────────────────────────────────────────────

/** Args for updating own profile (any authenticated user). */
export const updateProfileArgs = {
  nickname: v.optional(v.string()),
  displayName: v.optional(v.string()),
  bio: v.optional(v.string()),
  url: v.optional(v.string()),
  socialLinks: v.optional(socialLinksValidator),
  preferences: v.optional(preferencesValidator),
  locale: v.optional(v.string()),
  timezone: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  avatarMediaId: v.optional(v.id("media")),
};

/** Args for admin updating any user. Extends updateProfileArgs with admin-only fields. */
export const updateUserArgs = {
  userId: v.id("users"),
  nickname: v.optional(v.string()),
  displayName: v.optional(v.string()),
  bio: v.optional(v.string()),
  url: v.optional(v.string()),
  socialLinks: v.optional(socialLinksValidator),
  preferences: v.optional(preferencesValidator),
  locale: v.optional(v.string()),
  timezone: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  avatarMediaId: v.optional(v.id("media")),
  // Admin-only fields
  status: v.optional(userStatusValidator),
  roleId: v.optional(v.id("roles")),
  email: v.optional(v.string()),
};

/** Args for listing users (admin). */
export const listUsersArgs = {
  search: v.optional(v.string()),
  status: v.optional(userStatusValidator),
  roleId: v.optional(v.id("roles")),
  page: v.optional(v.number()),
  perPage: v.optional(v.number()),
  orderBy: v.optional(userOrderByValidator),
  orderDir: v.optional(orderDirValidator),
};

/** Args for getting a user. Supports lookup by ID, slug, or external user ID. */
export const getUserArgs = {
  userId: v.optional(v.id("users")),
  slug: v.optional(v.string()),
  externalAuthId: v.optional(v.string()),
};

/** Args for deleting a user. */
export const deleteUserArgs = {
  userId: v.id("users"),
  reassignTo: v.optional(v.id("users")),
  deleteContent: v.boolean(),
};

/** Args for deactivating a user. */
export const deactivateUserArgs = {
  userId: v.id("users"),
  reason: v.optional(v.string()),
};

/** Args for reactivating a user. */
export const reactivateUserArgs = {
  userId: v.id("users"),
};

/** Args for creating a user (admin). */
export const createUserArgs = {
  email: v.string(),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  displayName: v.optional(v.string()),
  roleId: v.optional(v.id("roles")),
  status: v.optional(userStatusValidator),
};

/** Args for uploading avatar. */
export const uploadAvatarArgs = {
  userId: v.optional(v.id("users")), // If omitted, updates current user
  storageId: v.string(), // Convex Storage ID from generateUploadUrl()
};

/** Args for removing avatar. */
export const removeAvatarArgs = {
  userId: v.optional(v.id("users")), // If omitted, updates current user
};

/** Args for bulk deleting users. */
export const bulkDeleteUsersArgs = {
  userIds: v.array(v.id("users")),
  reassignTo: v.optional(v.id("users")),
  deleteContent: v.boolean(),
};

/** Args for bulk changing user roles. */
export const bulkChangeRoleArgs = {
  userIds: v.array(v.id("users")),
  newRoleId: v.id("roles"),
};

/** Args for generate display name options. */
export const generateDisplayNameOptionsArgs = {
  userId: v.optional(v.id("users")),
};

// ─── Query Arg Validators ───────────────────────────────────────────────────

/** Args for getting a user by slug (public). */
export const getUserBySlugArgs = {
  slug: v.string(),
};

/** Args for user counts (admin dashboard). */
export const userCountsArgs = {};

// ─── Validation Constants ───────────────────────────────────────────────────

/** Maximum length for bio. */
export const MAX_BIO_LENGTH = 500;

/** Maximum length for nickname. */
export const MAX_NICKNAME_LENGTH = 100;

/** Maximum length for display name. */
export const MAX_DISPLAY_NAME_LENGTH = 200;

/** Default number of users per page. */
export const DEFAULT_PER_PAGE = 50;
