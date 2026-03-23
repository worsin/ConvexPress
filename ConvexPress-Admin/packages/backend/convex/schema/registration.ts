import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Registration System - Schema
 *
 * One table:
 *   - invitations: Admin-created invitation records for user onboarding
 *
 * The Registration System bridges WorkOS authentication identity with
 * Convex application user records. It handles:
 *   - Self-registration (when enabled via settings)
 *   - Invitation-based registration (admin creates, user accepts)
 *   - OAuth registration (via WorkOS providers)
 *
 * The `users` table is owned by the User Profile System.
 * This system creates user records in that table via the
 * `createUserFromWorkOS` internal mutation (called by webhook handler).
 *
 * Invitation lifecycle: pending -> accepted | expired | revoked
 */
export const registrationTables = {
  invitations: defineTable({
    // === Invitation Details ===
    email: v.string(), // Email address invited
    role: v.string(), // Role slug to assign on acceptance (e.g., "subscriber")
    message: v.optional(v.string()), // Optional personal message from admin

    // === Tracking ===
    invitedBy: v.id("users"), // Admin who created the invitation
    status: v.union(
      v.literal("pending"), // Invitation sent, not yet accepted
      v.literal("accepted"), // User completed signup
      v.literal("expired"), // Invitation expired (configurable TTL)
      v.literal("revoked"), // Admin manually revoked
    ),
    token: v.string(), // Unique invitation token (URL-safe, cryptographically random)
    previousToken: v.optional(v.string()), // Previous token (valid during grace period after resend)
    previousTokenExpiresAt: v.optional(v.number()), // Grace period expiry for previous token (1 hour after resend)
    expiresAt: v.number(), // Unix timestamp when invitation expires

    // === Resolution ===
    acceptedBy: v.optional(v.id("users")), // User who accepted (after signup)
    acceptedAt: v.optional(v.number()), // When invitation was accepted
    revokedAt: v.optional(v.number()), // When invitation was revoked
    revokedBy: v.optional(v.id("users")), // Admin who revoked

    // === Timestamps ===
    createdAt: v.number(),
    resentAt: v.optional(v.number()), // Last time invitation was resent
    resentCount: v.number(), // Number of times resent (max configurable, default 5)
  })
    .index("by_email", ["email"])
    .index("by_token", ["token"])
    .index("by_status", ["status"])
    .index("by_invitedBy", ["invitedBy"])
    .index("by_expiresAt", ["expiresAt"]),
};
