/**
 * User Profile System - Frontend Constants
 *
 * Status labels, role display mappings, and default values.
 */

import type { UserStatus } from "./types";

// --- User Status Labels ---

export const USER_STATUSES: UserStatus[] = ["active", "inactive", "banned"];

export const STATUS_LABELS: Record<UserStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  banned: "Banned",
};

// --- Validation Constants (matching backend validators) ---

export const MAX_BIO_LENGTH = 500;
export const MAX_NICKNAME_LENGTH = 100;
export const MAX_DISPLAY_NAME_LENGTH = 200;
export const DEFAULT_PER_PAGE = 50;

// --- Avatar Helpers (client-side) ---

/**
 * Resolve the effective avatar URL following the priority chain:
 *   1. Custom upload (avatarUrl) -- highest priority
 *   2. OAuth provider (profilePictureUrl)
 *   3. null (client should render initials)
 */
export function resolveAvatarUrl(user: {
  avatarUrl?: string;
  profilePictureUrl?: string;
  resolvedAvatarUrl?: string | null;
}): string | null {
  // Use pre-resolved URL if available (from query enrichment)
  if (user.resolvedAvatarUrl !== undefined) return user.resolvedAvatarUrl;
  if (user.avatarUrl) return user.avatarUrl;
  if (user.profilePictureUrl) return user.profilePictureUrl;
  return null;
}

/**
 * Generate 1-2 character initials from a display name.
 */
export function getInitials(displayName: string | undefined | null): string {
  if (!displayName || !displayName.trim()) return "?";
  const parts = displayName.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0]!.charAt(0).toUpperCase();
  }
  return (
    parts[0]!.charAt(0).toUpperCase() +
    parts[parts.length - 1]!.charAt(0).toUpperCase()
  );
}

/**
 * Format a timestamp as a human-readable date string.
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a timestamp as a relative time string (e.g., "2 hours ago").
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 30) return formatDate(timestamp);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "Just now";
}
