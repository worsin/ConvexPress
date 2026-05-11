/**
 * User Profile System - Shared TypeScript types.
 *
 * These are lightweight TS-only types used to keep profile-layer code readable
 * and to avoid repeating the same nested object shapes across backend modules.
 */

export type UserStatus = "active" | "inactive" | "banned";

export interface SocialLinks {
  twitter?: string;
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  youtube?: string;
  github?: string;
  website?: string;
}

export interface UserPreferences {
  adminColorScheme?: string;
  showAdminBar?: boolean;
  editorMode?: "visual" | "code";
  emailDigest?: "immediate" | "daily" | "weekly" | "none";
  notifyOnComment?: boolean;
  notifyOnReply?: boolean;
  notifyOnMention?: boolean;
}
