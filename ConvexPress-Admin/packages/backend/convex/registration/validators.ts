/**
 * Registration System - Convex Validators
 *
 * Shared argument validators for registration mutations and queries.
 * Used by both mutations.ts and queries.ts to ensure consistent
 * argument validation across the system.
 */

import { v } from "convex/values";

// ─── Status Validator ────────────────────────────────────────────────────────

/**
 * Validator for invitation status filter.
 */
export const invitationStatusValidator = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("expired"),
  v.literal("revoked"),
);

// ─── Role Validator ──────────────────────────────────────────────────────────

/**
 * Valid roles for invitation assignment.
 * Matches the WordPress-standard role slugs.
 */
export const VALID_ROLES = [
  "subscriber",
  "contributor",
  "author",
  "editor",
  "administrator",
] as const;

export type ValidRole = (typeof VALID_ROLES)[number];

/**
 * Check if a string is a valid role slug.
 */
export function isValidRole(role: string): role is ValidRole {
  return (VALID_ROLES as readonly string[]).includes(role);
}

// ─── Mutation Argument Validators ────────────────────────────────────────────

/**
 * Args for the inviteUser mutation.
 */
export const inviteUserArgs = {
  email: v.string(),
  role: v.string(),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  message: v.optional(v.string()),
  sendNotification: v.boolean(),
};

/**
 * Args for the resendInvitation mutation.
 */
export const resendInvitationArgs = {
  invitationId: v.id("invitations"),
};

/**
 * Args for the revokeInvitation mutation.
 */
export const revokeInvitationArgs = {
  invitationId: v.id("invitations"),
};

/**
 * Args for the bulkInvite mutation.
 */
export const bulkInviteArgs = {
  invitations: v.array(
    v.object({
      email: v.string(),
      role: v.string(),
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      message: v.optional(v.string()),
    }),
  ),
  sendNotification: v.boolean(),
};

/**
 * Args for the acceptInvitation mutation.
 */
export const acceptInvitationArgs = {
  token: v.string(),
  userId: v.id("users"),
};

// ─── Query Argument Validators ───────────────────────────────────────────────

/**
 * Args for the listInvitations query.
 */
export const listInvitationsArgs = {
  status: v.optional(invitationStatusValidator),
};

/**
 * Args for the getInvitation query.
 */
export const getInvitationArgs = {
  invitationId: v.id("invitations"),
};

/**
 * Args for the getByToken query.
 */
export const getByTokenArgs = {
  token: v.string(),
};

// ─── Internal Mutation Argument Validators ───────────────────────────────────

/**
 * Args for the createUserFromWorkOS internal mutation.
 */
export const createUserFromWorkOSArgs = {
  workosId: v.string(),
  email: v.string(),
  username: v.optional(v.string()),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  emailVerified: v.boolean(),
  oauthProvider: v.optional(v.string()),
};

/**
 * Args for the expireOldInvitations internal mutation.
 */
export const expireOldInvitationsArgs = {};

/**
 * Args for the cleanupExpiredInvitations internal mutation.
 */
export const cleanupExpiredInvitationsArgs = {};
