/**
 * Registration System - Internal Functions
 *
 * Functions that are NOT callable from the client. Used for:
 *   - External auth webhook handling (user creation from webhook)
 *   - Invitation expiration (cron job)
 *   - Invitation cleanup (old expired records)
 *
 * Internal functions:
 *   - handleExternalAuthUserCreated: Creates Convex user record from external auth webhook
 *   - expireOldInvitations: Cron handler to expire invitations past their expiresAt
 *   - cleanupExpiredInvitations: Delete expired invitations older than 90 days
 *
 * These are called by:
 *   - The auth webhook HTTP endpoint (convex/http.ts)
 *   - The cron scheduler (convex/crons.ts)
 */

import {
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  generateUsernameFromEmail,
  ensureUniqueUsername,
  getRegistrationSettings,
  getDefaultRoleDoc,
  normalizeRegistrationEmail,
  normalizeRegistrationName,
  normalizeRegistrationUsername,
} from "../helpers/registration";
import {
  MAX_CLERK_URL_LENGTH,
  normalizeClerkUserId,
  normalizeOptionalString,
} from "../auth/inputLimits";
import {
  generateSlug,
  ensureUniqueSlug,
  generateDisplayName,
} from "../helpers/profile";
import { emitEvent } from "../helpers/events";
import { SYSTEM, REGISTRATION_EVENTS } from "../events/constants";
import {
  createUserFromExternalAuthArgs,
  expireOldInvitationsArgs,
  cleanupExpiredInvitationsArgs,
} from "./validators";

// ─── Handle External Auth User Created ───────────────────────────────────────

/**
 * Create a Convex user record from an external auth webhook event.
 *
 * This is the bridge between external authentication identity (Clerk)
 * and the ConvexPress application user record. It handles:
 *
 *   1. Idempotency (webhook retries won't create duplicate users)
 *   2. Invitation matching (assigns invited role if invitation exists)
 *   3. Self-registration gate (rejects if closed and no invitation)
 *   4. OAuth registration (detects OAuth provider)
 *   5. Username generation (from email or provided value)
 *   6. Display name and slug generation
 *   7. Default role assignment
 *   8. Event emission (registration.user_registered)
 *
 * WordPress equivalent: wp_create_user() + wp_insert_user() + register_new_user hook
 *
 * @returns The Convex user ID of the created (or existing) user
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const handleExternalAuthUserCreated = internalMutation({
  args: createUserFromExternalAuthArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const now = Date.now();
    const externalAuthId = normalizeClerkUserId(args.externalAuthId);
    const email = normalizeRegistrationEmail(args.email);
    if (!externalAuthId || !email) {
      throw new Error("Invalid external auth user payload.");
    }
    const firstName = normalizeRegistrationName(args.firstName);
    const lastName = normalizeRegistrationName(args.lastName);
    const avatarUrl = normalizeOptionalString(args.avatarUrl, MAX_CLERK_URL_LENGTH);
    const usernameArg = normalizeRegistrationUsername(args.username);
    const oauthProvider = normalizeOptionalString(args.oauthProvider, 64);

    // ─── 1. Idempotency Guard ──────────────────────────────────────────
    // Webhooks may retry. Never create duplicate user records.
    // Check by clerkUserId first, then by email.
    const existingByClerk = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q: ConvexQueryBuilder) =>
        q.eq("clerkUserId", externalAuthId),
      )
      .unique();

    if (existingByClerk) {
      return existingByClerk._id;
    }

    // Also check by email to prevent duplicate accounts
    const existingByEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q: ConvexQueryBuilder) => q.eq("email", email))
      .first();

    if (existingByEmail) {
      return existingByEmail._id;
    }

    // ─── 2. Invitation Matching ────────────────────────────────────────
    const pendingInvitations = await ctx.db
      .query("invitations")
      .withIndex("by_email", (q: ConvexQueryBuilder) => q.eq("email", email))
      .collect();

    const matchedInvitation = pendingInvitations.find(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      (inv) =>
        inv.status === "pending" && inv.expiresAt >= now,
    );

    // ─── 3. Determine Registration Method & Role ───────────────────────
    let registrationMethod: "self" | "invite" | "oauth" | "import";
    let roleId: Id<"roles"> | undefined;
    let invitedBy: Id<"users"> | undefined;
    const settings = await getRegistrationSettings(ctx);

    if (matchedInvitation) {
      // Invitation-based registration
      registrationMethod = "invite";
      invitedBy = matchedInvitation.invitedBy;

      // Look up the role by slug from the invitation
      const invitedRole = await ctx.db
        .query("roles")
        .withIndex("by_slug", (q: ConvexQueryBuilder) => q.eq("slug", matchedInvitation.role))
        .unique();

      if (invitedRole) {
        roleId = invitedRole._id;
      }
    } else {
      // OAuth and email/password signups are both public self-registration
      // unless a live invitation matched the email.
      if (!settings.anyoneCanRegister) {
        throw new Error("User registration is currently not allowed.");
      }
      registrationMethod = oauthProvider ? "oauth" : "self";
    }

    // If no role from invitation, use the default role
    if (!roleId) {
      const defaultRoleDoc = await getDefaultRoleDoc(ctx);
      if (defaultRoleDoc) {
        roleId = defaultRoleDoc._id;
      }
    }

    // ─── 4. Username Generation ────────────────────────────────────────
    const baseUsername = usernameArg
      ? usernameArg.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60) || generateUsernameFromEmail(email)
      : generateUsernameFromEmail(email);
    const username = await ensureUniqueUsername(ctx, baseUsername);

    // ─── 5. Display Name & Slug ────────────────────────────────────────
    const displayName = generateDisplayName(
      firstName,
      lastName,
      email,
      username,
    );
    const baseSlug = generateSlug(displayName);
    const slug = await ensureUniqueSlug(ctx, baseSlug);

    // ─── 6. Create User Record ─────────────────────────────────────────
    const userId = await ctx.db.insert("users", {
      // External auth fields
      authSource: "clerk",
      clerkUserId: externalAuthId,
      email,
      emailVerified: args.emailVerified,
      firstName,
      lastName,
      profilePictureUrl: avatarUrl,

      // ConvexPress-managed fields
      username,
      displayName,
      slug,

      // Role
      roleId,

      // Registration metadata (PRD-specified fields)
      registrationMethod,
      invitedBy,
      registeredAt: now,
      emailVerifiedAt: args.emailVerified ? now : undefined,

      // Account status
      status: "active",
      clerkProvisioningStatus: "provisioned",
      clerkProvisioningSource: "clerk_session",
      clerkProvisioningReason: "registration_external_auth",
      clerkProvisionedAt: now,
      clerkProvisioningAttemptedAt: now,

      // Timestamps
      createdAt: now,
      updatedAt: now,
    });

    // ─── 7. Mark Invitation as Accepted ────────────────────────────────
    if (matchedInvitation) {
      await ctx.db.patch("invitations", matchedInvitation._id, {
        status: "accepted",
        acceptedBy: userId,
        acceptedAt: now,
      });
    }

    // ─── 8. Emit Registration Event ────────────────────────────────────
    await emitEvent(ctx, REGISTRATION_EVENTS.USER_REGISTERED, SYSTEM.REGISTRATION, {
      userId,
      email,
      role: matchedInvitation?.role ?? settings.defaultRole,
      registrationMethod,
      invitedBy: invitedBy ?? null,
      oauthProvider: oauthProvider ?? null,
    });

    return userId;
  },
});

// ─── Expire Old Invitations (Cron) ──────────────────────────────────────────

/**
 * Expire all pending invitations that have passed their expiresAt timestamp.
 *
 * Designed to be called by a daily cron job (03:00 UTC recommended).
 * Even though queries check expiresAt at read time, this cron updates
 * the status field so the admin list table shows accurate statuses.
 *
 * @returns Object with count of expired invitations
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const expireOldInvitations = internalMutation({
  args: expireOldInvitationsArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    const now = Date.now();

    // Get all pending invitations
    const pendingInvitations = await ctx.db
      .query("invitations")
      .withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", "pending"))
      .collect();

    let expiredCount = 0;

    for (const invitation of pendingInvitations) {
      if (invitation.expiresAt < now) {
        await ctx.db.patch("invitations", invitation._id, {
          status: "expired",
        });
        expiredCount++;
      }
    }

    return { expired: expiredCount };
  },
});

// ─── Cleanup Expired Invitations ─────────────────────────────────────────────

/**
 * Delete expired invitations older than 90 days.
 *
 * Housekeeping function to prevent the invitations table from growing
 * indefinitely. Only deletes invitations in "expired" or "revoked" status
 * that were created more than 90 days ago.
 *
 * Can be scheduled as a weekly or monthly cron job.
 *
 * @returns Object with count of deleted invitations
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const cleanupExpiredInvitations = internalMutation({
  args: cleanupExpiredInvitationsArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;

    // Get expired invitations
    const expiredInvitations = await ctx.db
      .query("invitations")
      .withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", "expired"))
      .collect();

    // Get revoked invitations
    const revokedInvitations = await ctx.db
      .query("invitations")
      .withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", "revoked"))
      .collect();

    let deletedCount = 0;

    // Delete old expired invitations
    for (const invitation of expiredInvitations) {
      if (invitation.createdAt < ninetyDaysAgo) {
        await ctx.db.delete("invitations", invitation._id);
        deletedCount++;
      }
    }

    // Delete old revoked invitations
    for (const invitation of revokedInvitations) {
      if (invitation.createdAt < ninetyDaysAgo) {
        await ctx.db.delete("invitations", invitation._id);
        deletedCount++;
      }
    }

    return { deleted: deletedCount };
  },
});

// ─── Lookup Helpers ──────────────────────────────────────────────────────────

/**
 * Get a pending invitation by email address (internal lookup).
 *
 * Used by other internal systems that need to check if an email
 * has a pending invitation without going through the public query.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getPendingByEmail = internalQuery({
  args: {
    email: v.string(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();

    const invitations = await ctx.db
      .query("invitations")
      .withIndex("by_email", (q: ConvexQueryBuilder) => q.eq("email", email))
      .collect();

    return (
      invitations.find(
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        (inv) =>
          inv.status === "pending" && inv.expiresAt >= Date.now(),
      ) ?? null
    );
  },
});
