import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import {
  MAX_CLERK_NAME_LENGTH,
  MAX_CLERK_URL_LENGTH,
  MAX_USERNAME_LENGTH,
  deriveClerkSlug,
  normalizeClerkUserId,
  normalizeEmail,
  normalizeOptionalString,
} from "./inputLimits";

/**
 * Upsert a user from a Clerk webhook event.
 *
 * Resolution order:
 *   1. Match by clerkUserId (existing linked user) → update profile
 *   2. Match by email (imported user, e.g. from WooCommerce) with no clerkUserId → link accounts
 *   3. Match by email with a different clerkUserId → log warning, skip to avoid clobbering
 *   4. No match → create a new user
 *
 * The email-based fallback is critical for customer continuity: when a
 * WooCommerce customer is imported ahead of time and later signs in via
 * Clerk on the new site, this links their Clerk identity to the pre-existing
 * user record so they see all their imported orders, downloads, and licenses.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const upsertClerkUser = internalMutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    firstName: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    lastName: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    profilePictureUrl: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    username: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const now = Date.now();
    const clerkUserId = normalizeClerkUserId(args.clerkUserId);
    const normalizedEmail = normalizeEmail(args.email);
    if (!clerkUserId || !normalizedEmail) return;

    const firstName = normalizeOptionalString(
      args.firstName,
      MAX_CLERK_NAME_LENGTH,
    );
    const lastName = normalizeOptionalString(
      args.lastName,
      MAX_CLERK_NAME_LENGTH,
    );
    const profilePictureUrl = normalizeOptionalString(
      args.profilePictureUrl,
      MAX_CLERK_URL_LENGTH,
    );
    const username = normalizeOptionalString(args.username, MAX_USERNAME_LENGTH);

    // 1. Try to find by clerkUserId first
    const byClerkId = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q: ConvexQueryBuilder) => q.eq("clerkUserId", clerkUserId))
      .unique();

    if (byClerkId) {
      await ctx.db.patch(byClerkId._id, {
        email: normalizedEmail,
        firstName,
        lastName,
        profilePictureUrl,
        clerkProvisioningStatus: "provisioned",
        clerkProvisioningSource: "clerk_webhook",
        clerkProvisioningReason: "webhook_user_update",
        clerkProvisionedAt: now,
        clerkProvisioningAttemptedAt: now,
        updatedAt: now,
      });
      return;
    }

    // 2. Fallback: try to find an imported/unlinked user by email
    const byEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q: ConvexQueryBuilder) => q.eq("email", normalizedEmail))
      .unique();

    if (byEmail) {
      if (!byEmail.clerkUserId) {
        // Link the existing imported user to this Clerk identity
        const patch: Record<string, unknown> = {
          clerkUserId,
          authSource: "clerk",
          emailVerified: true,
          clerkProvisioningStatus: "linked_existing",
          clerkProvisioningSource: "clerk_webhook",
          clerkProvisioningReason: "webhook_email_match",
          clerkProvisionedAt: now,
          clerkProvisioningAttemptedAt: now,
          updatedAt: now,
        };
        // Only override name/picture if Clerk provided values and the record doesn't already have them
        if (firstName && !byEmail.firstName) patch.firstName = firstName;
        if (lastName && !byEmail.lastName) patch.lastName = lastName;
        if (profilePictureUrl && !byEmail.profilePictureUrl) {
          patch.profilePictureUrl = profilePictureUrl;
        }
        await ctx.db.patch(byEmail._id, patch);
        return;
      }

      if (byEmail.clerkUserId !== clerkUserId) {
        console.warn(
          `[ClerkSync] Email ${normalizedEmail} is already linked to a different Clerk user ` +
            `(existing: ${byEmail.clerkUserId}, incoming: ${clerkUserId}). Skipping to avoid clobber.`
        );
        return;
      }
    }

    // 3. No match — create a new user
    const subscriberRole = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q: ConvexQueryBuilder) => q.eq("slug", "subscriber"))
      .unique();

    await ctx.db.insert("users", {
      authSource: "clerk",
      clerkUserId,
      email: normalizedEmail,
      emailVerified: true,
      firstName,
      lastName,
      profilePictureUrl,
      username,
      displayName: [firstName, lastName].filter(Boolean).join(" ") || normalizedEmail,
      slug: deriveClerkSlug({ email: normalizedEmail, username }),
      status: "active",
      roleId: subscriberRole?._id,
      registrationMethod: "self",
      clerkProvisioningStatus: "provisioned",
      clerkProvisioningSource: "clerk_webhook",
      clerkProvisioningReason: "webhook_user_created",
      clerkProvisionedAt: now,
      clerkProvisioningAttemptedAt: now,
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const deleteClerkUser = internalMutation({
  args: { clerkUserId: v.string() },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const clerkUserId = normalizeClerkUserId(args.clerkUserId);
    if (!clerkUserId) return;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q: ConvexQueryBuilder) => q.eq("clerkUserId", clerkUserId))
      .unique();

    if (user) {
      await ctx.db.patch(user._id, {
        status: "inactive",
        deactivatedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});
