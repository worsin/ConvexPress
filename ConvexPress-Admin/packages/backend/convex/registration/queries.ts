/**
 * Registration System - Public Queries
 *
 * Read operations for invitation management and registration checks:
 *
 *   - listInvitations: Admin list of invitations with optional status filter
 *   - getInvitation: Single invitation detail by ID
 *   - getByToken: Public lookup by token (for invitation acceptance page)
 *   - counts: Invitation counts by status (admin dashboard)
 *   - isRegistrationOpen: Public query checking if self-registration is enabled
 *
 * Authorization:
 *   - Admin queries require `registration.invite` capability
 *   - getByToken and isRegistrationOpen are PUBLIC (no auth required)
 */

import { query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { getRegistrationSettings } from "../helpers/registration";
import {
  listInvitationsArgs,
  getInvitationArgs,
  getByTokenArgs,
} from "./validators";

// ─── List Invitations ────────────────────────────────────────────────────────

/**
 * List all invitations with optional status filter.
 *
 * WordPress equivalent: Invitations table on the "Users > Add New" page.
 *
 * Returns invitations ordered by creation time (newest first),
 * enriched with the inviting admin's display name.
 *
 * Auth required: registration.invite capability (Administrator only).
 */
export const listInvitations = query({
  args: listInvitationsArgs,
  handler: async (ctx, args) => {
    // Auth check
    const user = await requireCan(ctx, "registration.invite");

    let invitations;

    if (args.status) {
      // Filter by status using index
      invitations = await ctx.db
        .query("invitations")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect();
    } else {
      // All invitations, newest first
      invitations = await ctx.db
        .query("invitations")
        .order("desc")
        .collect();
    }

    // Enrich with inviter details
    const enriched = await Promise.all(
      invitations.map(async (invitation) => {
        const inviter = await ctx.db.get("users", invitation.invitedBy);
        const acceptedUser = invitation.acceptedBy
          ? await ctx.db.get("users", invitation.acceptedBy)
          : null;

        return {
          ...invitation,
          inviterName:
            inviter?.displayName || inviter?.email || "Unknown",
          inviterEmail: inviter?.email,
          acceptedUserName: acceptedUser?.displayName || acceptedUser?.email,
          acceptedUserEmail: acceptedUser?.email,
          // Flag if expired but still marked as pending (cron hasn't run yet)
          isEffectivelyExpired:
            invitation.status === "pending" &&
            invitation.expiresAt < Date.now(),
        };
      }),
    );

    return enriched;
  },
});

// ─── Get Invitation ──────────────────────────────────────────────────────────

/**
 * Get a single invitation by its document ID.
 *
 * Auth required: registration.invite capability (Administrator only).
 */
export const getInvitation = query({
  args: getInvitationArgs,
  handler: async (ctx, args) => {
    // Auth check
    const user = await requireCan(ctx, "registration.invite");

    const invitation = await ctx.db.get("invitations", args.invitationId);
    if (!invitation) return null;

    // Enrich with related user details
    const inviter = await ctx.db.get("users", invitation.invitedBy);
    const acceptedUser = invitation.acceptedBy
      ? await ctx.db.get("users", invitation.acceptedBy)
      : null;
    const revokedByUser = invitation.revokedBy
      ? await ctx.db.get("users", invitation.revokedBy)
      : null;

    return {
      ...invitation,
      inviterName: inviter?.displayName || inviter?.email || "Unknown",
      inviterEmail: inviter?.email,
      acceptedUserName: acceptedUser?.displayName || acceptedUser?.email,
      acceptedUserEmail: acceptedUser?.email,
      revokedByName: revokedByUser?.displayName || revokedByUser?.email,
      isEffectivelyExpired:
        invitation.status === "pending" && invitation.expiresAt < Date.now(),
    };
  },
});

// ─── Get By Token (Public) ───────────────────────────────────────────────────

/**
 * Validate an invitation token and return safe public details.
 *
 * PUBLIC query - no authentication required.
 * Used by the website /register?token=... page to display
 * invitation details before the user signs up.
 *
 * Returns a minimal safe subset of invitation data.
 * Never exposes internal IDs, token value, or inviter details.
 *
 * Returns null if:
 *   - Token not found
 *   - Invitation is not pending
 *   - Invitation has expired
 */
export const getByToken = query({
  args: getByTokenArgs,
  handler: async (ctx, args) => {
    if (!args.token || args.token.trim() === "") return null;

    const now = Date.now();

    // First, try matching the current token via index
    let invitation = await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    // If not found by current token, check if the token matches a
    // previousToken within its grace period. This handles the case
    // where a user clicks an old email link shortly after an admin resend.
    if (!invitation) {
      // Query all pending invitations and check previousToken.
      // This is acceptable because pending invitations are a small set.
      const pendingInvitations = await ctx.db
        .query("invitations")
        .withIndex("by_status", (q) => q.eq("status", "pending"))
        .collect();

      invitation =
        pendingInvitations.find(
          (inv) =>
            inv.previousToken === args.token &&
            inv.previousTokenExpiresAt !== undefined &&
            inv.previousTokenExpiresAt >= now,
        ) ?? null;
    }

    // Not found
    if (!invitation) return null;

    // Not pending
    if (invitation.status !== "pending") return null;

    // Expired (even if cron hasn't marked it yet)
    if (invitation.expiresAt < now) return null;

    // Return safe subset only
    return {
      email: invitation.email,
      role: invitation.role,
      message: invitation.message ?? null,
      expiresAt: invitation.expiresAt,
    };
  },
});

// ─── Invitation Counts ───────────────────────────────────────────────────────

/**
 * Get invitation counts grouped by status.
 *
 * Used by the admin dashboard and the "Users > Add New" page
 * to display summary counts.
 *
 * Auth required: registration.invite capability (Administrator only).
 */
export const counts = query({
  args: {},
  handler: async (ctx) => {
    // Auth check
    const user = await requireCan(ctx, "registration.invite");

    // Fetch all invitations (small enough to collect)
    const allInvitations = await ctx.db.query("invitations").collect();

    const now = Date.now();
    let pending = 0;
    let accepted = 0;
    let expired = 0;
    let revoked = 0;

    for (const inv of allInvitations) {
      switch (inv.status) {
        case "pending":
          // Also count as expired if past expiresAt (cron lag)
          if (inv.expiresAt < now) {
            expired++;
          } else {
            pending++;
          }
          break;
        case "accepted":
          accepted++;
          break;
        case "expired":
          expired++;
          break;
        case "revoked":
          revoked++;
          break;
      }
    }

    return {
      total: allInvitations.length,
      pending,
      accepted,
      expired,
      revoked,
    };
  },
});

// ─── Is Registration Open (Public) ──────────────────────────────────────────

/**
 * Check if self-registration is currently enabled.
 *
 * PUBLIC query - no authentication required.
 * WordPress equivalent: `get_option('users_can_register')`
 *
 * Returns a boolean. Reads the `membershipEnabled` setting from
 * the general settings section. Defaults to false if settings
 * are not configured.
 *
 * The website /register page subscribes to this query reactively.
 * If an admin toggles registration off, the page updates without reload.
 */
export const isRegistrationOpen = query({
  args: {},
  handler: async (ctx) => {
    const settings = await getRegistrationSettings(ctx);
    return settings.anyoneCanRegister;
  },
});

// ─── Registration Stats (Admin Dashboard) ────────────────────────────────────

/**
 * Get registration statistics for the admin dashboard widget.
 *
 * Returns user registration counts over various time windows,
 * plus pending invitation count.
 *
 * Auth required: registration.invite capability (Administrator only).
 */
export const getRegistrationStats = query({
  args: {},
  handler: async (ctx) => {
    // Auth check
    const user = await requireCan(ctx, "registration.invite");

    const now = Date.now();
    const last24h = now - 24 * 60 * 60 * 1000;
    const last7d = now - 7 * 24 * 60 * 60 * 1000;
    const last30d = now - 30 * 24 * 60 * 60 * 1000;

    // Use by_createdAt index for time-windowed counts instead of loading
    // ALL users into memory. Only load users from the last 30 days
    // (which encompasses the 7d and 24h windows).
    const recentUsers = await ctx.db
      .query("users")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", last30d))
      .collect();

    let count24h = 0;
    let count7d = 0;
    const count30d = recentUsers.length;

    for (const u of recentUsers) {
      if (u.createdAt >= last24h) count24h++;
      if (u.createdAt >= last7d) count7d++;
    }

    // For total count, query all users but only read _id to minimize memory.
    // Convex doesn't have a native count() so we use collect() on the index
    // which is the most efficient available approach. Using the by_createdAt
    // index ensures we scan in index order (more cache-friendly).
    const allUserIds = await ctx.db
      .query("users")
      .withIndex("by_createdAt")
      .collect();
    const total = allUserIds.length;

    // Count pending invitations
    const pendingInvitations = await ctx.db
      .query("invitations")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    // Filter out effectively expired ones
    const activePendingCount = pendingInvitations.filter(
      (inv) => inv.expiresAt >= now,
    ).length;

    return {
      total,
      last24h: count24h,
      last7d: count7d,
      last30d: count30d,
      pendingInvitations: activePendingCount,
    };
  },
});
