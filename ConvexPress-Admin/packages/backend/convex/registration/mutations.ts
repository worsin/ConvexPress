/**
 * Registration System - Public Mutations
 *
 * Client-callable mutations for invitation management:
 *
 *   - inviteUser: Admin creates an invitation (registration.invite capability)
 *   - resendInvitation: Resend invitation email with extended expiry (registration.invite)
 *   - revokeInvitation: Cancel a pending invitation (registration.invite)
 *   - bulkInvite: Create multiple invitations at once (registration.invite)
 *   - acceptInvitation: Link an accepted invitation to a newly created user
 *
 * Authorization:
 *   - Admin mutations require `registration.invite` capability (Administrator-only)
 *   - acceptInvitation requires authentication (any role)
 *
 * Events emitted:
 *   - registration.user_invited (via Event Dispatcher)
 */

import { mutation } from "../_generated/server";
import { ConvexError } from "convex/values";
import { requireCan, requireAuth } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import {
  generateInvitationToken,
  isValidEmail,
  findUserByEmail,
  findPendingInvitation,
  getRegistrationSettings,
} from "../helpers/registration";
import {
  inviteUserArgs,
  resendInvitationArgs,
  revokeInvitationArgs,
  bulkInviteArgs,
  acceptInvitationArgs,
  isValidRole,
} from "./validators";
import { SYSTEM, REGISTRATION_EVENTS } from "../events/constants";

// ─── Invite User ─────────────────────────────────────────────────────────────

/**
 * Create an invitation for a new user.
 *
 * WordPress equivalent: `Users > Add New` (but invitation-based instead of
 * creating the user immediately).
 *
 * Flow:
 *   1. Validate admin has registration.invite capability
 *   2. Validate email format and uniqueness
 *   3. Check for existing pending invitation
 *   4. Validate role slug
 *   5. Generate secure token
 *   6. Compute expiry from settings
 *   7. Insert invitation record
 *   8. Emit registration.user_invited event
 *
 * @returns The invitation ID and token
 */
export const inviteUser = mutation({
  args: inviteUserArgs,
  handler: async (ctx, args) => {
    // 1. Auth check - require registration.invite capability
    const admin = await requireCan(ctx, "registration.invite");

    // 2. Email validation
    const email = args.email.toLowerCase().trim();
    if (!isValidEmail(email)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Invalid email address format.",
      });
    }

    // 3. Check email not already registered
    const existingUser = await findUserByEmail(ctx, email);
    if (existingUser) {
      throw new ConvexError({
        code: "CONFLICT",
        message: `A user with email ${email} already exists.`,
      });
    }

    // 4. Check no pending invitation for this email
    const pendingInvitation = await findPendingInvitation(ctx, email);
    if (pendingInvitation) {
      throw new ConvexError({
        code: "CONFLICT",
        message: `An invitation for ${email} is already pending. Resend or revoke it first.`,
      });
    }

    // 5. Validate role
    if (!isValidRole(args.role)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Invalid role: ${args.role}`,
      });
    }

    // 6. Generate token
    const token = generateInvitationToken();

    // 7. Compute expiry
    const settings = await getRegistrationSettings(ctx);
    const expiryMs = settings.invitationExpiryDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const expiresAt = now + expiryMs;

    // 8. Insert invitation record
    const invitationId = await ctx.db.insert("invitations", {
      email,
      role: args.role,
      message: args.message,
      invitedBy: admin._id,
      status: "pending",
      token,
      expiresAt,
      createdAt: now,
      resentCount: 0,
    });

    // 9. Emit event
    await emitEvent(ctx, REGISTRATION_EVENTS.USER_INVITED, SYSTEM.REGISTRATION, {
      invitationId,
      email,
      role: args.role,
      invitedBy: admin._id,
      sendNotification: args.sendNotification,
      firstName: args.firstName ?? null,
      lastName: args.lastName ?? null,
      isResend: false,
    });

    return { invitationId, token };
  },
});

// ─── Resend Invitation ───────────────────────────────────────────────────────

/**
 * Resend an invitation email with an optionally extended expiry window.
 *
 * If the invitation has expired, the expiry is automatically extended.
 * Tracks resend count to prevent abuse (default max: 5).
 *
 * @returns void
 */
export const resendInvitation = mutation({
  args: resendInvitationArgs,
  handler: async (ctx, args) => {
    // 1. Auth check
    const admin = await requireCan(ctx, "registration.invite");

    // 2. Get invitation
    const invitation = await ctx.db.get("invitations", args.invitationId);
    if (!invitation) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Invitation not found.",
      });
    }

    // 3. Check status is pending (allow resend of expired invitations too)
    if (invitation.status !== "pending" && invitation.status !== "expired") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Cannot resend: invitation is ${invitation.status}.`,
      });
    }

    // 4. Check resend limit
    const settings = await getRegistrationSettings(ctx);
    if (invitation.resentCount >= settings.maxResendsPerInvitation) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Maximum resend limit (${settings.maxResendsPerInvitation}) reached. Revoke and create a new invitation.`,
      });
    }

    // 5. Generate new token and extend expiry.
    // Keep the old token valid for a 1-hour grace period so that
    // previously sent email links don't die immediately on resend.
    const now = Date.now();
    const expiryMs = settings.invitationExpiryDays * 24 * 60 * 60 * 1000;
    const newToken = generateInvitationToken();
    const GRACE_PERIOD_MS = 60 * 60 * 1000; // 1 hour

    // 6. Update invitation with new token, preserving old token with grace period
    await ctx.db.patch("invitations", args.invitationId, {
      previousToken: invitation.token,
      previousTokenExpiresAt: now + GRACE_PERIOD_MS,
      token: newToken,
      status: "pending", // Re-activate if expired
      expiresAt: now + expiryMs,
      resentAt: now,
      resentCount: invitation.resentCount + 1,
    });

    // 7. Emit event
    await emitEvent(ctx, REGISTRATION_EVENTS.USER_INVITED, SYSTEM.REGISTRATION, {
      invitationId: args.invitationId,
      email: invitation.email,
      role: invitation.role,
      invitedBy: admin._id,
      sendNotification: true,
      firstName: null,
      lastName: null,
      isResend: true,
    });
  },
});

// ─── Revoke Invitation ───────────────────────────────────────────────────────

/**
 * Cancel a pending invitation.
 *
 * Revocation is silent -- no email or notification is sent to the invitee.
 * The admin who revoked and the timestamp are recorded.
 *
 * @returns void
 */
export const revokeInvitation = mutation({
  args: revokeInvitationArgs,
  handler: async (ctx, args) => {
    // 1. Auth check
    const admin = await requireCan(ctx, "registration.invite");

    // 2. Get invitation
    const invitation = await ctx.db.get("invitations", args.invitationId);
    if (!invitation) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Invitation not found.",
      });
    }

    // 3. Check status is pending
    if (invitation.status !== "pending") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Cannot revoke: invitation is ${invitation.status}.`,
      });
    }

    // 4. Revoke
    await ctx.db.patch("invitations", args.invitationId, {
      status: "revoked",
      revokedAt: Date.now(),
      revokedBy: admin._id,
    });

    // No event emitted for revocations (silent operation per PRD)
  },
});

// ─── Bulk Invite ─────────────────────────────────────────────────────────────

/**
 * Create multiple invitations at once.
 *
 * Processes each invitation independently. Returns a results array
 * indicating success or failure for each email, so partial failures
 * don't block the entire batch.
 *
 * @returns Array of results with success/failure per email
 */
export const bulkInvite = mutation({
  args: bulkInviteArgs,
  handler: async (ctx, args) => {
    // 1. Auth check
    const admin = await requireCan(ctx, "registration.invite");

    const settings = await getRegistrationSettings(ctx);
    const expiryMs = settings.invitationExpiryDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const results: Array<{
      email: string;
      success: boolean;
      error?: string;
      invitationId?: string;
    }> = [];

    for (const invite of args.invitations) {
      const email = invite.email.toLowerCase().trim();

      // Validate email
      if (!isValidEmail(email)) {
        results.push({
          email,
          success: false,
          error: "Invalid email address format.",
        });
        continue;
      }

      // Validate role
      if (!isValidRole(invite.role)) {
        results.push({
          email,
          success: false,
          error: `Invalid role: ${invite.role}`,
        });
        continue;
      }

      // Check email not already registered
      const existingUser = await findUserByEmail(ctx, email);
      if (existingUser) {
        results.push({
          email,
          success: false,
          error: `A user with email ${email} already exists.`,
        });
        continue;
      }

      // Check no pending invitation
      const pendingInvitation = await findPendingInvitation(ctx, email);
      if (pendingInvitation) {
        results.push({
          email,
          success: false,
          error: `An invitation for ${email} is already pending.`,
        });
        continue;
      }

      // Generate token and create invitation
      const token = generateInvitationToken();
      const invitationId = await ctx.db.insert("invitations", {
        email,
        role: invite.role,
        message: invite.message,
        invitedBy: admin._id,
        status: "pending",
        token,
        expiresAt: now + expiryMs,
        createdAt: now,
        resentCount: 0,
      });

      // Emit event for each invitation
      await emitEvent(ctx, REGISTRATION_EVENTS.USER_INVITED, SYSTEM.REGISTRATION, {
        invitationId,
        email,
        role: invite.role,
        invitedBy: admin._id,
        sendNotification: args.sendNotification,
        firstName: invite.firstName ?? null,
        lastName: invite.lastName ?? null,
        isResend: false,
      });

      results.push({
        email,
        success: true,
        invitationId: invitationId as string,
      });
    }

    return results;
  },
});

// ─── Accept Invitation ───────────────────────────────────────────────────────

/**
 * Mark an invitation as accepted and link it to the created user.
 *
 * Called after a user has completed signup and their Convex
 * user record has been created. Links the invitation to the user
 * for audit trail purposes.
 *
 * Note: In the normal flow, `handleExternalAuthUserCreated` (internal mutation)
 * handles invitation matching automatically. This public mutation is
 * available as a fallback for manual linking.
 *
 * @returns void
 */
export const acceptInvitation = mutation({
  args: acceptInvitationArgs,
  handler: async (ctx, args) => {
    // 1. Auth check - require authenticated user
    const authenticatedUser = await requireAuth(ctx);

    // 2. Verify the userId matches the authenticated user
    if (args.userId !== authenticatedUser._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message:
          "Cannot accept invitation on behalf of another user.",
      });
    }

    // 3. Look up invitation by token (also check previousToken during grace period)
    const now = Date.now();
    let invitation = await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    // If not found by current token, check previousToken within grace period
    if (!invitation) {
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

    if (!invitation) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Invitation not found.",
      });
    }

    if (invitation.status !== "pending") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Cannot accept: invitation is ${invitation.status}.`,
      });
    }

    // Check if expired
    if (invitation.expiresAt < now) {
      // Mark as expired first
      await ctx.db.patch("invitations", invitation._id, { status: "expired" });
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "This invitation has expired.",
      });
    }

    // Mark as accepted
    await ctx.db.patch("invitations", invitation._id, {
      status: "accepted",
      acceptedBy: args.userId,
      acceptedAt: Date.now(),
    });
  },
});
