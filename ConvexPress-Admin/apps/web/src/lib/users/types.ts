/**
 * User Profile System - Frontend TypeScript Types
 *
 * Types matching the Convex schema for users.
 * Used by all admin components, hooks, and routes dealing with users.
 */

import type { Id } from "@backend/convex/_generated/dataModel";

// --- User Status ---

export type UserStatus = "active" | "inactive" | "banned";

// --- Social Links ---

export interface SocialLinks {
  twitter?: string;
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  youtube?: string;
  github?: string;
  website?: string;
}

// --- User Preferences ---

export interface UserPreferences {
  adminColorScheme?: string;
  showAdminBar?: boolean;
  editorMode?: "visual" | "code";
  emailDigest?: "immediate" | "daily" | "weekly" | "none";
  notifyOnComment?: boolean;
  notifyOnReply?: boolean;
  notifyOnMention?: boolean;
}

// --- User Document ---

/** The user document as returned from Convex queries. */
export interface User {
  _id: Id<"users">;
  _creationTime: number;

  // Auth identity fields (read-only)
  authIdentifier: string;
  email: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  phone?: string;
  profilePictureUrl?: string;

  // SmithHarper-managed fields
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
  socialLinks?: SocialLinks;

  // Role
  roleId?: Id<"roles">;

  // Account status
  status: UserStatus;
  deactivatedAt?: number;
  deactivatedBy?: Id<"users">;

  // Preferences
  preferences?: UserPreferences;

  // Locale
  locale?: string;
  timezone?: string;

  // Denormalized counts
  postCount?: number;
  commentCount?: number;

  // Metadata
  lastLoginAt?: number;

  // Password management
  lastPasswordChangedAt?: number;
  passwordResetRequestedAt?: number;
  passwordResetCount?: number;

  // Legacy
  internalRole?: string;
  isInternal?: boolean;

  // Timestamps
  createdAt: number;
  updatedAt: number;
}

// --- User With Resolved Fields ---

/** User document enriched with resolved avatar URL and role info (from listUsers query). */
export interface UserWithRole extends User {
  resolvedAvatarUrl: string | null;
  roleName?: string;
  roleLevel?: number;
}

/** Public-only user fields (for non-admin views). */
export interface UserPublic {
  _id: Id<"users">;
  displayName?: string;
  slug?: string;
  bio?: string;
  avatarUrl: string | null;
  url?: string;
  socialLinks?: SocialLinks;
  postCount: number;
  status: UserStatus;
}

// --- Query Results ---

/** Paginated user list result from profiles.queries.listUsers. */
export interface UserListResult {
  users: UserWithRole[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

/** Status counts from profiles.queries.counts. */
export interface UserCounts {
  total: number;
  active: number;
  inactive: number;
  banned: number;
}
